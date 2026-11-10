import random
from datetime import datetime, timedelta, timezone
from app.db import supabase

random.seed(11)
now = datetime.now(timezone.utc)

if supabase.table("submissions").select("id").like("title", "[Demo]%").limit(1).execute().data:
    print("Demo data already exists. Delete it first, then rerun.")
    raise SystemExit

res = supabase.auth.admin.list_users()
users = res if isinstance(res, list) else getattr(res, "users", [])
ids = {u.email: u.id for u in users}
creator, reviewer = ids["creator@test.com"], ids["reviewer@test.com"]
active = supabase.table("guideline_versions").select("id").eq("is_active", True).limit(1).execute().data
gid = active[0]["id"] if active else None

T = [
    ("India's #1 test prep platform.", "contradicted", "superlative", 0.95, "Trusted evidence says this ranking claim is false."),
    ("The best faculty in the country.", "unsupported", "superlative", None, "No approved evidence supports this claim."),
    ("Guaranteed selection in top colleges.", "contradicted", "guarantee", 0.93, "Evidence states outcomes are not guaranteed."),
    ("120 full-length mock tests included.", "outdated", None, 0.95, "The supporting evidence has expired."),
    ("Structured study plans for every exam.", "supported", None, 1.0, "Matches an approved claim."),
    ("Our results speak for themselves!", "human_review", "tone", 0.5, "Tone and evidence are ambiguous, escalated to a person."),
]

n = 0
for w in range(6):
    for _ in range(random.randint(3, 5)):
        n += 1
        created = now - timedelta(days=7 * (5 - w) + random.uniform(0.2, 6.5))
        decided = created + timedelta(hours=random.uniform(3, 7))
        if decided > now - timedelta(minutes=5):
            status, decided_at = "in_review", None
        else:
            status = random.choices(["approved", "rejected"], [0.85, 0.15])[0]
            decided_at = decided
        picks = random.sample(T, random.randint(2, 4))
        sub = supabase.table("submissions").insert({
            "creator_id": creator, "title": "[Demo] Campaign " + str(n),
            "content_text": " ".join(p[0] for p in picks), "guideline_id": gid,
            "status": status, "created_at": created.isoformat(),
            "decided_at": decided_at.isoformat() if decided_at else None,
        }).execute().data[0]
        claims = supabase.table("claims").insert(
            [{"submission_id": sub["id"], "claim_text": p[0], "position": i} for i, p in enumerate(picks)]
        ).execute().data
        claims.sort(key=lambda c: c["position"])
        supabase.table("findings").insert([{
            "submission_id": sub["id"], "claim_id": claims[i]["id"], "status": p[1],
            "confidence": p[3], "rule_type": p[2], "evidence_chunk_ids": [],
            "explanation": p[4], "created_at": created.isoformat(),
        } for i, p in enumerate(picks)]).execute()
        if decided_at:
            supabase.table("decisions").insert({
                "submission_id": sub["id"], "reviewer_id": reviewer,
                "decision": "approve" if status == "approved" else "reject",
                "comment": "Reviewed after revisions.", "created_at": decided_at.isoformat(),
            }).execute()
print("Seeded", n, "demo submissions")
