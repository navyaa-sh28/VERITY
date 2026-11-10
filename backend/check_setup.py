from app.gemini_client import embed, generate_json
from app.db import supabase

print("Embedding length:", len(embed("hello")))
print("Gemini JSON:", generate_json('Reply with JSON: {"ok": true}'))
print("Profiles rows:", supabase.table("profiles").select("*").limit(1).execute().data)
