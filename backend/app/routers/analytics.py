from datetime import datetime, timedelta, timezone
from collections import Counter
from fastapi import APIRouter, Depends
from app.auth import require_roles
from app.db import supabase

router = APIRouter(prefix="/analytics", tags=["analytics"])
STAFF = require_roles("reviewer", "admin")


def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@router.get("/summary")
def summary(user=Depends(STAFF)):
    subs = supabase.table("submissions").select("id,status,created_at,decided_at").execute().data
    finds = supabase.table("findings").select("submission_id,status").execute().data
    open_ids = {s["id"] for s in subs if s["status"] not in ("approved", "rejected")}
    open_findings = sum(1 for f in finds if f["status"] != "supported" and f["submission_id"] in open_ids)
    hours = [(_dt(s["decided_at"]) - _dt(s["created_at"])).total_seconds() / 3600
             for s in subs if s["decided_at"] and s["status"] in ("approved", "rejected")]
    active = supabase.table("guideline_versions").select("version").eq("is_active", True).limit(1).execute().data
    return {
        "submissions": len(subs),
        "open_findings": open_findings,
        "avg_turnaround_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "active_guideline": active[0]["version"] if active else None,
    }


@router.get("/throughput")
def throughput(user=Depends(STAFF)):
    now = datetime.now(timezone.utc)
    finds = supabase.table("findings").select("status,created_at").execute().data
    subs = supabase.table("submissions").select("status,decided_at").execute().data
    out = []
    for i in range(6):
        start = now - timedelta(days=7 * (6 - i))
        end = now + timedelta(minutes=1) if i == 5 else start + timedelta(days=7)
        out.append({
            "week": "W" + str(i + 1),
            "findings": sum(1 for f in finds if f["status"] != "supported" and start <= _dt(f["created_at"]) < end),
            "approved": sum(1 for s in subs if s["status"] == "approved" and s["decided_at"]
                            and start <= _dt(s["decided_at"]) < end),
        })
    return out


def _label(f):
    rt, st = f.get("rule_type"), f["status"]
    if rt == "superlative":
        return "Unsupported superlatives"
    if rt == "guarantee":
        return "Guarantee claims"
    if rt == "legal_qualifier":
        return "Missing legal qualifier"
    if rt == "tone":
        return "Tone mismatch"
    if st == "outdated":
        return "Outdated product claims"
    if st == "contradicted":
        return "Contradicted claims"
    if st == "unsupported":
        return "Unsupported claims"
    return "Needs human review"


@router.get("/patterns")
def patterns(user=Depends(STAFF)):
    finds = supabase.table("findings").select("status,rule_type").execute().data
    c = Counter(_label(f) for f in finds if f["status"] != "supported")
    return [{"label": k, "count": v} for k, v in c.most_common(6)]
