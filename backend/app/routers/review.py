from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_current_user, require_roles
from app.audit import audit
from app.db import supabase
from app.intentlock import rewrite_submission
from app.routers.analysis import _load, build_findings

router = APIRouter(tags=["review"])


@router.post("/submissions/{sid}/rewrite")
def rewrite_all(sid: str, user=Depends(get_current_user)):
    _load(sid, user)
    try:
        rewrite_submission(sid)
    except Exception as e:
        print("REWRITE FAILED:", e)
        raise HTTPException(503, "AI service is busy. Please try again in a moment.")
    audit(user["id"], "submission.rewritten", "submission", sid, {})
    return build_findings(sid)


@router.post("/findings/{fid}/rewrite")
def rewrite_one(fid: str, user=Depends(get_current_user)):
    f = supabase.table("findings").select("id,submission_id").eq("id", fid).execute().data
    if not f:
        raise HTTPException(404, "Finding not found")
    sid = f[0]["submission_id"]
    _load(sid, user)
    try:
        rewrite_submission(sid, only_finding_id=fid)
    except Exception as e:
        print("REWRITE FAILED:", e)
        raise HTTPException(503, "AI service is busy. Please try again in a moment.")
    audit(user["id"], "finding.rewritten", "finding", fid, {})
    return [x for x in build_findings(sid) if x["finding_id"] == fid]


@router.post("/submissions/{sid}/send-for-review")
def send_for_review(sid: str, user=Depends(get_current_user)):
    sub = _load(sid, user)
    if sub["status"] not in ("analyzed", "revise"):
        raise HTTPException(400, "Analyze the submission before sending it for review.")
    supabase.table("submissions").update({"status": "in_review"}).eq("id", sid).execute()
    audit(user["id"], "submission.sent_for_review", "submission", sid, {})
    return {"id": sid, "status": "in_review"}


class DecisionIn(BaseModel):
    decision: Literal["approve", "revise", "reject"]
    comment: Optional[str] = None


@router.post("/submissions/{sid}/decision")
def decide(sid: str, body: DecisionIn, user=Depends(require_roles("reviewer", "admin"))):
    rows = supabase.table("submissions").select("*").eq("id", sid).execute().data
    if not rows:
        raise HTTPException(404, "Submission not found")
    finds = supabase.table("findings").select("status").eq("submission_id", sid).execute().data
    if not finds:
        raise HTTPException(400, "Analyze this submission before deciding.")
    open_count = sum(1 for f in finds if f["status"] != "supported")
    if body.decision == "approve" and open_count and not (body.comment or "").strip():
        raise HTTPException(400, "Approving with open findings needs a written justification in comment.")

    new_status = {"approve": "approved", "revise": "revise", "reject": "rejected"}[body.decision]
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("decisions").insert({
        "submission_id": sid, "reviewer_id": user["id"],
        "decision": body.decision, "comment": body.comment,
    }).execute()
    supabase.table("submissions").update({
        "status": new_status,
        "decided_at": now if body.decision != "revise" else None,
    }).eq("id", sid).execute()
    audit(user["id"], "submission." + new_status, "submission", sid,
          {"open_findings": open_count, "comment": body.comment})
    return {"id": sid, "status": new_status, "open_findings": open_count}


@router.get("/submissions/{sid}/decisions")
def list_decisions(sid: str, user=Depends(get_current_user)):
    _load(sid, user)
    return (supabase.table("decisions").select("decision,comment,created_at,reviewer_id")
            .eq("submission_id", sid).order("created_at", desc=True).execute().data)


@router.get("/review/queue")
def queue(user=Depends(require_roles("reviewer", "admin"))):
    subs = (supabase.table("submissions").select("*")
            .in_("status", ["analyzed", "in_review"]).order("created_at").execute().data)
    ids = [s["id"] for s in subs]
    counts = {}
    if ids:
        for f in supabase.table("findings").select("submission_id,status").in_("submission_id", ids).execute().data:
            c = counts.setdefault(f["submission_id"], {})
            c[f["status"]] = c.get(f["status"], 0) + 1
    return [{**s, "finding_counts": counts.get(s["id"], {})} for s in subs]
