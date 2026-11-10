from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.audit import audit
from app.db import supabase
from app.engine import analyze_submission

router = APIRouter(prefix="/submissions", tags=["analysis"])


def _load(sid: str, user: dict) -> dict:
    rows = supabase.table("submissions").select("*").eq("id", sid).execute().data
    if not rows:
        raise HTTPException(404, "Submission not found")
    if user["role"] == "creator" and rows[0]["creator_id"] != user["id"]:
        raise HTTPException(403, "Not your submission")
    return rows[0]


def build_findings(sid: str) -> list:
    claims = (supabase.table("claims").select("id,claim_text,position")
              .eq("submission_id", sid).order("position").execute().data)
    finds = supabase.table("findings").select("*").eq("submission_id", sid).execute().data
    by_claim = {f["claim_id"]: f for f in finds}
    chunk_ids = {cid for f in finds for cid in (f.get("evidence_chunk_ids") or [])}
    chunks = {}
    if chunk_ids:
        rows = (supabase.table("evidence_chunks")
                .select("id,content,doc_id,evidence_docs(title,valid_until)")
                .in_("id", list(chunk_ids)).execute().data)
        chunks = {r["id"]: r for r in rows}
    out = []
    for c in claims:
        f = by_claim.get(c["id"])
        if not f:
            continue
        evidence = []
        for cid in f.get("evidence_chunk_ids") or []:
            ch = chunks.get(cid)
            if ch:
                doc = ch.get("evidence_docs") or {}
                evidence.append({"chunk_id": cid, "doc_title": doc.get("title"),
                                 "valid_until": doc.get("valid_until"), "content": ch["content"]})
        out.append({
            "finding_id": f["id"], "claim_id": c["id"], "claim_text": c["claim_text"],
            "position": c["position"], "status": f["status"], "confidence": f["confidence"],
            "rule_type": f["rule_type"], "explanation": f["explanation"],
            "safer_draft": f["safer_draft"], "evidence": evidence,
        })
    return out


@router.post("/{sid}/analyze")
def analyze(sid: str, user=Depends(get_current_user)):
    sub = _load(sid, user)
    findings = analyze_submission(sub)
    audit(user["id"], "submission.analyzed", "submission", sid,
          {"claims": len(findings), "statuses": [f["status"] for f in findings]})
    return build_findings(sid)


@router.get("/{sid}/findings")
def get_findings(sid: str, user=Depends(get_current_user)):
    _load(sid, user)
    return build_findings(sid)
