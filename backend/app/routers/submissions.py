from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_current_user
from app.audit import audit
from app.db import supabase

router = APIRouter(prefix="/submissions", tags=["submissions"])


class SubmissionIn(BaseModel):
    title: str
    content_text: str


@router.post("")
def create_submission(body: SubmissionIn, user=Depends(get_current_user)):
    active = supabase.table("guideline_versions").select("id").eq("is_active", True).limit(1).execute().data
    row = {
        "creator_id": user["id"],
        "title": body.title,
        "content_text": body.content_text,
        "guideline_id": active[0]["id"] if active else None,
    }
    s = supabase.table("submissions").insert(row).execute().data[0]
    audit(user["id"], "submission.created", "submission", s["id"], {"title": body.title})
    return s


@router.get("")
def list_submissions(user=Depends(get_current_user)):
    q = supabase.table("submissions").select("*")
    if user["role"] == "creator":
        q = q.eq("creator_id", user["id"])
    return q.order("created_at", desc=True).execute().data


@router.get("/{sid}")
def get_submission(sid: str, user=Depends(get_current_user)):
    rows = supabase.table("submissions").select("*").eq("id", sid).execute().data
    if not rows:
        raise HTTPException(404, "Submission not found")
    if user["role"] == "creator" and rows[0]["creator_id"] != user["id"]:
        raise HTTPException(403, "Not your submission")
    return rows[0]
