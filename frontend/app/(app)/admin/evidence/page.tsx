"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface EvidenceDoc {
  id: string;
  title: string;
  trusted: boolean;
  valid_until: string | null;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EvidencePage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();

  const [docs, setDocs] = useState<EvidenceDoc[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Upload form state
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Admin-only guard
  useEffect(() => {
    if (!authLoading && me && me.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, me, router]);

  const fetchDocs = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await api<EvidenceDoc[]>("/evidence");
      setDocs(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : "Failed to load evidence.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!me || me.role !== "admin") return;
    fetchDocs();
  }, [authLoading, me, fetchDocs]);

  // ── Upload form submit ─────────────────────────────────────────────────────
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("text", text.trim());
    fd.append("trusted", trusted ? "true" : "false");

    // Only append valid_until if the field has a value
    if (validUntil.trim()) {
      fd.append("valid_until", validUntil.trim());
    }

    // Only append file if one was chosen
    if (file) {
      fd.append("file", file);
    }

    try {
      // Do NOT set Content-Type — let the browser set multipart/form-data with boundary
      await api("/evidence", { method: "POST", body: fd });
      setUploadSuccess(true);
      // Reset form
      setTitle("");
      setText("");
      setValidUntil("");
      setTrusted(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchDocs();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
        <h2 className="font-heading text-lg font-bold text-[#152A35]">Loading…</h2>
      </div>
    );
  }

  if (!me || me.role !== "admin") return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-16">
      {/* Page Header */}
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <span className="material-symbols-outlined text-[#218C84] text-[20px]">verified</span>
          <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
            Admin
          </span>
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight">
          Evidence Library
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Upload and manage the evidence documents used to verify claims.
        </p>
      </div>

      {/* ── Evidence Table ── */}
      <section>
        <h2 className="font-heading text-base font-bold text-[#152A35] mb-4">
          All Evidence Documents
        </h2>

        {listLoading ? (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Loading evidence…</p>
          </div>
        ) : listError ? (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
            </div>
            <p className="text-sm font-semibold text-[#152A35] mb-1">Failed to load evidence</p>
            <p className="text-xs text-slate-500 mb-4">{listError}</p>
            <button
              type="button"
              onClick={fetchDocs}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#218C84] text-white text-xs font-semibold hover:bg-[#1a736d] transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              Retry
            </button>
          </div>
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-14 flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#EAF3F1] flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-[#218C84]">verified</span>
            </div>
            <h3 className="font-heading text-sm font-bold text-[#152A35]">No evidence yet</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Upload your first evidence document using the form below.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                    Title
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden sm:table-cell">
                    Trusted
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden md:table-cell">
                    Valid Until
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden lg:table-cell">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#EAF3F1]/30 transition-colors">
                    {/* Title */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#152A35] leading-snug">{doc.title}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                        {doc.id.slice(0, 8)}…
                      </div>
                      {/* Mobile-only trusted badge */}
                      <div className="sm:hidden mt-1">
                        {doc.trusted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8F4EE] text-[#3F8F6B]">
                            <span className="material-symbols-outlined text-[11px]">verified</span>
                            Trusted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                            Standard
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Trusted */}
                    <td className="px-5 py-4 hidden sm:table-cell">
                      {doc.trusted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E8F4EE] text-[#3F8F6B] border border-[#3F8F6B]/25">
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                          Trusted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                          Standard
                        </span>
                      )}
                    </td>

                    {/* Valid Until */}
                    <td className="px-5 py-4 text-slate-500 hidden md:table-cell whitespace-nowrap">
                      {doc.valid_until ? (
                        <span className="text-[#D4A85A] font-medium">
                          {formatDate(doc.valid_until)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Uploaded */}
                    <td className="px-5 py-4 text-slate-500 hidden lg:table-cell whitespace-nowrap">
                      {formatDate(doc.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
              {docs.length} document{docs.length !== 1 ? "s" : ""} ·{" "}
              {docs.filter((d) => d.trusted).length} trusted ·{" "}
              {docs.filter((d) => d.valid_until).length} with expiry
            </div>
          </div>
        )}
      </section>

      {/* ── Upload Form ── */}
      <section>
        <h2 className="font-heading text-base font-bold text-[#152A35] mb-4">
          Upload Evidence Document
        </h2>

        <form
          onSubmit={handleUpload}
          className="bg-white rounded-xl border border-slate-200/90 shadow-sm divide-y divide-slate-100"
        >
          <div className="p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-[#152A35] mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className="w-full text-sm text-[#152A35] bg-white border border-slate-200 rounded-lg px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition"
              />
            </div>

            {/* Text body */}
            <div>
              <label className="block text-xs font-semibold text-[#152A35] mb-1">
                Text Content <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type the evidence content here…"
                rows={5}
                className="w-full text-sm text-[#152A35] bg-white border border-slate-200 rounded-lg px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Valid Until (optional) */}
              <div>
                <label className="block text-xs font-semibold text-[#152A35] mb-1">
                  Valid Until
                  <span className="ml-1 text-[11px] font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full text-sm text-[#152A35] bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition"
                />
                <p className="mt-1 text-[11px] text-slate-400">Leave blank for no expiry.</p>
              </div>

              {/* Trusted checkbox */}
              <div className="flex flex-col justify-center">
                <label className="block text-xs font-semibold text-[#152A35] mb-2">
                  Trust Level
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <span className="relative mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={trusted}
                      onChange={(e) => setTrusted(e.target.checked)}
                      className="sr-only peer"
                    />
                    <span className="w-4 h-4 rounded border-2 border-slate-300 peer-checked:bg-[#218C84] peer-checked:border-[#218C84] flex items-center justify-center transition-colors block">
                      {trusted && (
                        <span className="material-symbols-outlined text-white text-[12px]">
                          check
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold">Mark as trusted source</span>
                    <br />
                    <span className="text-slate-500">
                      Trusted documents carry higher weight in claim verification.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* File upload (optional) */}
            <div>
              <label className="block text-xs font-semibold text-[#152A35] mb-1">
                Attach File
                <span className="ml-1 text-[11px] font-normal text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="file"
                  ref={fileRef}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#EAF3F1] file:text-[#218C84] hover:file:bg-[#d3ebe7] border border-slate-200 rounded-lg p-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 transition"
                />
              </div>
              {file && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Selected: <span className="font-medium">{file.name}</span> (
                  {(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-b-xl">
            <div>
              {uploadError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {uploadError}
                </p>
              )}
              {uploadSuccess && (
                <p className="text-xs text-[#3F8F6B] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Evidence document uploaded successfully.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !title.trim() || !text.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#218C84] hover:bg-[#1a736d] text-white text-sm font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Uploading…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[17px]">upload</span>
                  <span>Upload Evidence</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

