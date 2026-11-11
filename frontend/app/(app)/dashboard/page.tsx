"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── API shape types ──────────────────────────────────────────────────────────

interface Summary {
  submissions: number;
  open_findings: number;
  avg_turnaround_hours: number | null;
  active_guideline: string | null;
}

interface ThroughputPoint {
  week: string;
  findings: number;
  approved: number;
}

interface Pattern {
  label: string;
  count: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTurnaround(hours: number | null): string {
  if (hours === null || hours === undefined) return "n/a";
  return `${hours.toFixed(1)}h`;
}

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}

function StatCard({ icon, label, value, iconBg, iconColor, loading }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ color: iconColor }}
        >
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
          {label}
        </p>
        {loading ? (
          <div className="h-7 w-16 bg-slate-100 animate-pulse rounded" />
        ) : (
          <p className="font-heading text-2xl font-bold text-[#152A35] leading-none">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-[#152A35] mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-slate-600 capitalize">{p.name}:</span>
          <span className="font-semibold text-[#152A35]">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { me, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all analytics data in parallel
  useEffect(() => {
    if (authLoading) return;
    if (!me || me.role === "creator") return;

    async function fetchAll() {
      try {
        setError(null);
        const [sum, thru, patt] = await Promise.all([
          api<Summary>("/analytics/summary"),
          api<ThroughputPoint[]>("/analytics/throughput"),
          api<Pattern[]>("/analytics/patterns"),
        ]);
        setSummary(sum);
        setThroughput(Array.isArray(thru) ? thru : []);
        setPatterns(Array.isArray(patt) ? patt : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
      } finally {
        setDataLoading(false);
      }
    }

    fetchAll();
  }, [authLoading, me]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (authLoading || (dataLoading && !error)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Loading Dashboard…</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Pulling analytics data from the governance engine.
        </p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Failed to load dashboard</h2>
        <p className="text-xs text-slate-600 mt-1 mb-6 max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={() => {
            setDataLoading(true);
            setError(null);
            Promise.all([
              api<Summary>("/analytics/summary"),
              api<ThroughputPoint[]>("/analytics/throughput"),
              api<Pattern[]>("/analytics/patterns"),
            ])
              .then(([sum, thru, patt]) => {
                setSummary(sum);
                setThroughput(Array.isArray(thru) ? thru : []);
                setPatterns(Array.isArray(patt) ? patt : []);
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Retry failed.")
              )
              .finally(() => setDataLoading(false));
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-[#218C84] text-white text-xs font-semibold hover:bg-[#1a736d] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // Max count for the patterns bar width calculation
  const maxPatternCount = patterns.length > 0 ? Math.max(...patterns.map((p) => p.count)) : 1;

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Page Header */}
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <span className="material-symbols-outlined text-[#218C84] text-[20px]">dashboard</span>
          <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
            Analytics
          </span>
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Governance health metrics and review throughput at a glance.
        </p>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="description"
          label="Submissions"
          value={summary?.submissions ?? "—"}
          iconBg="#EAF3F1"
          iconColor="#218C84"
          loading={dataLoading}
        />
        <StatCard
          icon="report"
          label="Open findings"
          value={summary?.open_findings ?? "—"}
          iconBg="#FFF5E6"
          iconColor="#D4A85A"
          loading={dataLoading}
        />
        <StatCard
          icon="schedule"
          label="Avg turnaround"
          value={formatTurnaround(summary?.avg_turnaround_hours ?? null)}
          iconBg="#F0F4FF"
          iconColor="#4B72C4"
          loading={dataLoading}
        />
        <StatCard
          icon="policy"
          label="Guidelines version"
          value={summary?.active_guideline ?? "—"}
          iconBg="#F3F0FF"
          iconColor="#7C5CBF"
          loading={dataLoading}
        />
      </div>

      {/* ── Chart + Patterns row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LineChart — takes 2/3 width on large screens */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-heading text-base font-bold text-[#152A35]">
                Weekly review throughput
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Findings vs. approved submissions over the last 6 weeks
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: "#218C84" }} />
                Findings
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: "#D4A85A" }} />
                Approved
              </span>
            </div>
          </div>

          {throughput.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <span className="material-symbols-outlined text-[32px]">bar_chart</span>
              <span>No throughput data yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={throughput}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ display: "none" }}
                />
                <Line
                  type="monotone"
                  dataKey="findings"
                  stroke="#218C84"
                  strokeWidth={2.5}
                  dot={{ fill: "#218C84", r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name="Findings"
                />
                <Line
                  type="monotone"
                  dataKey="approved"
                  stroke="#D4A85A"
                  strokeWidth={2.5}
                  dot={{ fill: "#D4A85A", r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name="Approved"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Recurring Findings — 1/3 width on large screens */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 flex flex-col">
          <div className="mb-5">
            <h2 className="font-heading text-base font-bold text-[#152A35]">
              Top recurring findings
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Most flagged claim patterns</p>
          </div>

          {patterns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <span className="material-symbols-outlined text-[32px]">search_off</span>
              <span>No pattern data yet</span>
            </div>
          ) : (
            <ol className="space-y-3 flex-1">
              {patterns.map((p, i) => {
                const barWidth = Math.round((p.count / maxPatternCount) * 100);
                return (
                  <li key={p.label} className="flex items-center gap-3">
                    {/* Rank */}
                    <span className="w-5 text-[11px] font-bold text-slate-400 shrink-0 text-right">
                      {i + 1}
                    </span>
                    {/* Label + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-xs font-medium text-[#152A35] truncate leading-tight pr-2"
                          title={p.label}
                        >
                          {p.label}
                        </span>
                        <span className="text-xs font-bold text-[#218C84] shrink-0">{p.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: i === 0 ? "#218C84" : i === 1 ? "#2aaa9f" : "#77d6cd",
                          }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Disclaimer note */}
          <p className="mt-5 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
            Illustrative demo data, not live product metrics.
          </p>
        </div>
      </div>
    </div>
  );
}

