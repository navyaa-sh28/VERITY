import re
from datetime import date
from typing import Optional, Union
from uuid import uuid4
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from app.auth import get_current_user, require_roles
from app.audit import audit
from app.db import supabase
from app.gemini_client import embed_many
from app.ingest import extract_text, chunk_text
from app.retrieval import retrieve

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.get("")
def list_evidence(user=Depends(get_current_user)):
    return (supabase.table("evidence_docs")
            .select("id,title,trusted,valid_until,created_at")
            .order("created_at", desc=True).execute().data)


@router.post("")
async def upload_evidence(
    title: str = Form(...),
    valid_until: Optional[str] = Form(None),
    trusted: bool = Form(True),
    text: Optional[str] = Form(None),
    file: Union[UploadFile, str, None] = File(None),
    user=Depends(require_roles("admin")),
):
    raw_text = text or ""
    file_path = None
    if file is not None and not isinstance(file, str) and file.filename:
        data = await file.read()
        raw_text = extract_text(file.filename, data)
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename)
        path = f"evidence/{uuid4()}_{safe_name}"
        try:
            supabase.storage.from_("uploads").upload(
                path, data, {"content-type": file.content_type or "application/octet-stream"})
            file_path = path
        except Exception as e:
            print("STORAGE UPLOAD FAILED:", e)

    if not raw_text.strip():
        raise HTTPException(400, "No text found. Provide a file or text.")
    chunks = chunk_text(raw_text)
    if not chunks:
        raise HTTPException(400, "Text too short to index.")

    vu = None
    if valid_until:
        try:
            vu = date.fromisoformat(valid_until).isoformat()
        except ValueError:
            raise HTTPException(400, "valid_until must be YYYY-MM-DD")

    doc = supabase.table("evidence_docs").insert({
        "title": title, "file_path": file_path, "trusted": trusted,
        "valid_until": vu, "uploaded_by": user["id"],
    }).execute().data[0]

    vectors = embed_many(chunks)
    rows = [{"doc_id": doc["id"], "chunk_index": i, "content": c, "embedding": v}
            for i, (c, v) in enumerate(zip(chunks, vectors))]
    for i in range(0, len(rows), 50):
        supabase.table("evidence_chunks").insert(rows[i:i + 50]).execute()

    audit(user["id"], "evidence.uploaded", "evidence", doc["id"], {"title": title, "chunks": len(rows)})
    return {"id": doc["id"], "title": title, "chunks": len(rows), "stored_file": file_path is not None}


class SearchIn(BaseModel):
    query: str
    k: int = 5


@router.post("/search")
def search_evidence(body: SearchIn, user=Depends(require_roles("reviewer", "admin"))):
    return retrieve(body.query, body.k)

