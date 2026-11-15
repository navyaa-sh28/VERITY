import io
import re

from app.db import supabase
from app.storage import BUCKET

MAX_SIDE = 900
PALETTE_TOL = 25.0       # max colour distance (CIE76 delta E) for a colour to count as approved
NEUTRAL_CHROMA = 10.0    # white, black and greys are always allowed
LOGO_PRESENT = 0.75      # match score at or above this: logo found
LOGO_UNSURE = 0.55       # between this and LOGO_PRESENT: ask a person


def _cv():
    # imported lazily so the rest of the API still starts if OpenCV is unavailable
    import cv2
    import numpy as np
    return cv2, np


# ---------- colour helpers ----------
def hex_to_rgb(h):
    h = (h or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        raise ValueError("Invalid colour: " + str(h))
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#%02X%02X%02X" % tuple(int(round(float(v))) for v in rgb)


def _lab(rgb):
    cv2, np = _cv()
    arr = np.array([[[rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0]]], dtype=np.float32)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)[0, 0].astype(float)


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _luminance(rgb):
    r, g, b = (_lin(float(v)) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a, b):
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ---------- image loading ----------
def load_image(data):
    cv2, np = _cv()
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise ValueError("Could not read this image. Upload a PNG or JPG file.")
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.alpha_composite(img)
        img = bg
    img = img.convert("RGB")
    w, h = img.size
    if w < 16 or h < 16:
        raise ValueError("The image is too small to analyse.")
    scale = MAX_SIDE / float(max(w, h))
    if scale < 1:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    return np.array(img)


# ---------- check 1: approved palette ----------
def check_palette(img, palette):
    cv2, np = _cv()
    if not palette:
        return ("unsupported", None,
                "No brand palette is configured in this BrandDNA version, so the colours could not be checked.",
                "Ask an admin to add the approved brand colours to BrandDNA.")
    pal = []
    for p in palette:
        rgb = hex_to_rgb(p["hex"])
        pal.append((p.get("name") or rgb_to_hex(rgb), rgb_to_hex(rgb), _lab(rgb)))

    pixels = img.reshape(-1, 3)
    if len(pixels) > 20000:
        idx = np.random.default_rng(42).choice(len(pixels), 20000, replace=False)
        pixels = pixels[idx]
    k = int(min(6, len(np.unique(pixels, axis=0))))
    data = pixels.astype(np.float32)
    cv2.setRNGSeed(42)
    _, labels, centers = cv2.kmeans(
        data, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    shares = counts / float(counts.sum())

    off = []
    for centre, share in zip(centers, shares):
        if share < 0.03:
            continue
        lab = _lab(centre)
        if (lab[1] ** 2 + lab[2] ** 2) ** 0.5 < NEUTRAL_CHROMA:
            continue  # white, black and greys are allowed
        dists = [float(np.linalg.norm(lab - p[2])) for p in pal]
        j = int(np.argmin(dists))
        if dists[j] > PALETTE_TOL:
            off.append((rgb_to_hex(centre), float(share), pal[j][0]))
    off.sort(key=lambda o: -o[1])
    off_cov = sum(o[1] for o in off)
    on_pct = int(round((1 - off_cov) * 100))
    approved = ", ".join(p[0] + " " + p[1] for p in pal)

    explanation = "About %d%% of the image uses approved palette colours or neutrals (white, black, grey)." % on_pct
    if off:
        explanation += " Off-palette colours: " + ", ".join(
            "%s (about %d%% of the image, closest approved colour %s)" % (h, round(s * 100), n)
            for h, s, n in off[:3]) + "."
    fix = ("Recolour the off-palette areas using only the approved colours: " + approved + "."
           if off else None)

    if off_cov <= 0.10:
        return ("supported", round(1 - off_cov, 2), explanation, None)
    if off_cov <= 0.25:
        return ("human_review", round(1 - off_cov, 2),
                explanation + " A moderate share is off-palette, so a person should decide.", fix)
    return ("contradicted", round(1 - off_cov, 2), explanation, fix)


# ---------- check 2: text contrast ----------
def find_text_regions(img):
    cv2, np = _cv()
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    H, W = gray.shape
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    bw = (grad > 10).astype(np.uint8) * 255
    closed = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (21, 5)))
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w < 30 or h < 8 or h > 0.25 * H or w / float(h) < 1.8 or w * h > 0.5 * W * H:
            continue
        density = cv2.countNonZero(bw[y:y + h, x:x + w]) / float(w * h)
        if 0.04 <= density <= 0.8:
            regions.append((x, y, w, h))
    regions.sort(key=lambda r: r[2] * r[3], reverse=True)
    return regions[:8]


def region_contrast(img, box):
    cv2, np = _cv()
    x, y, w, h = box
    roi = img[y:y + h, x:x + w].reshape(-1, 3).astype(float)
    lum = roi @ np.array([0.2126, 0.7152, 0.0722])
    dark = roi[lum <= np.percentile(lum, 5)].mean(axis=0)
    light = roi[lum >= np.percentile(lum, 95)].mean(axis=0)
    return contrast_ratio(dark, light), dark, light


def check_contrast(img, min_contrast):
    regions = find_text_regions(img)
    if not regions:
        return ("unsupported", None,
                "No text-like regions were detected in the image, so contrast could not be assessed.",
                "If the image contains text, make sure it stands out clearly from the background.")
    measured = [region_contrast(img, r) for r in regions]
    ratio, dark, light = min(measured, key=lambda t: t[0])
    conf = round(min(1.0, ratio / min_contrast), 2)
    explanation = ("Checked %d text-like region(s) found by edge analysis (the text itself is not read, so treat this as an estimate). "
                   "Lowest contrast: %.1f:1 between %s and %s; required %g:1."
                   % (len(regions), ratio, rgb_to_hex(dark), rgb_to_hex(light), min_contrast))
    fix = ("Increase the contrast of the text to at least %g:1, for example light text on a dark background or dark text on a light one." % min_contrast)
    if ratio >= min_contrast:
        return ("supported", conf, explanation, None)
    if ratio >= 3.0:
        return ("human_review", conf,
                explanation + " This passes only for large text (3:1), so a person should decide.", fix)
    return ("contradicted", conf, explanation, fix)


