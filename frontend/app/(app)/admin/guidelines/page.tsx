"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Guideline = { id: string; version: string; notes: string | null; tone_guidance: string | null; is_active: boolean };
type Suggestion = { rule_type: string; pattern: string; description: string; matches: number; new_matches: number; examples: string[] };
type Pattern = { label: string; count: number };
type Trend = { version: string; submissions: number; findings: number; flagged: number; flagged_rate: number | null };

export default function GuidelinesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Guideline[] | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestNote, setSuggestNote] = useState("");
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [sourceId, setSourceId] = useState("");

  async function load() {
    try {
      const g = await api<Guideline[]>("/guidelines");
      setRows(g);
      setSourceId((cur) => cur || (g.find((x) => x.is_active) ?? g[0])?.id || "");
      setError("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not load versions."); }
    api<Pattern[]>("/analytics/patterns").then(setPatterns).catch(() => { });
    api<Trend[]>("/analytics/version-trend").then(setTrend).catch(() => { });
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish(id: string) {
    setBusy(id); setError(""); setNotice("");
    try { await api(`/guidelines/${id}/publish`, { method: "POST" }); setNotice("Version published."); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not publish."); }
    setBusy("");
  }

  async function createDraft() {
    if (!newName.trim() || !sourceId) { setError("Enter a name for the new version."); return; }
    setBusy("clone"); setError(""); setNotice("");
    try {
      const g = await api<{ id: string }>(`/guidelines/${sourceId}/clone`, { method: "POST", body: JSON.stringify({ version: newName.trim() }) });
      router.push(`/admin/guidelines/${g.id}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not create the version."); setBusy(""); }
  }

  async function analyse() {
    setBusy("suggest"); setError(""); setNotice(""); setSuggestions(null); setSuggestNote("");
    try {
      const r = await api<{ suggestions: Suggestion[]; analysed: number; message: string | null }>("/patterns/suggest", { method: "POST" });
      setSuggestions(r.suggestions);
      setSuggestNote(r.message ?? `Analysed ${r.analysed} recurring flagged claims.`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not analyse patterns."); }
    setBusy("");
  }

  async function addSuggestion(i: number, s: Suggestion) {
    const draftId = targets[i];
    if (!draftId) { setError("Choose a draft version to add this rule to."); return; }
    setBusy("add" + i); setError(""); setNotice("");
    try {
      const g = await api<any>(`/guidelines/${draftId}`);
      const body = {
        notes: g.notes, tone_guidance: g.tone_guidance,
        rules: [
          ...(g.rules || []).map((r: any) => ({ rule_type: r.rule_type, pattern: r.pattern, description: r.description, severity: r.severity || "high" })),
          { rule_type: s.rule_type, pattern: s.pattern, description: s.description, severity: "high" },
        ],
        approved_claims: (g.approved_claims || []).map((c: any) => ({ claim_text: c.claim_text })),
        brand_palette: g.brand_palette || [], min_contrast: Number(g.min_contrast || 4.5),
      };
      await api(`/guidelines/${draftId}/content`, { method: "PUT", body: JSON.stringify(body) });
      setNotice("Rule added to the draft. Open the draft to review it, then publish.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not add the rule."); }
    setBusy("");
  }

  const drafts = (rows ?? []).filter((g) => !g.is_active);
  const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-[#152A35]">BrandDNA</h1>
        <p className="text-sm text-slate-500">Versioned brand rules, tone, palette and approved claims. Published versions are locked; create a new version to change them.</p>
      </div>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {rows === null && !error && <p className="text-slate-500">Loading…</p>}

      <div className="space-y-3">
        {rows?.map((g) => (
          <div key={g.id} className={`${card} flex items-center justify-between gap-4`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#152A35]">{g.version}</span>
                {g.is_active && <span className="rounded-full bg-[#3F8F6B] px-2 py-0.5 text-xs text-white">Active</span>}
              </div>
              <div className="text-sm text-slate-500 truncate">{g.notes}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/admin/guidelines/${g.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#152A35] hover:bg-slate-50">
                {g.is_active ? "View" : "Edit"}
              </Link>
              {!g.is_active && (
                <button disabled={busy === g.id} onClick={() => publish(g.id)}
                  className="rounded-lg bg-[#218C84] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="font-semibold text-[#152A35] mb-3">Create a new version</div>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="rounded-lg border border-slate-300 p-2 text-sm">
            {rows?.map((g) => <option key={g.id} value={g.id}>Copy from {g.version}</option>)}
          </select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="New version name, e.g. v1.1"
            className="rounded-lg border border-slate-300 p-2 text-sm" />
          <button disabled={busy === "clone"} onClick={createDraft}
            className="rounded-lg bg-[#152A35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "clone" ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="font-semibold text-[#152A35]">PatternSense</div>
            <div className="text-xs text-slate-500">Finds recurring flagged wording and proposes new rules. You decide what goes into BrandDNA.</div>
          </div>
          <button disabled={busy === "suggest"} onClick={analyse}
            className="rounded-lg bg-[#218C84] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "suggest" ? "Analysing…" : "Analyse recurring findings"}
          </button>
        </div>
        {patterns.length > 0 && (
          <ul className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
            {patterns.map((p) => <li key={p.label} className="flex justify-between border-b border-slate-100 py-1"><span>{p.label}</span><span className="font-semibold">{p.count}</span></li>)}
          </ul>
        )}
        {suggestNote && <p className="text-xs text-slate-500 mb-2">{suggestNote}</p>}
        <div className="space-y-3">
          {suggestions?.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">{s.rule_type}</span>
                <code className="text-xs text-slate-700 break-all">{s.pattern}</code>
              </div>
              <p className="text-sm text-slate-700">{s.description}</p>
              <p className="text-xs text-slate-500">Would catch {s.new_matches} flagged claim(s) the current rules miss, for example: {s.examples.map((x) => `“${x}”`).join(", ")}</p>
              <div className="flex flex-wrap gap-2">
                <select value={targets[i] ?? ""} onChange={(e) => setTargets({ ...targets, [i]: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm">
                  <option value="">Add to draft…</option>
                  {drafts.map((g) => <option key={g.id} value={g.id}>{g.version}</option>)}
                </select>
                <button disabled={busy === "add" + i} onClick={() => addSuggestion(i, s)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">Add rule</button>
              </div>
            </div>
          ))}
          {drafts.length === 0 && suggestions && suggestions.length > 0 && (
            <p className="text-xs text-amber-700">Create a draft version first, then add rules to it.</p>
          )}
        </div>
      </div>

      {trend.length > 0 && (
        <div className={card}>
          <div className="font-semibold text-[#152A35] mb-1">Flagged findings by BrandDNA version</div>
          <p className="text-xs text-slate-500 mb-3">Shows whether newer versions catch or prevent more problems. Seeded demo history is included.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Version</th><th>Submissions</th><th>Findings</th><th>Flagged</th><th>Flagged share</th></tr></thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.version} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{t.version}</td><td>{t.submissions}</td><td>{t.findings}</td><td>{t.flagged}</td>
                    <td>{t.flagged_rate === null ? "n/a" : `${Math.round(t.flagged_rate * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
