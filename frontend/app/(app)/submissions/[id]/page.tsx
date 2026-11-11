"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  DecisionRecord,
  Finding,
  STATUS,
  Status,
  Submission,
  SUBMISSION_STATUS,
  SubmissionStatus,
} from "@/lib/status";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface TextSegment {
  text: string;
  finding?: Finding;
}

// Visual configuration for claim statuses
function getStatusConfig(status: Status) {
  const base = STATUS[status] || { label: status, color: "#152A35" };
  switch (status) {
    case "supported":
      return {
        ...base,
        bg: "#E8F4EE",
        textColor: "#2e6f52",
        borderColor: "#3F8F6B",
        badgeBg: "#E8F4EE",
        badgeText: "#2e6f52",
        icon: "verified",
      };
    case "contradicted":
      return {
        ...base,
        bg: "#F7EBEA",
        textColor: "#9c3b35",
        borderColor: "#B85C55",
        badgeBg: "#F7EBEA",
        badgeText: "#9c3b35",
        icon: "cancel",
      };
    case "outdated":
      return {
        ...base,
        bg: "#FAF4E8",
        textColor: "#87621c",
        borderColor: "#D4A85A",
        badgeBg: "#FAF4E8",
        badgeText: "#87621c",
        icon: "schedule",
      };
    case "unsupported":
      return {
        ...base,
        bg: "#E4F1F0",
        textColor: "#155e58",
        borderColor: "#218C84",
        badgeBg: "#E4F1F0",
        badgeText: "#155e58",
        icon: "help_outline",
      };
    case "human_review":
    default:
      return {
        ...base,
        bg: "#E3E8EB",
        textColor: "#152A35",
        borderColor: "#152A35",
        badgeBg: "#E3E8EB",
        badgeText: "#152A35",
        icon: "rule",
      };
  }
}

// Helper to determine if an evidence item has expired before today
function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(validUntil);
    return exp.getTime() < today.getTime();
  } catch {
    return false;
  }
}

// Format confidence percentage or display "No evidence found" when null
function formatConfidence(conf: number | null | undefined): string {
  if (conf === null || conf === undefined) {
    return "No evidence found";
  }
  const val = typeof conf === "number" ? conf : parseFloat(String(conf));
  if (isNaN(val)) {
    return "No evidence found";
  }
  const pct = val <= 1 ? Math.round(val * 100) : Math.round(val);
  return `${pct}% Match Confidence`;
}

