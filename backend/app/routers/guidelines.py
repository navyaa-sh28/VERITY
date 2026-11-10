from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_current_user, require_roles
from app.audit import audit
from app.db import supabase

router = APIRouter(prefix="/guidelines", tags=["guidelines"])


class RuleIn(BaseModel):
    rule_type: str
    pattern: Optional[str] = None
    description: Optional[str] = None
    severity: str = "high"


class ClaimIn(BaseModel):
    claim_text: str
    evidence_doc_id: Optional[str] = None


class GuidelineIn(BaseModel):
    version: str
    notes: Optional[str] = None
    tone_guidance: Optional[str] = None
    rules: list[RuleIn] = []
    approved_claims: list[ClaimIn] = []


@router.get("")
def list_guidelines(user=Depends(get_current_user)):
    return supabase.table("guideline_versions").select("*").order("created_at", desc=True).execute().data


@router.get("/{gid}")
def get_guideline(gid: str, user=Depends(get_current_user)):
    g = supabase.table("guideline_versions").select("*").eq("id", gid).execute().data
    if not g:
        raise HTTPException(404, "Guideline not found")
    rules = supabase.table("brand_rules").select("*").eq("guideline_id", gid).execute().data
    claims = supabase.table("approved_claims").select("*").eq("guideline_id", gid).execute().data
    return {**g[0], "rules": rules, "approved_claims": claims}


@router.post("")
def create_guideline(body: GuidelineIn, user=Depends(require_roles("admin"))):
    g = supabase.table("guideline_versions").insert({
        "version": body.version,
        "notes": body.notes,
        "tone_guidance": body.tone_guidance,
        "created_by": user["id"],
    }).execute().data[0]
    if body.rules:
        supabase.table("brand_rules").insert(
            [{**r.model_dump(), "guideline_id": g["id"]} for r in body.rules]).execute()
    if body.approved_claims:
        supabase.table("approved_claims").insert(
            [{**c.model_dump(), "guideline_id": g["id"]} for c in body.approved_claims]).execute()
    audit(user["id"], "guideline.created", "guideline", g["id"], {"version": body.version})
    return g


@router.post("/{gid}/publish")
def publish_guideline(gid: str, user=Depends(require_roles("admin"))):
    g = supabase.table("guideline_versions").select("id,version").eq("id", gid).execute().data
    if not g:
        raise HTTPException(404, "Guideline not found")
    supabase.table("guideline_versions").update({"is_active": False}).eq("is_active", True).execute()
    supabase.table("guideline_versions").update({"is_active": True}).eq("id", gid).execute()
    audit(user["id"], "guideline.published", "guideline", gid, {"version": g[0]["version"]})
    return {"published": gid, "version": g[0]["version"]}
