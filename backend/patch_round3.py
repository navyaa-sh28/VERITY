import pathlib


def patch(path, old, new):
    p = pathlib.Path(path)
    s = p.read_text(encoding="utf-8")
    if new in s:
        print("already patched:", path)
        return
    if old not in s:
        print("NOT FOUND in", path, "->", old)
        return
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    print("patched:", path)


patch("app/routers/analysis.py",
      "from app.engine import analyze_submission",
      "from app.engine import analyze_submission\nfrom app.visualguard import reanalyze as visual_reanalyze")
patch("app/routers/analysis.py",
      "findings = analyze_submission(sub)",
      'findings = visual_reanalyze(sub) if sub.get("kind") == "visual" else analyze_submission(sub)')
patch("app/intentlock.py",
      "sub, tone, rules, approved = _context(sid)",
      'sub, tone, rules, approved = _context(sid)\n    if sub.get("kind") == "visual":\n        return []')
patch("app/routers/analytics.py",
      'rt, st = f.get("rule_type"), f["status"]',
      'rt, st = f.get("rule_type"), f["status"]\n    if rt and rt.startswith("visual_"):\n        return "Visual brand issues"')

main = pathlib.Path("app/main.py")
m = main.read_text(encoding="utf-8")
if "branddna" not in m:
    main.write_text(m + "\n\nfrom app.routers import visual, branddna\napp.include_router(visual.router)\napp.include_router(branddna.router)\n", encoding="utf-8")
    print("patched: app/main.py")
else:
    print("already patched: app/main.py")
