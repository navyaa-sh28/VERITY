from app.visualguard import run_checks
pal = [{"name": "Nimbus Blue", "hex": "#1E6FD9"}, {"name": "Deep Navy", "hex": "#0B2545"}, {"name": "Sky", "hex": "#8EC5FF"}]
logo = open("demo_images/nimbus_logo.png", "rb").read()
for f in ("nimbus_campaign_ok.png", "nimbus_campaign_bad.png"):
    print(f, [(r["rule_type"], r["status"]) for r in run_checks(open("demo_images/" + f, "rb").read(), pal, 4.5, logo)])
