"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = [".pdf", ".docx", ".txt"];

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SubmitPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  function pickFile(f: File | null) {
    setError("");
    if (!f) { setFile(null); return; }
    const lower = f.name.toLowerCase();
    if (!ALLOWED.some((ext) => lower.endsWith(ext))) {
      setFile(null);
      setError("Unsupported file type. Upload a PDF, DOCX or TXT file.");
      return;
    }
    if (f.size === 0) { setFile(null); setError("That file is empty."); return; }
    if (f.size > MAX_BYTES) { setFile(null); setError("That file is larger than 10 MB."); return; }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");

    if (mode === "text") {
      if (!title.trim()) { setError("Please enter a title."); return; }
      if (trimmed.length < 10) { setError("Please paste some marketing text to verify."); return; }
    } else if (!file) {
      setError("Please choose a PDF, DOCX or TXT file.");
      return;
    }

    setBusy(true);
    try {
      let created: { id: string };
      if (mode === "text") {
        created = await api<{ id: string }>("/submissions", {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), content_text: trimmed }),
        });
      } else {
        const fd = new FormData();
        fd.append("title", title.trim() || file!.name);
        fd.append("file", file!);
        created = await api<{ id: string }>("/submissions/upload", { method: "POST", body: fd });
      }
      router.push(`/submissions/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${active ? "bg-[#152A35] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6 pb-16">
      <div>
        <h1 className="font-heading text-2xl font-bold text-[#152A35]">Submit content for verification</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste marketing text, or upload a PDF, DOCX or TXT document. VERITY extracts the claims and checks them
          against the approved evidence library.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-[#ffdad6] border border-[#ba1a1a]/30 p-3 text-sm text-[#93000a]">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
        <div>
          <label htmlFor="title" className="block text-xs font-semibold text-[#152A35] mb-1.5">
            Title {mode === "text" && <span className="text-[#B85C55]">*</span>}
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            maxLength={150}
            placeholder={mode === "file" ? "Optional, defaults to the file name" : "e.g. Nimbus launch campaign"}
            className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84]"
          />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => { setMode("text"); setError(""); }} className={tabClass(mode === "text")}>
            Paste text
          </button>
          <button type="button" onClick={() => { setMode("file"); setError(""); }} className={tabClass(mode === "file")}>
            Upload document
          </button>
        </div>

        {mode === "text" ? (
          <div>
            <label htmlFor="content" className="block text-xs font-semibold text-[#152A35] mb-1.5">
              Content text <span className="text-[#B85C55]">*</span>
            </label>
            <textarea
              id="content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
              maxLength={20000}
              placeholder="Paste marketing copy, headline drafts, product claims, or full press release text here…"
              className="w-full px-3.5 py-3 text-sm bg-[#F7F7F5] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] resize-y"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              {words} words · {content.length} / 20,000 characters
            </p>
          </div>
        ) : (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null); }}
              className="rounded-xl border-2 border-dashed border-slate-300 bg-[#F7F7F5] p-8 text-center space-y-3"
            >
              <span className="material-symbols-outlined text-[36px] text-[#218C84]">upload_file</span>
              {file ? (
                <p className="text-sm font-semibold text-[#152A35]">
                  {file.name} <span className="font-normal text-slate-500">({formatSize(file.size)})</span>
                </p>
              ) : (
                <p className="text-sm text-slate-600">Drag a file here, or choose one</p>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold text-[#152A35] hover:bg-slate-50"
              >
                {file ? "Choose a different file" : "Choose file"}
              </button>
              <p className="text-xs text-slate-500">
                PDF, DOCX or TXT, up to 10 MB. Text-based files only: scanned or image-only PDFs can&apos;t be read.
                Only the first 20,000 characters are checked. For PDFs, VERITY records the page of each claim and
                evidence quote.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className={`flex-1 h-12 rounded-xl text-sm font-semibold text-white transition-all ${busy ? "bg-slate-400 cursor-wait" : "bg-[#218C84] hover:bg-[#1a736d] active:scale-[0.99]"
            }`}
        >
          {busy ? (mode === "file" ? "Uploading and reading the file…" : "Submitting…") : "Submit and open verification"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.push("/submissions")}
          className="h-12 px-5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#152A35] hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}