import json
import time
from google import genai
from google.genai import types
from google.genai.errors import ServerError, ClientError
from app.config import GEMINI_API_KEY, GEMINI_MODEL, EMBED_MODEL

client = genai.Client(api_key=GEMINI_API_KEY)

FALLBACK_MODELS = [GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.7-flash"]


def embed(text: str) -> list[float]:
    res = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return list(res.embeddings[0].values)


def generate_json(prompt: str) -> dict:
    last_error = None
    for model in dict.fromkeys(FALLBACK_MODELS):  # unique, keeps order
        for attempt in range(2):
            try:
                res = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json"),
                )
                return json.loads(res.text)
            except (ServerError, ClientError) as e:
                last_error = e
                code = getattr(e, "code", None)
                if code in (429, 503, 500):
                    time.sleep(2 * (attempt + 1))
                    continue
                break  # other errors: try the next model
    raise RuntimeError(f"All Gemini models failed: {last_error}")

def embed_many(texts: list[str]) -> list[list[float]]:
    out = []
    for i in range(0, len(texts), 50):
        res = client.models.embed_content(
            model=EMBED_MODEL,
            contents=texts[i:i + 50],
            config=types.EmbedContentConfig(output_dimensionality=768),
        )
        out.extend([list(e.values) for e in res.embeddings])
    return out