export default function SubmissionDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isSendingReview, setIsSendingReview] = useState(false);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Authentication & Role
  const { me, loading: authLoading } = useAuth();
  const isReviewerOrAdmin = !authLoading && (me?.role === "reviewer" || me?.role === "admin");

  // HumanGate decision states
  const [decisionComment, setDecisionComment] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionsHistory, setDecisionsHistory] = useState<DecisionRecord[]>([]);
  const [loadingDecisions, setLoadingDecisions] = useState(false);

  // Fetch decision history
  const fetchDecisions = useCallback(async () => {
    try {
      setLoadingDecisions(true);
      const list = await api<DecisionRecord[]>(`/submissions/${id}/decisions`);
      setDecisionsHistory(Array.isArray(list) ? list : []);
    } catch {
      // Non-blocking if decisions cannot be loaded
    } finally {
      setLoadingDecisions(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // Fetch initial submission and findings
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setError(null);
        const [subRes, findingsRes] = await Promise.all([
          api<Submission>(`/submissions/${id}`),
          api<Finding[]>(`/submissions/${id}/findings`),
        ]);

        if (!active) return;
        setSubmission(subRes);
        const safeFindings = Array.isArray(findingsRes) ? findingsRes : [];
        setFindings(safeFindings);
        if (safeFindings.length > 0) {
          setSelectedFindingId(safeFindings[0].finding_id);
        }
      } catch (err: unknown) {
        if (!active) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to load submission data. Please try again.";
        setError(msg);
      } finally {
        if (active) setInitialLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [id]);

  // Selected finding object
  const selectedFinding = useMemo(() => {
    if (!findings.length) return null;
    return (
      findings.find((f) => f.finding_id === selectedFindingId) || findings[0]
    );
  }, [findings, selectedFindingId]);

  // Breakdown metrics for findings
  const telemetry = useMemo(() => {
    const counts: Record<Status, number> = {
      supported: 0,
      contradicted: 0,
      outdated: 0,
      unsupported: 0,
      human_review: 0,
    };
    for (const f of findings) {
      if (counts[f.status] !== undefined) {
        counts[f.status]++;
      }
    }
    const total = findings.length;
    const supportedPct = total > 0 ? Math.round((counts.supported / total) * 100) : 0;
    return { counts, total, supportedPct };
  }, [findings]);

  // Highlight claims inside content_text and detect unmatched claims
  const { segments, unmatchedFindings } = useMemo(() => {
    const content = submission?.content_text || "";
    if (!content) {
      return { segments: [], unmatchedFindings: findings };
    }
    if (!findings.length) {
      return { segments: [{ text: content }], unmatchedFindings: [] };
    }

    const matches: Array<{ start: number; end: number; finding: Finding }> = [];

    for (const finding of findings) {
      const rawClaim = (finding.claim_text || "").trim();
      if (!rawClaim) continue;

      let start = content.indexOf(rawClaim);
      let matchLen = rawClaim.length;

      // Try unquoted match
      if (start === -1) {
        const unquoted = rawClaim.replace(/^["'“”‘]+|["'“”‘]+$/g, "").trim();
        if (unquoted.length > 5) {
          start = content.indexOf(unquoted);
          matchLen = unquoted.length;
        }
      }

      // Try case-insensitive match
      if (start === -1) {
        const lowerContent = content.toLowerCase();
        const lowerClaim = rawClaim.toLowerCase();
        start = lowerContent.indexOf(lowerClaim);
        matchLen = rawClaim.length;
      }

      // Try case-insensitive unquoted match
      if (start === -1) {
        const unquoted = rawClaim
          .replace(/^["'“”‘]+|["'“”‘]+$/g, "")
          .trim()
          .toLowerCase();
        if (unquoted.length > 5) {
          start = content.toLowerCase().indexOf(unquoted);
          matchLen = unquoted.length;
        }
      }

      if (start !== -1) {
        matches.push({
          start,
          end: start + matchLen,
          finding,
        });
      }
    }

    // Sort by start index ascending, then longest match first
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    // Exclude overlapping ranges
    const nonOverlapping: typeof matches = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        nonOverlapping.push(m);
        lastEnd = m.end;
      }
    }

    const matchedIds = new Set(nonOverlapping.map((m) => m.finding.finding_id));
    const unmatched = findings.filter((f) => !matchedIds.has(f.finding_id));

    // Construct text segments
    const segs: TextSegment[] = [];
    let cursor = 0;
    for (const m of nonOverlapping) {
      if (m.start > cursor) {
        segs.push({ text: content.slice(cursor, m.start) });
      }
      segs.push({
        text: content.slice(m.start, m.end),
        finding: m.finding,
      });
      cursor = m.end;
    }
    if (cursor < content.length) {
      segs.push({ text: content.slice(cursor) });
    }

    return { segments: segs, unmatchedFindings: unmatched };
  }, [submission?.content_text, findings]);

  // Non-supported findings for safer drafting remediation
  const nonSupportedFindings = useMemo(() => {
    return findings.filter((f) => f.status !== "supported");
  }, [findings]);

  // ACTION: Run verification
  async function handleRunVerification() {
    setError(null);
    setSuccessNotice(null);
    setIsVerifying(true);
    try {
      const updatedFindings = await api<Finding[]>(`/submissions/${id}/analyze`, {
        method: "POST",
      });
      const safeFindings = Array.isArray(updatedFindings) ? updatedFindings : [];
      setFindings(safeFindings);
      if (safeFindings.length > 0) {
        setSelectedFindingId(safeFindings[0].finding_id);
      }
      // Refresh submission to sync status
      if (submission) {
        setSubmission({
          ...submission,
          status: "analyzed",
        });
      }
      setSuccessNotice("Verification complete! Claims extracted and verified against evidence.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Verification failed. The model service might be busy; please retry.";
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  }

  // ACTION: Suggest safer wording
  async function handleSuggestSaferWording() {
    setError(null);
    setSuccessNotice(null);
    setIsRewriting(true);
    try {
      const updatedFindings = await api<Finding[]>(`/submissions/${id}/rewrite`, {
        method: "POST",
      });
      const safeFindings = Array.isArray(updatedFindings) ? updatedFindings : [];
      setFindings(safeFindings);
      setSuccessNotice("Safer phrasing generated for non-supported claims.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Remediation rewrite failed. Please try again in a moment.";
      setError(msg);
    } finally {
      setIsRewriting(false);
    }
  }

  // ACTION: Send for review
  async function handleSendForReview() {
    setError(null);
    setSuccessNotice(null);
    setIsSendingReview(true);
    try {
      const res = await api<{ id: string; status: SubmissionStatus }>(
        `/submissions/${id}/send-for-review`,
        { method: "POST" }
      );
      if (submission) {
        setSubmission({
          ...submission,
          status: res.status || "in_review",
        });
      }
      setSuccessNotice("Submission has been officially sent for reviewer sign-off!");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to send submission for review.";
      setError(msg);
    } finally {
      setIsSendingReview(false);
    }
  }

  // ACTION: Submit HumanGate decision (Approve, Request revision, Reject)
  async function handleDecision(decision: "approve" | "revise" | "reject") {
    setDecisionError(null);
    setError(null);
    setSuccessNotice(null);
    setIsSubmittingDecision(true);

    try {
      const payload = {
        decision,
        comment: decisionComment.trim() || undefined,
      };
      await api(`/submissions/${id}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Refresh submission
      const updatedSub = await api<Submission>(`/submissions/${id}`);
      setSubmission(updatedSub);

      // Refresh decisions history
      await fetchDecisions();

      // Clear comment
      setDecisionComment("");

      const actionText =
        decision === "approve"
          ? "approved"
          : decision === "revise"
          ? "marked for revision"
          : "rejected";
      setSuccessNotice(`Decision recorded successfully: submission ${actionText}.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to record decision. Please try again.";
      setDecisionError(msg);
    } finally {
      setIsSubmittingDecision(false);
    }
  }

  const isApproveDisabled =
    isSubmittingDecision ||
    isVerifying ||
    (nonSupportedFindings.length > 0 && !decisionComment.trim());

  // Clipboard copy helper
  function copyToClipboard(text: string, fid: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(fid);
    setTimeout(() => {
      setCopiedId((curr) => (curr === fid ? null : curr));
    }, 2000);
  }

  // Format date helper
  function formatDate(isoString?: string | null) {
    if (!isoString) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  }

  // Loading state
  if (initialLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
        <h2 className="font-heading text-lg font-bold text-[#152A35]">
          Loading Verification Audit…
        </h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Retrieving submission record, extracted claims, and evidence links.
        </p>
      </div>
    );
  }

  // Initial error state when submission cannot be loaded
  if (!submission && error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h2 className="font-heading text-lg font-bold text-[#152A35]">
          Failed to load submission
        </h2>
        <p className="text-xs text-slate-600 mt-1 mb-6 max-w-md mx-auto">{error}</p>
        <Link
          href="/submissions"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-[#152A35] text-white text-xs font-semibold hover:bg-[#1E3A49] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Submissions</span>
        </Link>
      </div>
    );
  }

  if (!submission) {
    return null;
  }

  const subStatus = SUBMISSION_STATUS[submission.status] || {
    label: submission.status,
    color: "#152A35",
    bg: "#E3E8EB",
    text: "#152A35",
    dot: "#152A35",
  };

  const isAnalysisDone =
    submission.status === "analyzed" ||
    submission.status === "revise" ||
    submission.status === "in_review" ||
    submission.status === "approved" ||
    submission.status === "rejected" ||
    findings.length > 0;

  // "Send for review" is enabled only after analysis (status must be analyzed or revise)
  const canSendForReview =
    (submission.status === "analyzed" || submission.status === "revise") &&
    !isSendingReview &&
    !isVerifying;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <Link
          href="/submissions"
          className="inline-flex items-center space-x-1.5 text-slate-500 hover:text-[#218C84] font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Submissions</span>
        </Link>
        <span className="font-mono text-[11px] text-slate-400">
          ID: {submission.id.slice(0, 8)}…
        </span>
      </div>

      {/* Red API Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#93000a] text-xs flex items-start justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-[#ba1a1a] shrink-0 mt-0.5">
              error
            </span>
            <div className="space-y-0.5">
              <span className="font-bold uppercase tracking-wider text-[11px]">
                API Error Encountered
              </span>
              <p className="leading-relaxed">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 hover:bg-[#ffdad6]/60 rounded text-[#93000a] transition-colors"
            title="Dismiss error message"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-[#E8F4EE] border border-[#3F8F6B]/30 text-[#2e6f52] text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#3F8F6B]">
              check_circle
            </span>
            <span className="font-medium">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="p-1 hover:bg-[#E8F4EE]/60 rounded text-[#2e6f52] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Header Card with Title, Status Pill, and Primary Actions */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-[#218C84]/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title & Metadata */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-[#218C84]">
                  verified
                </span>
                Verification Audit
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-slate-400">
                Created {formatDate(submission.created_at)}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-[#152A35] tracking-tight">
                {submission.title}
              </h1>

              {/* Status Pill */}
              <span
                style={{ backgroundColor: subStatus.bg, color: subStatus.text }}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0 shadow-xs"
              >
                <span
                  style={{ backgroundColor: subStatus.dot }}
                  className="w-2 h-2 rounded-full"
                />
                <span>{subStatus.label}</span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {/* Run Verification Button */}
            <button
              type="button"
              onClick={handleRunVerification}
              disabled={isVerifying || isSendingReview || isRewriting}
              className={`h-10 px-4 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-xs ${
                isVerifying
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-200"
                  : "bg-[#218C84] hover:bg-[#1a736d] text-white active:scale-[0.98]"
              }`}
            >
              {isVerifying ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin shrink-0" />
                  <span>Verifying claims (can take up to a minute)</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    {findings.length > 0 ? "sync" : "play_arrow"}
                  </span>
                  <span>{findings.length > 0 ? "Re-Verify Claims" : "Run verification"}</span>
                </>
              )}
            </button>

            {/* Send for Review Button */}
            <button
              type="button"
              onClick={handleSendForReview}
              disabled={!canSendForReview}
              title={
                !isAnalysisDone
                  ? "Analyze submission claims before sending for review"
                  : submission.status === "in_review"
                  ? "Submission is currently under review"
                  : submission.status === "approved"
                  ? "Submission is already approved"
                  : submission.status === "rejected"
                  ? "Submission was rejected"
                  : "Send to legal & brand governance queue"
              }
              className={`h-10 px-4 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all shadow-xs ${
                canSendForReview
                  ? "bg-[#152A35] hover:bg-[#1f3a47] text-white cursor-pointer active:scale-[0.98]"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
              }`}
            >
              {isSendingReview ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Sending…</span>
                </>
              ) : submission.status === "in_review" ? (
                <>
                  <span className="material-symbols-outlined text-[16px] text-[#D4A85A]">
                    hourglass_top
                  </span>
                  <span>In Review</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>Send for review</span>
                </>
              )}
            </button>

            {/* Reviewer / Admin Quick Jump to HumanGate Decision */}
            {isReviewerOrAdmin && (
              <a
                href="#humangate-decision-panel"
                className="h-10 px-4 rounded-lg font-semibold text-xs flex items-center space-x-1.5 bg-[#FAF4E8] hover:bg-[#faeed6] text-[#967129] border border-[#D4A85A]/40 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[16px]">gavel</span>
                <span>HumanGate Decision</span>
              </a>
            )}
          </div>
        </div>

        {/* Long Running Verification Progress Banner */}
        {isVerifying && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-3 text-xs text-[#218C84] bg-[#EAF3F1]/50 p-3 rounded-lg animate-pulse">
            <span className="w-4 h-4 border-2 border-[#218C84]/30 border-t-[#218C84] rounded-full animate-spin shrink-0" />
            <span className="font-semibold">
              Verifying claims against authoritative evidence records (can take up to a minute)…
            </span>
          </div>
        )}
      </div>

      {/* Telemetry Breakdown Cards (Visible when findings exist) */}
      {findings.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-[11px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-slate-400">
                analytics
              </span>
              Claim Assertion Telemetry ({telemetry.total} total)
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Health score:{" "}
              <strong
                className={
                  telemetry.supportedPct >= 70
                    ? "text-[#3F8F6B]"
                    : telemetry.supportedPct >= 40
                    ? "text-[#D4A85A]"
                    : "text-[#B85C55]"
                }
              >
                {telemetry.supportedPct}%
              </strong>{" "}
              supported
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {/* Supported */}
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-[#E8F4EE] text-[#3F8F6B] border border-[#3F8F6B]/20">
              <span className="font-heading text-lg font-bold leading-none">
                {telemetry.counts.supported}
              </span>
              <span className="text-[11px] font-semibold mt-1 truncate">Supported</span>
            </div>

            {/* Contradicted */}
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-[#F7EBEA] text-[#B85C55] border border-[#B85C55]/20">
              <span className="font-heading text-lg font-bold leading-none">
                {telemetry.counts.contradicted}
              </span>
              <span className="text-[11px] font-semibold mt-1 truncate">Contradicted</span>
            </div>

            {/* Outdated */}
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-[#FAF4E8] text-[#967129] border border-[#D4A85A]/30">
              <span className="font-heading text-lg font-bold leading-none">
                {telemetry.counts.outdated}
              </span>
              <span className="text-[11px] font-semibold mt-1 truncate">Outdated</span>
            </div>

            {/* Unsupported */}
            <div className="flex flex-col items-center p-2.5 rounded-lg bg-[#E4F1F0] text-[#1B6E67] border border-[#218C84]/20">
              <span className="font-heading text-lg font-bold leading-none">
                {telemetry.counts.unsupported}
              </span>
              <span className="text-[11px] font-semibold mt-1 truncate">Unsupported</span>
            </div>

            {/* Human Review */}
            <div className="col-span-2 sm:col-span-1 flex flex-col items-center p-2.5 rounded-lg bg-[#E3E8EB] text-[#152A35] border border-[#152A35]/20">
              <span className="font-heading text-lg font-bold leading-none">
                {telemetry.counts.human_review}
              </span>
              <span className="text-[11px] font-semibold mt-1 truncate">Human review</span>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Analysis State Banner */
        <div className="bg-[#FAF4E8] border border-[#D4A85A]/40 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#D4A85A] text-[24px] shrink-0 mt-0.5">
              info
            </span>
            <div>
              <h3 className="font-heading text-sm font-bold text-[#152A35]">
                Submission Awaiting Verification
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Click <strong>“Run verification”</strong> to extract individual marketing claims and
                verify them against authoritative brand evidence.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRunVerification}
            disabled={isVerifying}
            className="px-4 py-2 rounded-lg bg-[#218C84] hover:bg-[#1a736d] text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            <span>Run verification now</span>
          </button>
        </div>
      )}

      {/* Main 2-Column Section: Left Highlighted Content, Right Claim Deep Dive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Content Text with Claim Highlighting */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#152A35] text-[20px]">
                find_in_page
              </span>
              <h2 className="font-heading text-base font-bold text-[#152A35]">
                Ingested Marketing Copy
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Click any highlight to inspect claim
            </span>
          </div>

          {/* Highlighted Body Box */}
          <div className="p-4 rounded-lg bg-[#f4f4f2] text-slate-800 text-sm sm:text-base leading-relaxed tracking-normal font-sans border border-slate-200/60 whitespace-pre-wrap">
            {segments.length > 0 ? (
              segments.map((seg, idx) => {
                if (!seg.finding) {
                  return <span key={idx}>{seg.text}</span>;
                }

                const isSelected = selectedFinding?.finding_id === seg.finding.finding_id;
                const cfg = getStatusConfig(seg.finding.status);

                return (
                  <mark
                    key={idx}
                    onClick={() => setSelectedFindingId(seg.finding!.finding_id)}
                    style={{
                      backgroundColor: cfg.bg,
                      color: cfg.textColor,
                      borderColor: cfg.borderColor,
                    }}
                    className={`inline px-2 py-0.5 mx-0.5 rounded-md cursor-pointer transition-all border font-medium ${
                      isSelected
                        ? "ring-2 ring-offset-1 ring-[#152A35] shadow-xs font-semibold"
                        : "hover:opacity-80"
                    }`}
                    title={`[${cfg.label.toUpperCase()}] Click to view claim evidence`}
                  >
                    <span
                      style={{ backgroundColor: cfg.borderColor }}
                      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    />
                    {seg.text}
                  </mark>
                );
              })
            ) : (
              <span className="text-slate-400 italic">No content text available.</span>
            )}
          </div>

          {/* Color Status Legend */}
          <div className="flex items-center gap-3 pt-1 overflow-x-auto text-[11px] text-slate-600 font-medium pb-1 border-b border-slate-100">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3F8F6B]" /> Supported
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B85C55]" /> Contradicted
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4A85A]" /> Outdated
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#218C84]" /> Unsupported
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#152A35]" /> Human review
            </span>
          </div>

          {/* Unmatched Extracted Claims List (Per prompt: if a claim text is not found in content, list it below) */}
          {unmatchedFindings.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">format_list_bulleted</span>
                  Unmatched Extracted Claims ({unmatchedFindings.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Not directly positioned in text
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {unmatchedFindings.map((f) => {
                  const isSelected = selectedFinding?.finding_id === f.finding_id;
                  const cfg = getStatusConfig(f.status);

                  return (
                    <div
                      key={f.finding_id}
                      onClick={() => setSelectedFindingId(f.finding_id)}
                      style={{
                        backgroundColor: isSelected ? cfg.bg : "#ffffff",
                        borderColor: isSelected ? cfg.borderColor : "#E2E8F0",
                      }}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isSelected ? "ring-2 ring-offset-1 ring-[#152A35] shadow-xs" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <span
                          style={{ backgroundColor: cfg.bg, color: cfg.textColor }}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        >
                          {cfg.label}
                        </span>
                        <p className="font-medium text-slate-800 line-clamp-2">
                          “{f.claim_text}”
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400 font-semibold shrink-0 pt-0.5">
                        Inspect →
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Clicked Claim Inspection Panel */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-5">
          {selectedFinding ? (
            (() => {
              const cfg = getStatusConfig(selectedFinding.status);
              const confText = formatConfidence(selectedFinding.confidence);
              const evidenceList = selectedFinding.evidence || [];

              return (
                <>
                  {/* Status & Confidence Bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <span
                      style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}
                      className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </span>

                    {/* Confidence percentage or "No evidence found" */}
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#152A35]">
                      <span className="material-symbols-outlined text-[14px] text-[#218C84]">
                        psychology
                      </span>
                      <span>{confText}</span>
                    </div>
                  </div>

                  {/* Quoted Statement */}
                  <div className="p-3.5 rounded-lg bg-[#f4f4f2] border border-slate-200/70 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Identified Claim Statement
                    </span>
                    <p className="font-heading font-semibold text-sm text-[#152A35] leading-snug">
                      “{selectedFinding.claim_text}”
                    </p>
                  </div>

                  {/* Governance Explanation */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-[#218C84]">
                          policy
                        </span>
                        <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-[#152A35]">
                          Verification Analysis &amp; Rationale
                        </h3>
                      </div>
                      {selectedFinding.rule_type && (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {selectedFinding.rule_type}
                        </span>
                      )}
                    </div>
                    <div
                      style={{ backgroundColor: `${cfg.bg}80` }}
                      className="p-3.5 rounded-lg text-xs text-slate-700 leading-relaxed border border-slate-200/50"
                    >
                      {selectedFinding.explanation || "No explanation provided for this finding."}
                    </div>
                  </div>

                  {/* Evidence List */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-[#218C84]">
                          menu_book
                        </span>
                        Evidence Records ({evidenceList.length})
                      </span>
                    </div>

                    {evidenceList.length > 0 ? (
                      <div className="space-y-2.5">
                        {evidenceList.map((ev, i) => {
                          const expired = isExpired(ev.valid_until);

                          return (
                            <div
                              key={ev.chunk_id || i}
                              className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2"
                            >
                              {/* Doc Title & Expiry Tag */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5 min-w-0">
                                  <h4 className="font-heading text-xs font-bold text-[#152A35] truncate">
                                    {ev.doc_title || "Primary Evidence Ledger"}
                                  </h4>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {ev.valid_until && (
                                      <span className="text-[10px] text-slate-500">
                                        Valid until: {ev.valid_until}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Mark Expired in gold if valid_until is before today */}
                                {expired && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#FAF4E8] text-[#967129] border border-[#D4A85A]/50 shrink-0 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px] text-[#D4A85A]">
                                      event_busy
                                    </span>
                                    Expired
                                  </span>
                                )}
                              </div>

                              {/* Quoted Content */}
                              <div className="p-2.5 rounded bg-[#E4F1F0] text-[#1B6E67] text-xs italic leading-relaxed flex items-start gap-2 border border-[#218C84]/20">
                                <span className="material-symbols-outlined text-[#218C84] text-[16px] shrink-0 mt-0.5">
                                  format_quote
                                </span>
                                <span className="leading-relaxed">“{ev.content}”</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                        No documentary evidence linked to this assertion.
                      </div>
                    )}
                  </div>
                </>
              );
            })()
          ) : (
            /* Empty Right Panel State */
            <div className="p-8 text-center text-slate-400 space-y-2">
              <span className="material-symbols-outlined text-[36px] text-slate-300">
                manage_search
              </span>
              <p className="font-heading text-sm font-semibold text-slate-600">
                No Claim Selected
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                {findings.length > 0
                  ? "Click on any claim highlight in the copy to view its status badge, confidence, explanation, and evidence."
                  : "Run verification to extract assertions from this content."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* HumanGate Decision Panel (Visible ONLY when user role is reviewer or admin) */}
      {isReviewerOrAdmin && (
        <div
          id="humangate-decision-panel"
          className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-5"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#152A35] text-[22px]">
                  gavel
                </span>
                <h2 className="font-heading text-base font-bold text-[#152A35]">
                  HumanGate decision
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#152A35]/10 text-[#152A35] border border-[#152A35]/20">
                  {me?.role === "admin" ? "Admin Authority" : "Reviewer Authority"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Authoritative compliance gate. Record formal review decision, justification notes, and governance determination.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Current status:</span>
              <span
                style={{ backgroundColor: subStatus.bg, color: subStatus.text }}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-2xs"
              >
                <span
                  style={{ backgroundColor: subStatus.dot }}
                  className="w-1.5 h-1.5 rounded-full"
                />
                <span>{subStatus.label}</span>
              </span>
            </div>
          </div>

          {/* Warning banner when non-supported findings exist */}
          {nonSupportedFindings.length > 0 && (
            <div className="p-3.5 rounded-lg bg-[#FAF4E8] border border-[#D4A85A]/40 text-[#967129] text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-[#D4A85A] shrink-0 mt-0.5">
                warning
              </span>
              <div className="space-y-0.5">
                <span className="font-bold">
                  Justification comment required to approve:
                </span>
                <p className="text-[11px] leading-relaxed">
                  This submission contains {nonSupportedFindings.length} non-supported finding
                  {nonSupportedFindings.length > 1 ? "s" : ""}. To approve with open findings, enter a written
                  justification in the comment box below before clicking Approve.
                </p>
              </div>
            </div>
          )}

          {/* Decision API Error display */}
          {decisionError && (
            <div className="p-3.5 rounded-lg bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#93000a] text-xs flex items-start justify-between gap-2.5 animate-in fade-in">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#ba1a1a] shrink-0 mt-0.5">
                  error
                </span>
                <div className="space-y-0.5">
                  <span className="font-bold uppercase tracking-wider text-[11px]">
                    Decision Error
                  </span>
                  <p className="leading-relaxed">{decisionError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDecisionError(null)}
                className="p-1 hover:bg-[#ffdad6]/60 rounded text-[#93000a] transition-colors"
                title="Dismiss error"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          {/* Comment Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="human-gate-comment"
                className="block text-xs font-semibold text-[#152A35]"
              >
                Governance Decision Comment
                {nonSupportedFindings.length > 0 && (
                  <span className="text-[#B85C55] font-bold ml-1">
                    * Required for Approval
                  </span>
                )}
              </label>
              <span className="text-[11px] text-slate-400">
                Logged to immutable audit history
              </span>
            </div>
            <textarea
              id="human-gate-comment"
              rows={3}
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              disabled={isSubmittingDecision}
              placeholder={
                nonSupportedFindings.length > 0
                  ? "Provide mandatory justification explaining why non-supported claims are being approved, or detail required revisions..."
                  : "Enter compliance notes or review feedback (optional)..."
              }
              className="w-full px-3.5 py-2.5 text-xs text-[#152A35] bg-[#F7F7F5] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition-all placeholder:text-slate-400 resize-y"
            />
          </div>

          {/* 3 Buttons: Approve, Request revision, Reject */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Approve Button */}
            <button
              type="button"
              onClick={() => handleDecision("approve")}
              disabled={isApproveDisabled}
              title={
                nonSupportedFindings.length > 0 && !decisionComment.trim()
                  ? "Enter a justification comment to enable approval with non-supported findings"
                  : "Approve submission"
              }
              className={`h-10 px-5 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all shadow-xs ${
                isApproveDisabled
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-[#3F8F6B] hover:bg-[#34785a] text-white cursor-pointer active:scale-[0.98]"
              }`}
            >
              {isSubmittingDecision ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
              )}
              <span>Approve</span>
            </button>

            {/* Request Revision Button */}
            <button
              type="button"
              onClick={() => handleDecision("revise")}
              disabled={isSubmittingDecision}
              title="Request revision from the author"
              className={`h-10 px-5 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all shadow-xs ${
                isSubmittingDecision
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-[#D4A85A] hover:bg-[#c49848] text-white cursor-pointer active:scale-[0.98]"
              }`}
            >
              {isSubmittingDecision ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
              )}
              <span>Request revision</span>
            </button>

            {/* Reject Button */}
            <button
              type="button"
              onClick={() => handleDecision("reject")}
              disabled={isSubmittingDecision}
              title="Reject this submission"
              className={`h-10 px-5 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all shadow-xs ${
                isSubmittingDecision
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-[#B85C55] hover:bg-[#a24e47] text-white cursor-pointer active:scale-[0.98]"
              }`}
            >
              {isSubmittingDecision ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">cancel</span>
              )}
              <span>Reject</span>
            </button>
          </div>

          {/* Decision History Section */}
          <div className="pt-5 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-bold text-[#152A35] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#218C84]">history</span>
                Decision History ({decisionsHistory.length})
              </h3>
              {loadingDecisions && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <span className="w-2.5 h-2.5 border-2 border-slate-300 border-t-[#218C84] rounded-full animate-spin" />
                  Updating…
                </span>
              )}
            </div>

            {decisionsHistory.length === 0 ? (
              <div className="p-4 rounded-lg bg-[#F7F7F5] border border-slate-200/60 text-center text-xs text-slate-400">
                No governance decisions recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {decisionsHistory.map((item, idx) => {
                  const isApp = item.decision === "approve";
                  const isRev = item.decision === "revise";
                  const bBg = isApp ? "#E8F4EE" : isRev ? "#FAF4E8" : "#F7EBEA";
                  const bText = isApp ? "#2e6f52" : isRev ? "#87621c" : "#9c3b35";
                  const bLabel = isApp ? "Approved" : isRev ? "Revision Requested" : "Rejected";
                  const bIcon = isApp ? "check_circle" : isRev ? "edit_note" : "cancel";

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg bg-[#F7F7F5] border border-slate-200/80 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            style={{ backgroundColor: bBg, color: bText }}
                            className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                          >
                            <span className="material-symbols-outlined text-[13px]">{bIcon}</span>
                            <span>{bLabel}</span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            Reviewer: {item.reviewer_id ? `${item.reviewer_id.slice(0, 8)}…` : "—"}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      {item.comment ? (
                        <p className="text-slate-700 bg-white p-2.5 rounded border border-slate-200/60 leading-relaxed font-sans text-xs">
                          “{item.comment}”
                        </p>
                      ) : (
                        <p className="text-slate-400 italic text-[11px]">
                          No written comment attached to this decision.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BELOW: Remediation & Safer Wording Section */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#218C84] text-[20px]">
                auto_fix_high
              </span>
              <h2 className="font-heading text-base font-bold text-[#152A35]">
                Compliance Remediation (IntentLock™)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Safer phrasing drafts synthesized to preserve marketing intent while conforming with
              verified brand evidence.
            </p>
          </div>

          {/* Button: Suggest safer wording */}
          <button
            type="button"
            onClick={handleSuggestSaferWording}
            disabled={isRewriting || isVerifying || findings.length === 0}
            className={`h-10 px-4 rounded-lg font-semibold text-xs flex items-center space-x-2 transition-all shrink-0 shadow-xs ${
              findings.length === 0
                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                : isRewriting
                ? "bg-[#FAF4E8] text-[#967129] border border-[#D4A85A]/40 cursor-wait"
                : "bg-[#FAF4E8] hover:bg-[#faeed6] text-[#967129] border border-[#D4A85A]/40 cursor-pointer active:scale-[0.98]"
            }`}
          >
            {isRewriting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-[#D4A85A]/40 border-t-[#D4A85A] rounded-full animate-spin" />
                <span>Generating safer wording…</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                <span>Suggest safer wording</span>
              </>
            )}
          </button>
        </div>

        {/* List of Before | Safer Draft Cards for non-supported findings */}
        {findings.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Run verification above to identify claims requiring remediation.
          </div>
        ) : nonSupportedFindings.length === 0 ? (
          <div className="p-6 rounded-lg bg-[#E8F4EE] border border-[#3F8F6B]/30 text-[#2e6f52] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#3F8F6B]">
                verified
              </span>
              <span className="font-semibold">
                All identified claims are verified as Supported. No remediation rewrites required!
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {nonSupportedFindings.map((finding) => {
              const cfg = getStatusConfig(finding.status);

              return (
                <div
                  key={finding.finding_id}
                  className="rounded-xl border border-slate-200 overflow-hidden shadow-xs"
                >
                  {/* Card Header */}
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      >
                        {cfg.label}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-600">
                        Claim #{finding.position || "—"}
                      </span>
                    </div>
                    {finding.explanation && (
                      <span className="text-[11px] text-slate-500 italic max-w-md truncate">
                        {finding.explanation}
                      </span>
                    )}
                  </div>

                  {/* Side-by-side Before | Safer draft comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    {/* Before (Current Draft) */}
                    <div className="p-4 bg-[#F7EBEA]/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#B85C55] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">close</span>
                          Before (Current Draft)
                        </span>
                        <span className="text-[10px] font-semibold text-[#B85C55] bg-[#F7EBEA] px-2 py-0.5 rounded">
                          Non-Compliant
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 line-through opacity-85 leading-relaxed">
                        “{finding.claim_text}”
                      </p>
                    </div>

                    {/* Safer Draft (Governance Recommended) */}
                    <div className="p-4 bg-[#E8F4EE]/40 space-y-2 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#3F8F6B] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">verified</span>
                            Safer Draft (Governance Recommended)
                          </span>
                          {finding.safer_draft && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(finding.safer_draft!, finding.finding_id)
                              }
                              className="text-[10px] font-semibold text-[#2e6f52] hover:text-[#1b736c] px-2 py-0.5 rounded bg-white border border-[#3F8F6B]/30 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {copiedId === finding.finding_id ? "check" : "content_copy"}
                              </span>
                              <span>{copiedId === finding.finding_id ? "Copied" : "Copy"}</span>
                            </button>
                          )}
                        </div>

                        {finding.safer_draft ? (
                          <p className="text-xs font-semibold text-slate-900 leading-relaxed bg-white p-3 rounded-lg border border-[#3F8F6B]/30 shadow-2xs">
                            “{finding.safer_draft}”
                          </p>
                        ) : (
                          /* Prompt: when safer_draft is null show “No safe rewrite available, needs human edit” */
                          <div className="p-3 rounded-lg bg-[#FAF4E8] border border-[#D4A85A]/40 text-[#967129] text-xs flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-[#D4A85A] shrink-0">
                              warning
                            </span>
                            <span className="font-medium">
                              No safe rewrite available, needs human edit
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

