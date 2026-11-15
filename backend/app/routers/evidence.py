from datetime import date
from typing import Optional, Union
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from app.auth import get_current_user, require_roles
from app.audit import audit
from app.db import supabase
from app.gemini_client import embed_many
from app.ingest import extract_pages, chunk_text
from app.retrieval import retrieve
from app.storage import upload_bytes, signed_url

router = APIRouter(prefix="/evidence", tags=["evidence"])
MAX_BYTES = 10 * 1024 * 1024


@router.get("")
def list_evidence(user=Depends(get_current_user)):
    rows = (supabase.table("evidence_docs")
            .select("id,title,trusted,valid_until,created_at,file_path")
            .order("created_at", desc=True).execute().data)
    for r in rows:
        r["has_file"] = bool(r.pop("file_path", None))
    return rows


@router.post("")
async def upload_evidence(
    title: str = Form(...),
    valid_until: Optional[str] = Form(None),
    trusted: bool = Form(True),
    text: Optional[str] = Form(None),
    file: Union[UploadFile, str, None] = File(None),
    user=Depends(require_roles("admin")),
):
    pages, file_path = [], None
    if file is not None and not isinstance(file, str) and file.filename:
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "File is larger than 10 MB.")
        try:
            pages = extract_pages(file.filename, data)
        except Exception as e:
            print("EXTRACT FAILED:", e)
            raise HTTPException(400, "Could not read this file. It may be corrupted or password protected.")
        file_path = upload_bytes("evidence", file.filename, data, file.content_type)
    elif text and text.strip():
        pages = [(None, text)]

    chunks, chunk_pages = [], []
    for pg, txt in pages:
        for c in chunk_text(txt or ""):
            chunks.append(c)
            chunk_pages.append(pg)
    if not chunks:
        raise HTTPException(400, "No readable text found. Provide text or a text-based PDF, DOCX or TXT file.")

    vu = None
    if valid_until:
        try:
            vu = date.fromisoformat(valid_until).isoformat()
        except ValueError:
            raise HTTPException(400, "valid_until must be YYYY-MM-DD")

    doc = supabase.table("evidence_docs").insert({
        "title": title.strip(), "file_path": file_path, "trusted": trusted,
        "valid_until": vu, "uploaded_by": user["id"],
    }).execute().data[0]

    vectors = embed_many(chunks)
    rows = [{"doc_id": doc["id"], "chunk_index": i, "content": c, "embedding": v, "page": chunk_pages[i]}
            for i, (c, v) in enumerate(zip(chunks, vectors))]
    for i in range(0, len(rows), 50):
        supabase.table("evidence_chunks").insert(rows[i:i + 50]).execute()

    audit(user["id"], "evidence.uploaded", "evidence", doc["id"], {"title": title, "chunks": len(rows)})
    return {"id": doc["id"], "title": title, "chunks": len(rows), "stored_file": file_path is not None}


@router.get("/{doc_id}/file")
def evidence_file(doc_id: str, user=Depends(require_roles("reviewer", "admin"))):
    rows = supabase.table("evidence_docs").select("file_path,title").eq("id", doc_id).execute().data
    if not rows or not rows[0].get("file_path"):
        raise HTTPException(404, "No original file is stored for this evidence document.")
    url = signed_url(rows[0]["file_path"])
    if not url:
        raise HTTPException(503, "Could not create a download link. Please try again.")
    return {"url": url, "title": rows[0]["title"]}


class SearchIn(BaseModel):
    query: str
    k: int = 5


@router.post("/search")
def search_evidence(body: SearchIn, user=Depends(require_roles("reviewer", "admin"))):
    return retrieve(body.query, body.k)
