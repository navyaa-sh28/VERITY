# VERITY: Evidence-First Brand Intelligence and Governance Platform

**Trust every word before it reaches the world.**

Team NSSQUARE: Navya Shukla (Team Leader), Nandani Kumari. Built for the Code Titans hackathon.

| | |
|---|---|
| Live app | https://verity-rho-self.vercel.app |
| Backend API docs | https://verity-x1pt.onrender.com/docs |
| Source code | https://github.com/navyaa-sh28/VERITY |

> **First load can be slow.** The backend runs on a free hosting plan that goes to sleep when idle. The first sign-in after a quiet period can take up to about 50 seconds. Please wait, and later requests are fast. Verification and "Suggest safer wording" call an AI model and can take 20 to 60 seconds. Click each button once.

---

## What VERITY does

As content volume grows, brand review becomes fragmented: inconsistent tone, outdated claims and unsupported promises reach the public. VERITY is a verification layer between creation and publication. It extracts the claims in a piece of marketing content, finds evidence in an approved library, checks brand rules, labels every claim, explains why, suggests safer wording, and leaves the final decision to a person.

**Claim statuses**

| Status | Meaning |
|---|---|
| Supported | Current, trusted evidence backs the claim |
| Contradicted | Trusted, current evidence says the claim is false |
| Outdated | The only matching evidence has expired |
| Unsupported | No evidence was found. VERITY does not guess |
| Human review | Evidence is weak or conflicting, so it is escalated to a person |

## Modules

- **BrandDNA**: versioned brand rules, tone guidance and approved claims, published by an admin.
- **EvidenceTrace**: every finding links to the evidence record behind it, with the quoted sentence and its expiry date.
- **IntentLock**: suggests safer wording that keeps the creator's purpose. Any rewrite that would still break a brand rule is discarded.
- **HumanGate**: role-based approval (creator, reviewer, admin). Approving a submission that still has open findings requires a written justification.
- **PatternSense**: recurring-finding analytics and a weekly throughput dashboard.
- **Audit log**: every create, analyze, rewrite and decision action is recorded with who did it.

## Important design choice: AI judges, code decides

The AI model only reads the claim and the retrieved evidence and reports whether each piece supports or contradicts it, with a confidence. **Plain code then decides the final status**, so the system can abstain and escalate instead of inventing certainty. A human always makes the final approve, revise or reject decision.

## Architecture

- **Frontend:** Next.js, React, Tailwind CSS, deployed on Vercel
- **Backend:** Python FastAPI, deployed on Render
- **Data:** Supabase (PostgreSQL with pgvector, Auth, private Storage), with row-level security and role checks in the API
- **AI:** Gemini API for claim extraction, evidence judging, embeddings and rewrites
- **Documents:** PyMuPDF and python-docx for PDF and DOCX evidence extraction

Verification pipeline: submit content, extract claims, retrieve evidence (pgvector), check brand rules, AI stance analysis, rule-based status decision, human review, audit log.

---

## Demo accounts (fictional data only)

| Role | Email | Password |
|---|---|---|
| Creator | creator@test.com | hellocreator |
| Reviewer | reviewer@test.com | helloreviewer |
| Admin | admin@test.com | helloadmin |

Evidence for two fictional brands (**Nimbus Cloud Storage** and **Aarohan Learning**) is already loaded, so you can start at the creator test below. All brand names, evidence documents and the dashboard history are fictional demo data. The dashboard is illustrative and not live product metrics.

---

## How to test it (about 10 minutes)

AI results can vary slightly between runs. If one claim's status differs from the table, that is normal.

### Test 1: Creator submits and verifies

1. Open the live app and sign in as **creator@test.com**.
2. Click **Submit**.
3. Title: `Nimbus launch campaign`
4. Content: `Nimbus is the #1 cloud storage in India. Nimbus guarantees 100% uptime. Trusted by 8,000 business customers. Nimbus offers encrypted file storage with automatic backups.`
5. Submit, then click **Run verification** once and wait up to a minute.

Expected result:

