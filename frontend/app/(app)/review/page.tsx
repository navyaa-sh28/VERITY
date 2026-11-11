"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { SUBMISSION_STATUS, STATUS, ReviewQueueItem, Status } from "@/lib/status";

// All five finding statuses in display order
const FINDING_STATUSES: Status[] = [
  "supported",
  "contradicted",
  "outdated",
  "unsupported",
  "human_review",
];

function formatDate(isoString: string) {
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

export default function ReviewQueuePage() {
  const { me, loading: authLoading } = useAuth();

  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!me || me.role === "creator") return;

    async function fetchQueue() {
      try {
        setError(null);
        const data = await api<ReviewQueueItem[]>("/review/queue");
        setQueue(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load review queue. Please try again.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    fetchQueue();
  }, [authLoading, me]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Loading Review Queue…</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Fetching submissions awaiting governance decision.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Failed to load queue</h2>
        <p className="text-xs text-slate-600 mt-1 mb-6 max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            api<ReviewQueueItem[]>("/review/queue")
              .then((data) => setQueue(Array.isArray(data) ? data : []))
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Retry failed.")
              )
              .finally(() => setLoading(false));
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-[#218C84] text-white text-xs font-semibold hover:bg-[#1a736d] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[#218C84] text-[20px]">fact_check</span>
            <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
              Governance Gate
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight mt-1">
            Review Queue
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Submissions awaiting HumanGate governance decision. Click any row to open the full
            verification audit and record your decision.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-heading text-3xl font-bold text-[#152A35]">{queue.length}</span>
          <span className="text-sm text-slate-500 leading-tight">
            submission{queue.length !== 1 ? "s" : ""}
            <br />
            pending
          </span>
        </div>
      </div>

      {/* Empty State */}
      {queue.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-16 flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[#EAF3F1] flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px] text-[#218C84]">
              check_circle
            </span>
          </div>
          <h3 className="font-heading text-base font-bold text-[#152A35]">Queue is clear</h3>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            No submissions are currently awaiting review. All pending governance decisions have been
            recorded.
          </p>
        </div>
      ) : (
        /* Table */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                  Submission Title
                </th>
                <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden sm:table-cell">
                  Status
                </th>
                <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden md:table-cell">
                  Submitted
                </th>
                <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                  Finding Counts
                </th>
                <th className="px-5 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {queue.map((item) => {
                const subSt =
                  SUBMISSION_STATUS[item.status] || {
                    label: item.status,
                    bg: "#E3E8EB",
                    text: "#152A35",
                    dot: "#152A35",
                  };

                const totalFindings = Object.values(item.finding_counts).reduce(
                  (a, b) => a + b,
                  0
                );

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[#EAF3F1]/30 transition-colors group"
                  >
                    {/* Title */}
                    <td className="px-5 py-4">
                      <div className="space-y-1 max-w-xs">
                        <Link
                          href={`/submissions/${item.id}`}
                          className="font-semibold text-[#152A35] hover:text-[#218C84] transition-colors leading-snug line-clamp-2"
                        >
                          {item.title}
                        </Link>
                        <div className="font-mono text-[10px] text-slate-400">
                          {item.id.slice(0, 8)}…
                        </div>
                        {/* Mobile-only status pill */}
                        <div className="sm:hidden mt-1">
                          <span
                            style={{ backgroundColor: subSt.bg, color: subSt.text }}
                            className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          >
                            <span
                              style={{ backgroundColor: subSt.dot }}
                              className="w-1.5 h-1.5 rounded-full"
                            />
                            <span>{subSt.label}</span>
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span
                        style={{ backgroundColor: subSt.bg, color: subSt.text }}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0"
                      >
                        <span
                          style={{ backgroundColor: subSt.dot }}
                          className="w-1.5 h-1.5 rounded-full"
                        />
                        <span>{subSt.label}</span>
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-slate-500 hidden md:table-cell whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </td>

                    {/* Finding Counts Chips */}
                    <td className="px-5 py-4">
                      {totalFindings === 0 ? (
                        <span className="text-slate-400 italic">No findings yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {FINDING_STATUSES.map((st) => {
                            const count = item.finding_counts[st] ?? 0;
                            if (count === 0) return null;
                            const cfg = STATUS[st];
                            return (
                              <span
                                key={st}
                                title={cfg.label}
                                style={{
                                  backgroundColor: `${cfg.color}18`,
                                  color: cfg.color,
                                  borderColor: `${cfg.color}40`,
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border"
                              >
                                <span
                                  style={{ backgroundColor: cfg.color }}
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                />
                                <span>{count}</span>
                                <span className="hidden sm:inline">{cfg.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/submissions/${item.id}#humangate-decision-panel`}
                        className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#152A35] hover:bg-[#1f3a47] text-white text-xs font-semibold transition-all shadow-xs active:scale-[0.98] group-hover:shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[15px]">gavel</span>
                        <span>Review</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Table Footer Summary */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {queue.length} submission{queue.length !== 1 ? "s" : ""} pending governance decision
            </span>
            <span className="font-mono">
              {queue.filter((q) => q.status === "in_review").length} in active review ·{" "}
              {queue.filter((q) => q.status === "analyzed").length} analyzed, awaiting queue entry
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

