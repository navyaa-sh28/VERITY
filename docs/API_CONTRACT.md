VERITY backend (all calls go through frontend/lib/api.ts, which adds the login token).
Roles: creator | reviewer | admin. GET /me -> {id, email, role}.

SUBMISSIONS
POST /submissions {title, content_text} -> submission
GET /submissions -> list (creators see only their own)
GET /submissions/{id} -> {id,title,content_text,status,created_at,decided_at,...}
POST /submissions/{id}/analyze -> Finding[]   (SLOW: up to 60s, show spinner, disable button)
GET  /submissions/{id}/findings -> Finding[]  (empty list if never analyzed)
POST /submissions/{id}/rewrite -> Finding[]   (SLOW: IntentLock safer wording, fills safer_draft)
POST /submissions/{id}/send-for-review -> {id,status}   (status must be analyzed or revise)
POST /submissions/{id}/decision {decision:"approve"|"revise"|"reject", comment?} (reviewer/admin)
   approving while any finding is not "supported" returns 400 unless comment is non-empty
GET  /submissions/{id}/decisions -> [{decision,comment,created_at,reviewer_id}]
Submission status values: submitted, analyzed, in_review, approved, revise, rejected

Finding = {finding_id, claim_id, claim_text, position, status, confidence (null when unsupported),
  rule_type, explanation, safer_draft (null until rewrite), evidence:[{chunk_id,doc_title,valid_until,content}]}
status = supported | contradicted | outdated | unsupported | human_review

REVIEW (reviewer/admin): GET /review/queue -> submissions + finding_counts {status: n}
ANALYTICS (reviewer/admin): GET /analytics/summary -> {submissions, open_findings, avg_turnaround_hours (null possible), active_guideline}
  GET /analytics/throughput -> [{week:"W1",findings,approved} x6]   GET /analytics/patterns -> [{label,count}]
ADMIN
GET /guidelines -> [{id,version,notes,tone_guidance,is_active,created_at}]   GET /guidelines/{id} -> adds rules[], approved_claims[]
POST /guidelines {version,notes,tone_guidance,rules:[{rule_type,pattern,description}],approved_claims:[{claim_text}]}
POST /guidelines/{id}/publish
GET /evidence -> [{id,title,trusted,valid_until,created_at}]
POST /evidence multipart FormData: title (required), valid_until (YYYY-MM-DD, only append if filled), trusted, text OR file (append only if chosen)
GET /audit -> [{action,entity_type,entity_id,details,created_at,actor_email}]  (admin)
Errors: JSON {detail: "message"}. The first request after idle can take ~50s (free hosting wakes up).