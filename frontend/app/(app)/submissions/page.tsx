"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SUBMISSION_STATUS, Submission, SubmissionStatus } from "@/lib/status";

export default function SubmissionsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function fetchSubmissions() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Submission[]>("/submissions");
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load submissions. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubmissions();
  }, []);

  // Filtered submissions based on search and status filter
  const filtered = submissions.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content_text.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  function formatDate(isoString: string) {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return isoString;
    }
  }

  function getStatusBadge(status: SubmissionStatus | string) {
    const s = SUBMISSION_STATUS[status as SubmissionStatus] || {
      label: status,
      color: "#152A35",
      bg: "#E3E8EB",
      text: "#152A35",
      dot: "#152A35",
    };

    return (
      <span
        style={{ backgroundColor: s.bg, color: s.text }}
        className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0"
      >
        <span
          style={{ backgroundColor: s.dot }}
          className="w-1.5 h-1.5 rounded-full shrink-0"
        />
        <span>{s.label}</span>
      </span>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[#218C84] text-[20px]">
              table_rows
            </span>
            <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
              Governance Registry
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight mt-1">
            Campaign Submissions
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Browse, monitor verification status, and audit claims across all brand campaign materials.
          </p>
        </div>

        <Link
          href="/submit"
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-[#218C84] hover:bg-[#1b736c] text-white text-sm font-semibold shadow-sm transition-all active:scale-[0.99] self-start sm:self-auto shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>New Submission</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or text..."
            className="w-full h-10 pl-9 pr-3 text-sm bg-[#F7F7F5]/70 rounded-lg border border-slate-300 focus:bg-white focus:border-[#218C84] focus:ring-2 focus:ring-[#218C84]/20 outline-none transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { label: "All", value: "all" },
            { label: "Submitted", value: "submitted" },
            { label: "Analyzed", value: "analyzed" },
            { label: "In Review", value: "in_review" },
            { label: "Approved", value: "approved" },
            { label: "Revise", value: "revise" },
            { label: "Rejected", value: "rejected" },
          ].map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[#152A35] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content States */}
      {loading ? (
        /* Loading State */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 border-3 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
          <h3 className="font-heading text-base font-bold text-[#152A35]">
            Loading submissions…
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Fetching campaign records and verification telemetry from the registry.
          </p>
        </div>
      ) : error ? (
        /* Error State */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-8 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#93000a] flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[24px]">error</span>
          </div>
          <h3 className="font-heading text-base font-bold text-[#152A35]">
            Failed to load submissions
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">{error}</p>
          <button
            type="button"
            onClick={fetchSubmissions}
            className="mt-4 px-4 py-2 rounded-lg bg-[#152A35] hover:bg-[#1E3A49] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Try Again</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-[#EAF3F1] text-[#218C84] flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px]">folder_open</span>
          </div>
          <h3 className="font-heading text-lg font-bold text-[#152A35]">
            {searchQuery || statusFilter !== "all"
              ? "No matching submissions found"
              : "No submissions yet"}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your search keywords or filter criteria to see more records."
              : "Get started by submitting your first marketing copy or campaign assertions for brand governance and verification."}
          </p>
          {searchQuery || statusFilter !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Clear Filters
            </button>
          ) : (
            <Link
              href="/submit"
              className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-[#218C84] hover:bg-[#1b736c] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Create First Submission</span>
            </Link>
          )}
        </div>
      ) : (
        /* Table List of Submissions */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th scope="col" className="py-3.5 px-4 sm:px-6">
                    Submission Title
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">
                    Status
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6">
                    Created Date
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/submissions/${item.id}`)}
                    className="hover:bg-[#F7F7F5] transition-colors cursor-pointer group"
                  >
                    {/* Title & Preview */}
                    <td className="py-4 px-4 sm:px-6 min-w-[240px]">
                      <div className="flex flex-col">
                        <Link
                          href={`/submissions/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-[#152A35] group-hover:text-[#218C84] transition-colors line-clamp-1"
                        >
                          {item.title}
                        </Link>
                        {item.content_text && (
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {item.content_text}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Status Pill */}
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Created Date */}
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap text-xs text-slate-600 font-mono">
                      {formatDate(item.created_at)}
                    </td>

                    {/* Action Arrow */}
                    <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                      <span className="inline-flex items-center space-x-1 text-xs font-semibold text-[#218C84] group-hover:text-[#1b736c] transition-colors">
                        <span>View</span>
                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                          arrow_forward
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Telemetry */}
          <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {filtered.length} of {submissions.length} submission{submissions.length === 1 ? "" : "s"}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              AUDIT REGISTRY v4.3
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

