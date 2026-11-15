import re
from collections import Counter
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from app.auth import get_current_user, require_roles
from app.audit import audit
from app.db import supabase
from app.gemini_client import generate_json
from app.storage import upload_bytes, signed_url
from app.visualguard import hex_to_rgb, rgb_to_hex, load_image

router = APIRouter(tags=["branddna"])
RULE_TYPES = {"superlative", "guarantee", "legal_qualifier", "tone", "outdated_claim"}


class RuleIn(BaseModel):
    rule_type: str
    pattern: Optional[str] = None
    description: Optional[str] = None
    severity: str = "high"


class ClaimIn(BaseModel):
    claim_text: str


class ColourIn(BaseModel):
    name: str = ""
    hex: str


class ContentIn(BaseModel):
    notes: Optional[str] = None
    tone_guidance: Optional[str] = None
    rules: list[RuleIn] = []
    approved_claims: list[ClaimIn] = []
    brand_palette: list[ColourIn] = []
    min_contrast: float = 4.5


class CloneIn(BaseModel):
    version: str
    notes: Optional[str] = None


# ---------- helpers ----------
def _version(gid):
    rows = supabase.table("guideline_versions").select("*").eq("id", gid).execute().data
    if not rows:
        raise HTTPException(404, "Guideline version not found")
    return rows[0]


def _editable(gid):
    g = _version(gid)
    if g.get("is_active"):
        raise HTTPException(409, "This version is published and cannot be edited. Create a new version from it instead.")
    used = supabase.table("submissions").select("id").eq("guideline_id", gid).limit(1).execute().data
    if used:
        raise HTTPException(409, "This version has already been used by submissions and cannot be edited. Create a new version from it instead.")
    return g


def _full(gid):
    g = _version(gid)
    g["rules"] = supabase.table("brand_rules").select("*").eq("guideline_id", gid).execute().data
    g["approved_claims"] = supabase.table("approved_claims").select("*").eq("guideline_id", gid).execute().data
    return g


def _clean_content(body: ContentIn):
    rules = []
    for r in body.rules:
        t = (r.rule_type or "").strip()
        if t not in RULE_TYPES:
            raise HTTPException(400, "Rule type must be one of: " + ", ".join(sorted(RULE_TYPES)))
        pat = (r.pattern or "").strip()
        if not pat:
            raise HTTPException(400, "Every rule needs a pattern.")
        if len(pat) > 200:
            raise HTTPException(400, "A pattern is longer than 200 characters.")
        try:
            re.compile(pat)
        except re.error as e:
            raise HTTPException(400, "Invalid pattern '%s': %s" % (pat[:60], e))
        rules.append({"rule_type": t, "pattern": pat, "description": (r.description or "").strip()[:300],
                      "severity": r.severity or "high"})
    claims = []
    for c in body.approved_claims:
        txt = (c.claim_text or "").strip()
        if txt:
            if len(txt) > 300:
                raise HTTPException(400, "An approved claim is longer than 300 characters.")
            claims.append({"claim_text": txt})
    palette = []
    for p in body.brand_palette:
        try:
            hx = rgb_to_hex(hex_to_rgb(p.hex))
        except ValueError:
            raise HTTPException(400, "Invalid colour '%s'. Use a hex code like #1E6FD9." % p.hex)
        palette.append({"name": (p.name or "").strip()[:40] or hx, "hex": hx})
    if len(palette) > 12:
        raise HTTPException(400, "A palette can have at most 12 colours.")
    if not (1.0 <= body.min_contrast <= 21.0):
        raise HTTPException(400, "Minimum contrast must be between 1 and 21.")
    return rules, claims, palette


def compute_diff(new, base):
    def rule_key(r):
        return (r.get("rule_type"), (r.get("pattern") or ""))

    rn = {rule_key(r): r for r in new["rules"]}
    rb = {rule_key(r): r for r in base["rules"]}
    cn = {c["claim_text"] for c in new["approved_claims"]}
    cb = {c["claim_text"] for c in base["approved_claims"]}
    pn = {(p.get("hex") or "").upper(): p.get("name") for p in (new.get("brand_palette") or [])}
    pb = {(p.get("hex") or "").upper(): p.get("name") for p in (base.get("brand_palette") or [])}

    def brief(r):
        return {"rule_type": r.get("rule_type"), "pattern": r.get("pattern"), "description": r.get("description")}

    out = {
        "base": base["version"], "new": new["version"],
        "rules_added": [brief(rn[k]) for k in rn if k not in rb],
        "rules_removed": [brief(rb[k]) for k in rb if k not in rn],
        "claims_added": sorted(cn - cb), "claims_removed": sorted(cb - cn),
        "palette_added": [{"hex": h, "name": pn[h]} for h in pn if h not in pb],
        "palette_removed": [{"hex": h, "name": pb[h]} for h in pb if h not in pn],
        "tone_changed": (new.get("tone_guidance") or "") != (base.get("tone_guidance") or ""),
        "tone_before": base.get("tone_guidance"), "tone_after": new.get("tone_guidance"),
        "min_contrast_changed": float(new.get("min_contrast") or 4.5) != float(base.get("min_contrast") or 4.5),
        "min_contrast_before": float(base.get("min_contrast") or 4.5),
        "min_contrast_after": float(new.get("min_contrast") or 4.5),
        "logo_changed": (new.get("logo_path") or None) != (base.get("logo_path") or None),
    }
    out["changes"] = (len(out["rules_added"]) + len(out["rules_removed"]) + len(out["claims_added"])
                      + len(out["claims_removed"]) + len(out["palette_added"]) + len(out["palette_removed"])
                      + int(out["tone_changed"]) + int(out["min_contrast_changed"]) + int(out["logo_changed"]))
    return out