# ---------- check 3: brand logo ----------
def _template_score(gray, lg, frac):
    cv2, np = _cv()
    H, W = gray.shape
    lh, lw = lg.shape
    tw = int(W * frac)
    th = int(lh * tw / float(lw))
    if tw < 24 or th < 12 or tw >= W or th >= H:
        return -1.0
    t = cv2.resize(lg, (tw, th), interpolation=cv2.INTER_AREA)
    if t.std() < 3:
        return -1.0
    res = cv2.matchTemplate(gray, t, cv2.TM_CCOEFF_NORMED)
    return float(np.nan_to_num(res).max())


def _feature_inliers(gray, lg):
    """Scale and rotation tolerant backup using SIFT features. Returns 0 if SIFT is unavailable."""
    cv2, np = _cv()
    try:
        sift = cv2.SIFT_create()
        k1, d1 = sift.detectAndCompute(lg, None)
        k2, d2 = sift.detectAndCompute(gray, None)
        if d1 is None or d2 is None or len(k1) < 4 or len(k2) < 4:
            return 0
        pairs = cv2.BFMatcher().knnMatch(d1, d2, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 4:
            return 0
        src = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        return int(mask.sum()) if mask is not None else 0
    except Exception as e:
        print("SIFT FAILED:", e)
        return 0


def check_logo(img, logo_img):
    cv2, np = _cv()
    if logo_img is None:
        return ("unsupported", None,
                "No brand logo is configured in this BrandDNA version, so the logo could not be checked.",
                "Ask an admin to upload the approved logo in BrandDNA.")
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    lg = cv2.cvtColor(logo_img, cv2.COLOR_RGB2GRAY)
    coarse = [(_template_score(gray, lg, f), f) for f in np.geomspace(0.06, 0.6, 22)]
    best, frac = max(coarse)
    for f in np.linspace(frac * 0.88, frac * 1.12, 17):   # refine around the best size
        best = max(best, _template_score(gray, lg, f))
    best = max(best, 0.0)
    if best < LOGO_PRESENT and _feature_inliers(gray, lg) >= 10:
        best = max(best, LOGO_PRESENT)
    conf = round(min(1.0, best), 2)
    explanation = ("Compared the approved logo against the image at several sizes. Best match score: %.2f "
                   "(found at %.2f or above, not found below %.2f)." % (best, LOGO_PRESENT, LOGO_UNSURE))
    fix = "Place the approved brand logo clearly in the image, unaltered and not cropped."
    if best >= LOGO_PRESENT:
        return ("supported", conf, explanation, None)
    if best >= LOGO_UNSURE:
        return ("human_review", conf, explanation + " The match is uncertain, so a person should confirm.", fix)
    return ("contradicted", conf, explanation + " The logo was not found.", fix)


# ---------- orchestration ----------
def run_checks(image_bytes, palette, min_contrast, logo_bytes):
    img = load_image(image_bytes)
    logo = None
    if logo_bytes:
        try:
            logo = load_image(logo_bytes)
        except ValueError:
            logo = None
    min_contrast = float(min_contrast or 4.5)
    defs = [
        ("visual_palette", "The image uses only the approved brand colours.", check_palette(img, palette or [])),
        ("visual_contrast", "Text in the image meets the minimum contrast ratio of %g:1." % min_contrast,
         check_contrast(img, min_contrast)),
        ("visual_logo", "The approved brand logo is present.", check_logo(img, logo)),
    ]
    return [{"rule_type": r, "claim": c, "status": s[0], "confidence": s[1],
             "explanation": s[2], "fix": s[3]} for r, c, s in defs]


def store_results(sub, results):
    supabase.table("claims").delete().eq("submission_id", sub["id"]).execute()  # findings cascade
    claim_rows = supabase.table("claims").insert(
        [{"submission_id": sub["id"], "claim_text": r["claim"], "position": i, "page": None}
         for i, r in enumerate(results)]).execute().data
    claim_rows.sort(key=lambda c: c["position"])
    findings = supabase.table("findings").insert([{
        "submission_id": sub["id"], "claim_id": claim_rows[i]["id"], "status": r["status"],
        "confidence": r["confidence"], "rule_type": r["rule_type"], "evidence_chunk_ids": [],
        "explanation": r["explanation"], "safer_draft": r["fix"],
    } for i, r in enumerate(results)]).execute().data
    supabase.table("submissions").update({
        "content_text": " ".join(r["claim"] for r in results), "status": "analyzed",
    }).eq("id", sub["id"]).execute()
    return findings


def reanalyze(sub):
    g = {}
    if sub.get("guideline_id"):
        rows = (supabase.table("guideline_versions").select("brand_palette,min_contrast,logo_path")
                .eq("id", sub["guideline_id"]).execute().data)
        g = rows[0] if rows else {}
    data = supabase.storage.from_(BUCKET).download(sub["file_path"])
    logo_bytes = None
    if g.get("logo_path"):
        try:
            logo_bytes = supabase.storage.from_(BUCKET).download(g["logo_path"])
        except Exception as e:
            print("LOGO DOWNLOAD FAILED:", e)
    results = run_checks(data, g.get("brand_palette") or [], g.get("min_contrast"), logo_bytes)
    return store_results(sub, results)
