from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY
from app.db import supabase

# separate client only for verifying tokens, so the service client is never affected
_auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
bearer = HTTPBearer(auto_error=False)


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if creds is None:
        raise HTTPException(401, "Missing bearer token")
    try:
        user = _auth_client.auth.get_user(creds.credentials).user
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if user is None:
        raise HTTPException(401, "Invalid or expired token")
    rows = supabase.table("profiles").select("role,full_name").eq("id", user.id).execute().data
    role = rows[0]["role"] if rows else "creator"
    return {"id": user.id, "email": user.email, "role": role}


def require_roles(*roles):
    def checker(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient role")
        return user
    return checker
