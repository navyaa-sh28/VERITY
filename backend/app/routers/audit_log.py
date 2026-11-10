from fastapi import APIRouter, Depends
from app.auth import require_roles
from app.db import supabase

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(limit: int = 100, user=Depends(require_roles("admin"))):
    rows = (supabase.table("audit_logs").select("*")
            .order("created_at", desc=True).limit(min(limit, 500)).execute().data)
    emails = {}
    try:
        res = supabase.auth.admin.list_users()
        users = res if isinstance(res, list) else getattr(res, "users", [])
        emails = {u.id: u.email for u in users}
    except Exception as e:
        print("AUDIT EMAIL LOOKUP FAILED:", e)
    for r in rows:
        r["actor_email"] = emails.get(r.get("actor_id"))
    return rows
