import re
from datetime import date
from app.db import supabase
from app.gemini_client import embed_many, generate_json

MIN_SIM = 0.35   # below this, a chunk is treated as unrelated
STRONG = 0.7     # confidence needed for a firm verdict
TOP_K = 4


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", (s or "").lower())).strip()


def extract_claims(text: str) -> list[str]:
    prompt = (
        "Extract the verifiable marketing claims from the content below. "
        "A claim is a statement a customer could check or that promises something: "
        "rankings, guarantees, statistics, features, outcomes, comparisons. "
        "Copy each claim verbatim, one per item, maximum 10. "
        "Skip greetings and calls to action. "
        'Return JSON exactly like {"claims": ["..."]}.\n\nCONTENT:\n' + text
    )
    data = generate_json(prompt)
    items = data.get("claims", []) if isinstance(data, dict) else data
    claims = [c.strip() for c in items if isinstance(c, str) and c.strip()]
    if not claims:
        claims = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 10]
    return claims[:10]


def rule_hits(claim: str, rules: list) -> list:
    hits = []
    for r in rules:
        if not r.get("pattern"):
            continue
        try:
            if re.search(r["pattern"], claim):
                hits.append(r)
        except re.error:
            continue
    return hits


def judge(claims: list[str], retrieved: list[list]) -> dict:
    parts = []
    for i, claim in enumerate(claims):
        parts.append(f"CLAIM {i}: {claim}")
        for j, ch in enumerate(retrieved[i]):
            parts.append(f"  EVIDENCE {i}.{j}: {ch['content']}")
    prompt = (
        "You verify marketing claims strictly against the evidence given. "
        "Use only the evidence text; never use outside knowledge. "
        "For each evidence item decide its stance toward the claim: "
        '"supports" (evidence says the claim is true), '
        '"contradicts" (evidence says the claim is false or states the opposite), '
        'or "unrelated". Give a confidence from 0 to 1. '
        "Also give one plain sentence of reasoning per claim; never mention evidence numbers or indexes, just say the evidence or describe it. "
        'Return JSON exactly like {"results": [{"claim": 0, "reasoning": "...", '
        '"evidence": [{"index": 0, "stance": "supports", "confidence": 0.9}]}]}. '
        "The evidence index is the number after the dot.\n\n" + "\n".join(parts)
    )
    data = generate_json(prompt)
    out = {}
    for r in (data.get("results", []) if isinstance(data, dict) else []):
        if isinstance(r, dict) and isinstance(r.get("claim"), int):
            out[r["claim"]] = r
    return out


def decide(claim, chunks, judged, approved, reasoning):
    """Deterministic status logic. The AI only supplies stances and confidences."""
    if norm(claim) in approved:
        return "supported", 1.0, [], "Matches an approved claim in the active BrandDNA version."

    today = date.today().isoformat()
    sup, con = [], []
    for ev in judged or []:
        idx = ev.get("index")
        if not isinstance(idx, int) or idx < 0 or idx >= len(chunks):
            continue
        ch = chunks[idx]
        if not ch.get("trusted", True):
            continue
        try:
            conf = float(ev.get("confidence") or 0)
        except (TypeError, ValueError):
            conf = 0.0
        expired = bool(ch.get("valid_until")) and ch["valid_until"] < today
        item = (conf, ch, expired)
        if ev.get("stance") == "supports":
            sup.append(item)
        elif ev.get("stance") == "contradicts":
            con.append(item)

    strong_sup = [x for x in sup if x[0] >= STRONG]
    strong_con = [x for x in con if x[0] >= STRONG]
    tail = (" " + reasoning) if reasoning else ""

    if strong_sup and strong_con:
        ids = [x[1]["id"] for x in strong_sup + strong_con]
        return "human_review", 0.5, ids, "Evidence conflicts: some records support this claim and others contradict it." + tail
    if strong_con:
        fresh = [x for x in strong_con if not x[2]]
        if fresh:
            return "contradicted", max(x[0] for x in fresh), [x[1]["id"] for x in fresh], "Trusted, current evidence says this claim is false." + tail
        return "outdated", max(x[0] for x in strong_con), [x[1]["id"] for x in strong_con], "The matching evidence has expired, so it cannot be relied on." + tail
    if strong_sup:
        fresh = [x for x in strong_sup if not x[2]]
        if fresh:
            return "supported", max(x[0] for x in fresh), [x[1]["id"] for x in fresh], "Supported by approved, current evidence." + tail
        return "outdated", max(x[0] for x in strong_sup), [x[1]["id"] for x in strong_sup], "The only supporting evidence has expired, so this claim is outdated." + tail
    if sup or con:
        best = max(sup + con, key=lambda x: x[0])
        return "human_review", best[0], [x[1]["id"] for x in sup + con], "Evidence is weak or ambiguous, so a person should decide." + tail
    return "unsupported", None, [c["id"] for c in chunks[:2]], "No approved evidence was found that supports this claim." + tail


def analyze_submission(sub: dict) -> list:
    text = sub.get("content_text") or ""
    gid = sub.get("guideline_id")
    rules, approved = [], set()
    if gid:
        rules = supabase.table("brand_rules").select("*").eq("guideline_id", gid).execute().data
        approved = {norm(c["claim_text"]) for c in
                    supabase.table("approved_claims").select("claim_text").eq("guideline_id", gid).execute().data}

    supabase.table("claims").delete().eq("submission_id", sub["id"]).execute()  # findings cascade
    claims = extract_claims(text)
    if not claims:
        supabase.table("submissions").update({"status": "analyzed"}).eq("id", sub["id"]).execute()
        return []

    retrieved = []
    for v in embed_many(claims):
        rows = supabase.rpc("match_chunks", {"query_embedding": v, "match_count": TOP_K}).execute().data or []
        retrieved.append([r for r in rows if r["similarity"] >= MIN_SIM])

    try:
        judgments, ai_ok = judge(claims, retrieved), True
    except Exception as e:
        print("JUDGE FAILED:", e)
        judgments, ai_ok = {}, False

    claim_rows = supabase.table("claims").insert(
        [{"submission_id": sub["id"], "claim_text": c, "position": i} for i, c in enumerate(claims)]
    ).execute().data
    claim_rows.sort(key=lambda r: r["position"])

    findings = []
    for i, claim in enumerate(claims):
        hits = rule_hits(claim, rules)
        if not ai_ok and norm(claim) not in approved:
            status, conf, ids, expl = "human_review", None, [], "AI analysis was unavailable, so this claim is escalated to a person."
        else:
            j = judgments.get(i, {})
            status, conf, ids, expl = decide(claim, retrieved[i], j.get("evidence", []), approved, j.get("reasoning", ""))
        if hits:
            expl += " Brand rule triggered: " + (hits[0].get("description") or hits[0]["rule_type"]) + "."
        findings.append({
            "submission_id": sub["id"],
            "claim_id": claim_rows[i]["id"],
            "status": status,
            "confidence": conf,
            "rule_type": hits[0]["rule_type"] if hits else None,
            "evidence_chunk_ids": ids,
            "explanation": expl,
        })
    supabase.table("findings").insert(findings).execute()
    supabase.table("submissions").update({"status": "analyzed"}).eq("id", sub["id"]).execute()
    return findings


