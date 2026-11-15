import re
from uuid import uuid4
from app.config import SUPABASE_URL
from app.db import supabase

BUCKET = "uploads"


def upload_bytes(folder, filename, data, content_type=None):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename or "file")
    path = f"{folder}/{uuid4()}_{safe}"
    try:
        supabase.storage.from_(BUCKET).upload(
            path, data, {"content-type": content_type or "application/octet-stream"})
        return path
    except Exception as e:
        print("STORAGE UPLOAD FAILED:", e)
        return None


def signed_url(path, seconds=3600):
    try:
        res = supabase.storage.from_(BUCKET).create_signed_url(path, seconds)
    except Exception as e:
        print("SIGNED URL FAILED:", e)
        return None
    url = res.get("signedURL") or res.get("signedUrl")
    if url and url.startswith("/storage/v1"):
        url = SUPABASE_URL.rstrip("/") + url
    elif url and url.startswith("/"):
        url = SUPABASE_URL.rstrip("/") + "/storage/v1" + url
    return url
