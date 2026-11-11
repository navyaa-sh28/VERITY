"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Submission } from "@/lib/status";

const SAMPLE_COPY =
  "CloudSuite 2.0 cuts enterprise infrastructure carbon emissions by 48% across all deployments. Trusted by over 10,000 global enterprises, we guarantee 99.999% uninterrupted uptime with zero configuration overhead, outperforming legacy competitor Apex Cloud by 3.5x in throughput benchmarks.";

export default function SubmitPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [contentText, setContentText] = useState("");
  const [assetType, setAssetType] = useState("Landing Page");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  const estimatedClaims = Math.max(0, Math.floor(wordCount / 12));

  function loadSample() {
    setTitle("Q3 CloudSuite Launch Campaign - Hero Copy");
    setContentText(SAMPLE_COPY);
    setAssetType("Landing Page");
    setError(null);
  }

  function handleClear() {
    setTitle("");
    setContentText("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanTitle = title.trim();
    const cleanContent = contentText.trim();

    if (!cleanTitle) {
      setError("Please provide a submission title.");
      return;
    }
    if (!cleanContent) {
      setError("Please provide marketing copy or claim text to verify.");
      return;
    }

    setSubmitting(true);

    try {
      const submission = await api<Submission>("/submissions", {
        method: "POST",
        body: JSON.stringify({
          title: cleanTitle,
          content_text: cleanContent,
        }),
      });

      router.push(`/submissions/${submission.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create submission. Please try again.";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header & Context */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#EAF3F1] text-[#218C84] text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#218C84] mr-1.5 animate-pulse" />
              Audit Engine Live
            </span>
            <span className="text-xs text-slate-500 font-medium">Protocol v4.3-Active</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={loadSample}
              className="text-xs font-semibold text-[#218C84] hover:text-[#1b736c] px-2.5 py-1 rounded bg-[#EAF3F1] hover:bg-[#d6eae6] transition-colors flex items-center space-x-1"
            >
              <span className="material-symbols-outlined text-[16px]">data_object</span>
              <span>Load Sample Copy</span>
            </button>
            <Link
              href="/submissions"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded hover:bg-slate-200/60 transition-colors flex items-center space-x-1"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>All Submissions</span>
            </Link>
          </div>
        </div>

        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight">
            New Content Submission
          </h1>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            Submit marketing copy, campaign assertions, or press releases for automated evidence verification and governance review.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-[#ffdad6] border border-[#ba1a1a]/25 text-[#93000a] text-sm flex items-start space-x-3">
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">error</span>
          <div className="flex-1">
            <p className="font-semibold">Submission failed</p>
            <p className="text-xs mt-0.5 leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[#93000a] hover:opacity-75 p-0.5"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Form Submission */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Metadata Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2 text-[#152A35]">
              <span className="material-symbols-outlined text-[#218C84] text-[20px]">
                fact_check
              </span>
              <h2 className="font-heading text-base font-bold">Campaign Metadata</h2>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-0.5 rounded-full">
              Step 1 of 2
            </span>
          </div>

          {/* Submission Title Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="submission-title"
              className="block text-xs font-semibold text-slate-800"
            >
              Submission Title <span className="text-[#B85C55]">*</span>
            </label>
            <input
              id="submission-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 CloudSuite Launch Campaign - Hero Copy"
              required
              className="w-full h-11 px-3.5 bg-[#F7F7F5]/70 rounded-lg text-sm text-slate-900 border border-slate-300 focus:bg-white focus:border-[#218C84] focus:ring-2 focus:ring-[#218C84]/20 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Asset Type Chips */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Channel / Asset Type
            </label>
            <div className="flex flex-wrap gap-2">
              {["Landing Page", "Press Release", "Social Ad", "Executive Speech", "Email Campaign"].map(
                (type) => {
                  const selected = assetType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAssetType(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center space-x-1.5 ${
                        selected
                          ? "bg-[#218C84] text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80"
                      }`}
                    >
                      {selected && (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      )}
                      <span>{type}</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>

        {/* Marketing Copy Input Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2 text-[#152A35]">
              <span className="material-symbols-outlined text-[#218C84] text-[20px]">
                edit_note
              </span>
              <h2 className="font-heading text-base font-bold">Marketing Copy & Claim Text</h2>
            </div>
            <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-[#EAF3F1] text-[#218C84] text-xs font-semibold">
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              <span>Live Claim Parser</span>
            </div>
          </div>

          {/* Helper Banner in Mint */}
          <div className="bg-[#EAF3F1]/80 border border-[#218C84]/20 rounded-lg p-3.5 flex items-start space-x-2.5">
            <span className="material-symbols-outlined text-[#218C84] text-[18px] shrink-0 mt-0.5">
              verified
            </span>
            <p className="text-xs text-[#006f68] leading-relaxed">
              Claims regarding performance metrics, sustainability statistics, pricing guarantees, and competitive superiority are automatically extracted and matched against the verified Evidence Vault.
            </p>
          </div>

          {/* Large Textarea */}
          <div className="space-y-1.5">
            <label
              htmlFor="copy-textarea"
              className="block text-xs font-semibold text-slate-800"
            >
              Content Text <span className="text-[#B85C55]">*</span>
            </label>
            <div className="relative">
              <textarea
                id="copy-textarea"
                rows={9}
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                placeholder="Paste marketing copy, headline drafts, product claims, or full press release text here..."
                required
                className="w-full p-4 bg-[#F7F7F5]/70 rounded-lg text-sm text-slate-900 border border-slate-300 focus:bg-white focus:border-[#218C84] focus:ring-2 focus:ring-[#218C84]/20 outline-none transition-all placeholder:text-slate-400 font-sans leading-relaxed resize-y"
              />
              <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-slate-200 shadow-xs pointer-events-none text-[11px] font-mono text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-[#218C84] animate-pulse" />
                <span>NLP Ready</span>
              </div>
            </div>
          </div>

          {/* Word Count and Telemetry */}
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500 border-t border-slate-100">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-800">{wordCount} words</span>
              <span>•</span>
              <span className="text-slate-600">{contentText.length} characters</span>
              {estimatedClaims > 0 && (
                <>
                  <span>•</span>
                  <span className="text-[#218C84] font-semibold">
                    ~{estimatedClaims} potential claim{estimatedClaims > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            {contentText && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                <span>Clear text</span>
              </button>
            )}
          </div>
        </div>

        {/* Evidence Vault Sync Indicator */}
        <div className="bg-white/60 border border-slate-200/60 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[18px] text-[#218C84]">
              database
            </span>
            <span>
              Connected to <strong>Evidence Vault &amp; Active Guidelines</strong>
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#218C84] bg-[#EAF3F1] px-2 py-0.5 rounded font-semibold">
            VAULT SYNCHRONIZED
          </span>
        </div>

        {/* Action Button Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:flex-1 h-12 bg-[#218C84] hover:bg-[#1b736c] text-white rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Creating Submission &amp; Initializing...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                <span>Submit &amp; Open Verification</span>
              </>
            )}
          </button>

          <Link
            href="/submissions"
            className="w-full sm:w-auto h-12 px-6 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm font-semibold flex items-center justify-center transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

