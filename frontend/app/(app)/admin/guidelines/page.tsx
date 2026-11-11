"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function GuidelinesPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try { setRows(await api<any[]>("/guidelines")); setError(""); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function publish(id: string) {
    setBusy(id);
    try { await api(`/guidelines/${id}/publish`, { method: "POST" }); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy("");
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#152A35]">BrandDNA versions</h1>
        <p className="text-sm text-slate-500">Approved rules, claims and tone, versioned as trusted brand memory.</p>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {rows === null && !error && <p className="text-slate-500">Loading…</p>}
      <div className="space-y-3">
        {rows?.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#152A35]">{g.version}</span>
                {g.is_active && <span className="rounded-full bg-[#3F8F6B] px-2 py-0.5 text-xs text-white">Active</span>}
              </div>
              <div className="text-sm text-slate-500">{g.notes}</div>
              <div className="text-xs text-slate-400">Tone: {g.tone_guidance}</div>
            </div>
            {!g.is_active && (
              <button disabled={busy === g.id} onClick={() => publish(g.id)}
                className="rounded-lg bg-[#218C84] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}