from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import CORS_ORIGINS
from app.auth import get_current_user
from app.routers import guidelines, submissions, evidence, analysis, review, analytics, audit_log

app = FastAPI(title="VERITY API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"] + CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(guidelines.router)
app.include_router(submissions.router)
app.include_router(evidence.router)
app.include_router(analysis.router)
app.include_router(review.router)
app.include_router(analytics.router)
app.include_router(audit_log.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(user=Depends(get_current_user)):
    return user



