import re
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from app.auth import get_current_user
from app.audit import audit
from app.db import supabase
from app.ingest import extract_pages
from app.storage import upload_bytes, signed_url
from app.routers.analysis import _load

router = APIRouter(tags=["documents"])
MAX_BYTES = 10 * 1024 * 1024
MAX_CHARS = 20000
ALLOWED = (".pdf", ".docx", ".txt")


@router.post("/submissions/upload")
async def upload_submission(title: str = Form(...), file: UploadFile = File(...),
                            user=Depends(get_current_user)):
    name = file.filename or ""
    if not name.lower().endswith(ALLOWED):
        raise HTTPException(400, "Unsupported file type. Upload a PDF, DOCX or TXT file.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 10 MB.")
    try:
        pages = extract_pages(name, data)
    except Exception as e:
        print("EXTRACT FAILED:", e)
        raise HTTPException(400, "Could not read this file. It may be corrupted or password protected.")

    parts, page_map, pos, truncated = [], [], 0, False
    for pg, txt in pages:
        t = re.sub(r"[ \t]+", " ", txt or "").strip()
        if not t:
            continue
        if pos + len(t) > MAX_CHARS:
            t = t[: max(0, MAX_CHARS - pos)]
            truncated = True
        if not t:
            break
        page_map.append({"page": pg, "start": pos, "end": pos + len(t)})
        parts.append(t)
        pos += len(t) + 2
        if truncated:
            break
    content = "\n\n".join(parts)
    if len(content.strip()) < 20:
        raise HTTPException(400, "No readable text found. Scanned or image-only PDFs are not supported.")

    active = supabase.table("guideline_versions").select("id").eq("is_active", True).limit(1).execute().data
    path = upload_bytes("submissions", name, data, file.content_type)
    sub = supabase.table("submissions").insert({
        "creator_id": user["id"], "title": (title or "").strip() or name,
        "content_text": content, "file_path": path, "source_filename": name,
        "page_map": page_map, "guideline_id": active[0]["id"] if active else None,
    }).execute().data[0]
    audit(user["id"], "submission.created", "submission", sub["id"],
          {"title": sub["title"], "file": name, "truncated": truncated})
    return {**sub, "truncated": truncated}


@router.get("/submissions/{sid}/file")
def submission_file(sid: str, user=Depends(get_current_user)):
    sub = _load(sid, user)
    if not sub.get("file_path"):
        raise HTTPException(404, "This submission has no uploaded file.")
    url = signed_url(sub["file_path"])
    if not url:
        raise HTTPException(503, "Could not create a download link. Please try again.")
    return {"url": url, "filename": sub.get("source_filename")}
