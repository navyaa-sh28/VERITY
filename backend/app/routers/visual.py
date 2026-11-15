from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from app.auth import get_current_user
from app.audit import audit
from app.db import supabase
from app.storage import upload_bytes
from app.visualguard import load_image, reanalyze

router = APIRouter(tags=["visualguard"])
MAX_IMG = 8 * 1024 * 1024
ALLOWED_IMG = (".png", ".jpg", ".jpeg")


@router.post("/visual/check")
async def visual_check(title: str = Form(""), file: UploadFile = File(...), user=Depends(get_current_user)):
    name = file.filename or ""
    if not name.lower().endswith(ALLOWED_IMG):
        raise HTTPException(400, "Unsupported file type. Upload a PNG or JPG image.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_IMG:
        raise HTTPException(413, "Image is larger than 8 MB.")
    try:
        load_image(data)
    except ValueError as e:
        raise HTTPException(400, str(e))

    active = supabase.table("guideline_versions").select("id").eq("is_active", True).limit(1).execute().data
    path = upload_bytes("visual", name, data, file.content_type)
    if not path:
        raise HTTPException(503, "Could not store the image. Please try again.")
    sub = supabase.table("submissions").insert({
        "creator_id": user["id"], "title": (title or "").strip() or name,
        "content_text": "Visual brand check", "file_path": path, "source_filename": name,
        "kind": "visual", "guideline_id": active[0]["id"] if active else None,
    }).execute().data[0]
    try:
        findings = reanalyze(sub)
    except Exception as e:
        print("VISUAL CHECK FAILED:", e)
        supabase.table("submissions").delete().eq("id", sub["id"]).execute()
        raise HTTPException(500, "The image could not be analysed. Please try a different image.")
    audit(user["id"], "submission.created", "submission", sub["id"], {"title": sub["title"], "kind": "visual"})
    audit(user["id"], "submission.analyzed", "submission", sub["id"],
          {"claims": len(findings), "statuses": [f["status"] for f in findings]})
    return {"id": sub["id"], "title": sub["title"], "statuses": [f["status"] for f in findings]}
