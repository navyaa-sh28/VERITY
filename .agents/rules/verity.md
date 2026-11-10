---
trigger: always_on
---

Project: VERITY, evidence-first brand governance.
Monorepo: /backend (FastAPI, Python) and /frontend (Next.js + Tailwind).

Rules:
- Claim statuses are exactly: supported, contradicted, outdated, unsupported, human_review.
- Never invent evidence. If evidence is missing or unclear, use unsupported or human_review.
- Final approve/reject is always a human action, never automatic.
- Every create, analyze, decision and publish action writes a row to audit_logs.
- Backend code lives in /backend/app. Read secrets only from environment variables via python-dotenv.
- Never hardcode or print API keys. Never commit .env files.
- Keep tasks small. Do not touch the /frontend folder when working on backend tasks.
- Before large changes, show an implementation plan and wait for approval.