| Claim | Status | Why |
|---|---|---|
| Nimbus is the #1 cloud storage in India. | Contradicted | The market report says Nimbus ranks third. A "superlative" rule tag is shown |
| Nimbus guarantees 100% uptime. | Contradicted | The SLA policy says there is no guarantee. A "guarantee" rule tag is shown |
| Trusted by 8,000 business customers. | Outdated | The only matching evidence expired in March 2025 |
| Nimbus offers encrypted file storage with automatic backups. | Supported | It matches the company profile |

6. Click any highlighted claim. The right panel shows the status, confidence, the explanation and the evidence record with the quoted sentence (EvidenceTrace).
7. Click **Suggest safer wording** and wait up to a minute. Each flagged claim gets a Before / Safer draft card. A card saying "No safe rewrite available, needs human edit" is allowed, because VERITY refuses to offer a rewrite that would still break a brand rule.
8. Click **Send for review**. The status becomes **In review**.

Another example you can use (Aarohan Learning): `India's #1 learning platform. Guaranteed exam success. Aarohan offers 120 full-length mock tests. A learning platform built for focused exam preparation.` The expected result is the same pattern: two Contradicted, one Outdated, one Supported.

### Test 2: Reviewer decides (HumanGate)

1. Sign out and sign in as **reviewer@test.com**.
2. Open **Review queue** and open "Nimbus launch campaign". A decision panel with Approve, Request revision and Reject is shown. Creators do not see it.
3. Leave the comment empty and click **Approve**. You get an error asking for a written justification. This is intentional: approving a submission that still has unresolved findings requires an accountable reason.
4. Type a comment, for example `Safer wording accepted; ranking and uptime claims removed.`, and click **Approve**. The status becomes **Approved** and the decision is added to the history.
5. Open **Dashboard**. It shows the stat cards, the weekly throughput chart and the top recurring findings.

### Test 3: The honest "Unsupported" case

1. As the creator, submit: `Nimbus was founded in 2015. Nimbus is loved by designers worldwide.`
2. Run verification. Both claims are **Unsupported** with "No evidence found". VERITY does not invent certainty when it has no proof.

### Test 4: Admin and audit

1. Sign in as **admin@test.com**.
2. **Guidelines** shows the BrandDNA versions with the active one marked.
3. **Evidence** lists the approved evidence library. You can add a new document (title and text, with an optional valid-until date). Documents with a past expiry date make matching claims show as Outdated.
4. **Audit** shows every action (submission created, analyzed, rewritten, sent for review, approved) with the person who did it.

### Test 5: Role protection

Sign in as the creator and open `/admin/evidence`, `/review` or `/dashboard`. You are redirected or blocked. Creators can only see their own submissions, and only reviewers and admins can decide.

### Try your own brand

Sign in as admin, add evidence for your brand on the **Evidence** page (include some with a past valid-until date), then submit content as the creator. Without evidence, claims correctly come back Unsupported.

---

## Known limitations and future work

- **Not built yet:** VisualGuard (logo, colour and accessibility checks on images), video governance, CMS integrations, multilingual verification and enterprise controls.
- Content is submitted as text in the app. The evidence API can extract text from PDF and DOCX files, but the web form accepts text only.
- Creating a new BrandDNA version is available through the API (the Render `/docs` page). The web app lists versions and publishes them.
- The free backend host sleeps when idle, and the free AI tier is rate-limited, so verification can occasionally be slow or return a "service busy" message. Try again after a moment.

---

## Run it locally

**Backend**

1. `cd backend`
2. `python -m venv .venv`, then activate it (`.\.venv\Scripts\Activate.ps1` on Windows)
3. `pip install -r requirements.txt`
4. Create `backend/.env` with these variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `EMBED_MODEL`
5. `uvicorn app.main:app --reload`

**Frontend**

1. `cd frontend`
2. `npm install`
3. Create `frontend/.env.local` with these variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`
4. `npm run dev`

The database schema (tables, row-level security and the vector search function) runs in the Supabase SQL editor. No secret keys are stored in this repository.

## Repository layout

- `backend/`: FastAPI service (auth, evidence ingestion, verification engine, IntentLock, review, analytics, audit)
- `frontend/`: Next.js web app
- `docs/API_CONTRACT.md`: summary of the API endpoints