def filter_suggestions(raw, texts, existing_patterns):
    """Keep only suggestions whose pattern compiles and catches at least one flagged claim the existing rules miss."""
    existing = []
    for p in existing_patterns:
        try:
            existing.append(re.compile(p))
        except re.error:
            pass
    out = []
    for s in raw or []:
        if not isinstance(s, dict):
            continue
        t = str(s.get("rule_type") or "").strip()
        pat = str(s.get("pattern") or "").strip()
        if t not in RULE_TYPES or not pat or len(pat) > 120:
            continue
        try:
            rx = re.compile(pat)
        except re.error:
            continue
        matched = [x for x in texts if rx.search(x)]
        new_hits = [x for x in matched if not any(e.search(x) for e in existing)]
        if not new_hits:
            continue
        out.append({"rule_type": t, "pattern": pat, "description": str(s.get("description") or "")[:300],
                    "matches": len(matched), "new_matches": len(new_hits), "examples": new_hits[:3]})
    out.sort(key=lambda s: -s["new_matches"])
    return out[:3]


# ---------- routes ----------
@router.post("/guidelines/{gid}/clone")
def clone_version(gid: str, body: CloneIn, user=Depends(require_roles("admin"))):
    src = _full(gid)
    name = (body.version or "").strip()
    if not name or len(name) > 40:
        raise HTTPException(400, "Enter a version name of up to 40 characters.")
    if supabase.table("guideline_versions").select("id").eq("version", name).execute().data:
        raise HTTPException(400, "A version named '%s' already exists." % name)
    new = supabase.table("guideline_versions").insert({
        "version": name, "notes": body.notes if body.notes is not None else src.get("notes"),
        "tone_guidance": src.get("tone_guidance"), "brand_palette": src.get("brand_palette") or [],
        "min_contrast": src.get("min_contrast") or 4.5, "logo_path": src.get("logo_path"),
        "created_by": user["id"],
    }).execute().data[0]
    if src["rules"]:
        supabase.table("brand_rules").insert([{
            "guideline_id": new["id"], "rule_type": r["rule_type"], "pattern": r.get("pattern"),
            "description": r.get("description"), "severity": r.get("severity") or "high"} for r in src["rules"]]).execute()
    if src["approved_claims"]:
        supabase.table("approved_claims").insert([{
            "guideline_id": new["id"], "claim_text": c["claim_text"]} for c in src["approved_claims"]]).execute()
    audit(user["id"], "guideline.cloned", "guideline", new["id"], {"from": src["version"], "version": name})
    return new


@router.put("/guidelines/{gid}/content")
def update_content(gid: str, body: ContentIn, user=Depends(require_roles("admin"))):
    g = _editable(gid)
    rules, claims, palette = _clean_content(body)
    supabase.table("guideline_versions").update({
        "notes": body.notes, "tone_guidance": body.tone_guidance,
        "brand_palette": palette, "min_contrast": body.min_contrast,
    }).eq("id", gid).execute()
    supabase.table("brand_rules").delete().eq("guideline_id", gid).execute()
    supabase.table("approved_claims").delete().eq("guideline_id", gid).execute()
    if rules:
        supabase.table("brand_rules").insert([{**r, "guideline_id": gid} for r in rules]).execute()
    if claims:
        supabase.table("approved_claims").insert([{**c, "guideline_id": gid} for c in claims]).execute()
    audit(user["id"], "guideline.edited", "guideline", gid,
          {"version": g["version"], "rules": len(rules), "claims": len(claims), "colours": len(palette)})
    return _full(gid)


@router.get("/guidelines/{gid}/diff")
def diff_versions(gid: str, other: str = Query(...), user=Depends(get_current_user)):
    return compute_diff(_full(gid), _full(other))


