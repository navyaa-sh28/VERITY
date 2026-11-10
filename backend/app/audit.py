from app.db import supabase


def audit(actor_id, action, entity_type=None, entity_id=None, details=None):
    try:
        supabase.table("audit_logs").insert({
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details or {},
        }).execute()
    except Exception as e:
        print("AUDIT WRITE FAILED:", e)
