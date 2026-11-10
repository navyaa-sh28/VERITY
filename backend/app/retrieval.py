from app.db import supabase
from app.gemini_client import embed


def retrieve(query: str, k: int = 5):
    vec = embed(query)
    res = supabase.rpc("match_chunks", {"query_embedding": vec, "match_count": k}).execute()
    return res.data