@router.post("/guidelines/{gid}/logo")
async def upload_logo(gid: str, file: UploadFile = File(...), user=Depends(require_roles("admin"))):
    _editable(gid)
    name = file.filename or ""
    if not name.lower().endswith((".png", ".jpg", ".jpeg")):
        raise HTTPException(400, "Upload a PNG or JPG logo.")
    data = await file.read()
    if not data or len(data) > 4 * 1024 * 1024:
        raise HTTPException(400, "The logo must be an image of up to 4 MB.")
    try:
        load_image(data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    path = upload_bytes("logos", name, data, file.content_type)
    if not path:
        raise HTTPException(503, "Could not store the logo. Please try again.")
    supabase.table("guideline_versions").update({"logo_path": path}).eq("id", gid).execute()
    audit(user["id"], "guideline.logo_updated", "guideline", gid, {"file": name})
    return {"logo_path": path}


@router.get("/guidelines/{gid}/logo")
def get_logo(gid: str, user=Depends(get_current_user)):
    g = _version(gid)
    if not g.get("logo_path"):
        raise HTTPException(404, "No logo has been uploaded for this version.")
    url = signed_url(g["logo_path"])
    if not url:
        raise HTTPException(503, "Could not create a link to the logo. Please try again.")
    return {"url": url}


@router.post("/patterns/suggest")
def suggest_rules(user=Depends(require_roles("reviewer", "admin"))):
    finds = (supabase.table("findings").select("claim_id,status,rule_type")
             .neq("status", "supported").limit(600).execute().data)
    ids = [f["claim_id"] for f in finds if f.get("claim_id") and not (f.get("rule_type") or "").startswith("visual_")]
    texts = []
    for i in range(0, len(ids), 100):
        rows = supabase.table("claims").select("claim_text").in_("id", ids[i:i + 100]).execute().data
        texts += [r["claim_text"].strip() for r in rows if r.get("claim_text")]
    counts = Counter(t for t in texts if 8 <= len(t) <= 300)
    top = [t for t, _ in counts.most_common(40)]
    if len(top) < 2:
        return {"suggestions": [], "analysed": len(top),
                "message": "Not enough flagged claims yet to find a pattern. Run more verifications first."}

    active = supabase.table("guideline_versions").select("id").eq("is_active", True).limit(1).execute().data
    existing = []
    if active:
        existing = supabase.table("brand_rules").select("rule_type,pattern,description").eq(
            "guideline_id", active[0]["id"]).execute().data
    prompt = (
        "You help a brand governance team write new brand rules. Below are marketing claims that were flagged in past "
        "reviews, and the brand rules that already exist. Propose up to 3 NEW rules that would catch recurring wording "
        "problems the existing rules miss. Each rule needs: rule_type (one of superlative, guarantee, legal_qualifier, "
        "tone, outdated_claim), pattern (a case-insensitive Python regular expression starting with (?i), under 100 "
        "characters, matching the problematic wording), and description (one plain sentence). "
        'Return JSON exactly like {"suggestions": [{"rule_type": "tone", "pattern": "(?i)...", "description": "..."}]}.\n\n'
        "EXISTING RULES:\n" + "\n".join("- %s: %s" % (r["rule_type"], r.get("pattern")) for r in existing)
        + "\n\nFLAGGED CLAIMS (most frequent first):\n" + "\n".join("- " + t for t in top)
    )
    try:
        data = generate_json(prompt)
    except Exception as e:
        print("SUGGEST FAILED:", e)
        raise HTTPException(503, "The AI service is busy. Please try again in a moment.")
    raw = data.get("suggestions", []) if isinstance(data, dict) else []
    suggestions = filter_suggestions(raw, top, [r.get("pattern") or "" for r in existing])
    audit(user["id"], "patterns.suggested", "patterns", None, {"analysed": len(top), "suggestions": len(suggestions)})
    return {"suggestions": suggestions, "analysed": len(top), "message": None if suggestions else
            "No new rule was found that catches claims your current rules miss."}


@router.get("/analytics/version-trend")
def version_trend(user=Depends(require_roles("reviewer", "admin"))):
    vers = supabase.table("guideline_versions").select("id,version,created_at").order("created_at").execute().data
    subs = supabase.table("submissions").select("id,guideline_id").execute().data
    finds = supabase.table("findings").select("submission_id,status").execute().data
    sub_ver = {s["id"]: s["guideline_id"] for s in subs}
    out = []
    for v in vers:
        v_subs = [s for s in subs if s["guideline_id"] == v["id"]]
        v_finds = [f for f in finds if sub_ver.get(f["submission_id"]) == v["id"]]
        flagged = sum(1 for f in v_finds if f["status"] != "supported")
        out.append({"version": v["version"], "submissions": len(v_subs), "findings": len(v_finds),
                    "flagged": flagged,
                    "flagged_rate": round(flagged / len(v_finds), 2) if v_finds else None})
    return out
