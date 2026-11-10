from datetime import date
from app.db import supabase
from app.gemini_client import generate_json
from app.engine import rule_hits


def _context(sid):
    sub = supabase.table("submissions").select("*").eq("id", sid).execute().data[0]
    gid = sub.get("guideline_id")
    tone, rules, approved = "", [], []
    if gid:
        g = supabase.table("guideline_versions").select("tone_guidance").eq("id", gid).execute().data
        tone = (g[0]["tone_guidance"] or "") if g else ""
        rules = supabase.table("brand_rules").select("*").eq("guideline_id", gid).execute().data
        approved = [c["claim_text"] for c in
                    supabase.table("approved_claims").select("claim_text").eq("guideline_id", gid).execute().data]
    return sub, tone, rules, approved


def rewrite_submission(sid, only_finding_id=None):
    from app.routers.analysis import build_findings
    sub, tone, rules, approved = _context(sid)
    findings = [f for f in build_findings(sid) if f["status"] != "supported"]
    if only_finding_id:
        findings = [f for f in findings if f["finding_id"] == only_finding_id]
    if not findings:
        return []

    today = date.today().isoformat()
    parts = []
    for i, f in enumerate(findings):
        facts = []
        for e in f["evidence"]:
            expired = bool(e.get("valid_until")) and e["valid_until"] < today
            facts.append(("(EXPIRED) " if expired else "") + e["content"])
        parts.append(
            "ITEM " + str(i) + "\nORIGINAL: " + f["claim_text"]
            + "\nPROBLEM (" + f["status"] + "): " + (f["explanation"] or "")
            + "\nVERIFIED FACTS: " + (" | ".join(facts) if facts else "none")
        )

    prompt = (
        "You are IntentLock. Rewrite each marketing claim so it is safe to publish while "
        "keeping the creator's original purpose and energy. Rules: never keep the problematic "
        "promise; use only the VERIFIED FACTS and APPROVED WORDING below; do not invent numbers, "
        "rankings, awards, guarantees or outcomes; if a fact is expired, do not use its number, "
        "speak in general terms; write one short sentence; follow the tone guidance. "
        "Return JSON exactly like "
        '{"rewrites": [{"item": 0, "safer": "..."}]}.\n\n'
        "TONE GUIDANCE: " + (tone or "confident and supportive") + "\n"
        "APPROVED WORDING: " + (" | ".join(approved) if approved else "none") + "\n\n"
        + "\n\n".join(parts)
    )
    data = generate_json(prompt)
    by_item = {}
    for r in (data.get("rewrites", []) if isinstance(data, dict) else []):
        if isinstance(r, dict) and isinstance(r.get("item"), int):
            by_item[r["item"]] = r

    out = []
    for i, f in enumerate(findings):
        safer = (by_item.get(i, {}).get("safer") or "").strip()
        if not safer or rule_hits(safer, rules):
            safer = None   # never offer a rewrite that still breaks a brand rule
        supabase.table("findings").update({"safer_draft": safer}).eq("id", f["finding_id"]).execute()
        out.append({"finding_id": f["finding_id"], "safer_draft": safer})
    return out
