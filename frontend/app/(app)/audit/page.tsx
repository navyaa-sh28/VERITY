"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | string | null;
  created_at: string;
  actor_email: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Map action strings to a colour token so rows are skimmable. */
const ACTION_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  // create / upload
  create:  { bg: "#E8F4EE", text: "#3F8F6B", dot: "#3F8F6B" },
  upload:  { bg: "#E8F4EE", text: "#3F8F6B", dot: "#3F8F6B" },
  // publish / approve
  publish: { bg: "#EAF3F1", text: "#218C84", dot: "#218C84" },
  approve: { bg: "#EAF3F1", text: "#218C84", dot: "#218C84" },
  // analyze / rewrite
  analyze: { bg: "#F0F4FF", text: "#4B72C4", dot: "#4B72C4" },
  rewrite: { bg: "#F0F4FF", text: "#4B72C4", dot: "#4B72C4" },
  // reject / delete
  reject:  { bg: "#F7EBEA", text: "#B85C55", dot: "#B85C55" },
  delete:  { bg: "#F7EBEA", text: "#B85C55", dot: "#B85C55" },
  // revise / update
  revise:  { bg: "#FAF4E8", text: "#967129", dot: "#D4A85A" },
  update:  { bg: "#FAF4E8", text: "#967129", dot: "#D4A85A" },
  // decision (generic reviewer action)
  decision:{ bg: "#F3F0FF", text: "#7C5CBF", dot: "#7C5CBF" },
};

function actionStyle(action: string) {
  const key = action.toLowerCase().split("_")[0];
  return (
    ACTION_STYLES[key] ?? { bg: "#F1F5F9", text: "#475569", dot: "#94A3B8" }
  );
}

/** Render a compact, readable summary of the details payload. */
function DetailsCell({ details }: { details: AuditEntry["details"] }) {
  if (details === null || details === undefined) {
    return <span className="text-slate-400 italic">—</span>;
  }

  if (typeof details === "string") {
    return (
      <span className="text-slate-600 break-words">{details}</span>
    );
  }

  // Object: show each key: value on a compact inline list, truncated
  const entries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  if (entries.length === 0) {
    return <span className="text-slate-400 italic">—</span>;
  }

  return (
    <ul className="space-y-0.5">
      {entries.slice(0, 4).map(([k, v]) => (
        <li key={k} className="flex items-baseline gap-1 min-w-0">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">
            {k}
          </span>
          <span className="text-[11px] text-slate-600 truncate max-w-[180px]" title={String(v)}>
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </li>
      ))}
      {entries.length > 4 && (
        <li className="text-[10px] text-slate-400 italic">
          +{entries.length - 4} more…
        </li>
      )}
    </ul>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin-only guard
  useEffect(() => {
    if (!authLoading && me && me.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, me, router]);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<AuditEntry[]>("/audit");
      setEntries(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!me || me.role !== "admin") return;
    fetchAudit();
  }, [authLoading, me, fetchAudit]);

  // ── Auth loading ───────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Loading…</h2>
      </div>
    );
  }

  if (!me || me.role !== "admin") return null;

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="material-symbols-outlined text-[#218C84] text-[20px]">history</span>
            <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
              Admin
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight">
            Audit Log
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Immutable record of every create, analyze, decision, and publish action.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAudit}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 shrink-0 shadow-xs"
        >
          <span
            className={`material-symbols-outlined text-[15px] ${loading ? "animate-spin" : ""}`}
          >
            refresh
          </span>
          Refresh
        </button>
      </div>

      {/* ── Data loading spinner ── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-14 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading audit log…</p>
        </div>
      ) : error ? (
        /* ── Error state ── */
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-[22px]">error</span>
          </div>
          <h2 className="font-heading text-base font-bold text-[#152A35]">
            Failed to load audit log
          </h2>
          <p className="text-xs text-slate-600 mt-1 mb-5 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={fetchAudit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#218C84] text-white text-xs font-semibold hover:bg-[#1a736d] transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        /* ── Empty state ── */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-16 flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[#EAF3F1] flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px] text-[#218C84]">history</span>
          </div>
          <h3 className="font-heading text-base font-bold text-[#152A35]">No audit entries yet</h3>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Actions will appear here as users create submissions, run analysis, and record decisions.
          </p>
        </div>
      ) : (
        /* ── Table ── */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    Time
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    Actor
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    Action
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap hidden sm:table-cell">
                    Entity
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden lg:table-cell">
                    Details
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, i) => {
                  const style = actionStyle(entry.action);
                  return (
                    <tr
                      key={`${entry.created_at}-${i}`}
                      className="hover:bg-[#EAF3F1]/25 transition-colors"
                    >
                      {/* Time */}
                      <td className="px-5 py-3.5 whitespace-nowrap align-top">
                        <span className="font-mono text-[11px] text-slate-500 leading-snug">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#218C84]/15 text-[#218C84] flex items-center justify-center font-bold text-[10px] shrink-0">
                            {entry.actor_email
                              ? entry.actor_email.charAt(0).toUpperCase()
                              : "?"}
                          </div>
                          <span
                            className="text-[11px] font-medium text-[#152A35] truncate max-w-[140px]"
                            title={entry.actor_email}
                          >
                            {entry.actor_email || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 align-top">
                        <span
                          style={{ backgroundColor: style.bg, color: style.text }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        >
                          <span
                            style={{ backgroundColor: style.dot }}
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                          />
                          {entry.action}
                        </span>
                      </td>

                      {/* Entity type + id */}
                      <td className="px-5 py-3.5 align-top hidden sm:table-cell">
                        <div className="text-[11px] font-semibold text-slate-700 capitalize">
                          {entry.entity_type}
                        </div>
                        {entry.entity_id && (
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                            {entry.entity_id.length > 12
                              ? `${entry.entity_id.slice(0, 8)}…`
                              : entry.entity_id}
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-5 py-3.5 align-top hidden lg:table-cell max-w-[280px]">
                        <DetailsCell details={entry.details} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {entries.length} audit entr{entries.length !== 1 ? "ies" : "y"}
            </span>
            <span className="font-mono">
              Latest:{" "}
              {entries[0]
                ? formatDateTime(entries[0].created_at)
                : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

