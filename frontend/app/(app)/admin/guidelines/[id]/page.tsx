"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const RULE_TYPES = ["superlative", "guarantee", "legal_qualifier", "tone", "outdated_claim"];
type Rule = { rule_type: string; pattern: string; description: string };
type Colour = { name: string; hex: string };
type Version = { id: string; version: string; is_active: boolean };
type Diff = {
  base: string; new: string; changes: number;
  rules_added: Rule[]; rules_removed: Rule[]; claims_added: string[]; claims_removed: string[];
  palette_added: Colour[]; palette_removed: Colour[];
  tone_changed: boolean; tone_before: string | null; tone_after: string | null;
  min_contrast_changed: boolean; min_contrast_before: number; min_contrast_after: number; logo_changed: boolean;
};

const validHex = (h: string) => /^#?[0-9a-fA-F]{6}$/.test(h.trim());
const input = "w-full rounded-lg border border-slate-300 p-2 text-sm bg-white";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const logoRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<{ version: string; is_active: boolean } | null>(null);
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [claims, setClaims] = useState<string[]>([]);
  const [palette, setPalette] = useState<Colour[]>([]);
  const [minContrast, setMinContrast] = useState("4.5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [other, setOther] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await api<any>(`/guidelines/${id}`);
      setMeta({ version: g.version, is_active: !!g.is_active });
      setNotes(g.notes ?? ""); setTone(g.tone_guidance ?? "");
      setRules((g.rules || []).map((r: any) => ({ rule_type: r.rule_type, pattern: r.pattern ?? "", description: r.description ?? "" })));
      setClaims((g.approved_claims || []).map((c: any) => c.claim_text));
      setPalette((g.brand_palette || []).map((p: any) => ({ name: p.name ?? "", hex: p.hex ?? "" })));
      setMinContrast(String(g.min_contrast ?? 4.5));
      setVersions(await api<Version[]>("/guidelines"));
      api<{ url: string }>(`/guidelines/${id}/logo`).then((r) => setLogoUrl(r.url)).catch(() => setLogoUrl(null));
      setError("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not load this version."); }
    setLoaded(true);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const locked = !!meta?.is_active;

  async function save() {
    setBusy("save"); setError(""); setNotice("");
    try {
      await api(`/guidelines/${id}/content`, {
        method: "PUT",
        body: JSON.stringify({
          notes, tone_guidance: tone,
          rules: rules.filter((r) => r.pattern.trim()).map((r) => ({ ...r, severity: "high" })),
          approved_claims: claims.filter((c) => c.trim()).map((c) => ({ claim_text: c })),
          brand_palette: palette.filter((p) => p.hex.trim()),
          min_contrast: Number(minContrast),
        }),
      });
      setNotice("Saved.");
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not save."); }
    setBusy("");
  }

  async function publish() {
    setBusy("publish"); setError(""); setNotice("");
    try { await api(`/guidelines/${id}/publish`, { method: "POST" }); setNotice("Published. New submissions will use this version."); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not publish."); }
    setBusy("");
  }

  async function uploadLogo(f: File | null) {
    if (!f) return;
    setBusy("logo"); setError(""); setNotice("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      await api(`/guidelines/${id}/logo`, { method: "POST", body: fd });
      setNotice("Logo uploaded.");
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not upload the logo."); }
    setBusy("");
    if (logoRef.current) logoRef.current.value = "";
  }

  async function compare(otherId: string) {
    setOther(otherId); setDiff(null);
    if (!otherId) return;
    try { setDiff(await api<Diff>(`/guidelines/${id}/diff?other=${otherId}`)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not compare versions."); }
  }

  const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3";
  if (!loaded) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!meta) return <div className="p-8"><div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || "Version not found."}</div><Link href="/admin/guidelines" className="text-sm text-[#218C84] underline">Back to BrandDNA</Link></div>;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <Link href="/admin/guidelines" className="text-sm text-[#218C84] underline">← Back to BrandDNA</Link>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#152A35]">BrandDNA {meta.version}</h1>
        {meta.is_active && <span className="rounded-full bg-[#3F8F6B] px-2 py-0.5 text-xs text-white">Active</span>}
      </div>
      {locked && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This version is published and locked. To change it, create a new version from it on the BrandDNA page.</div>}
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <div className={card}>
        <label className="text-xs font-semibold text-[#152A35]">Notes</label>
        <input className={input} value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
        <label className="text-xs font-semibold text-[#152A35]">Tone guidance</label>
        <textarea className={input} rows={2} value={tone} disabled={locked} onChange={(e) => setTone(e.target.value)} />
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-[#152A35]">Brand rules</div>
          {!locked && <button className="text-sm font-semibold text-[#218C84]" onClick={() => setRules([...rules, { rule_type: "superlative", pattern: "", description: "" }])}>+ Add rule</button>}
        </div>
        {rules.length === 0 && <p className="text-sm text-slate-500">No rules yet.</p>}
        {rules.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[150px_1fr_1fr_auto] items-start">
            <select className={input} disabled={locked} value={r.rule_type} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, rule_type: e.target.value } : x))}>
              {RULE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className={input} disabled={locked} placeholder="Pattern, e.g. (?i)\bbest\b" value={r.pattern} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, pattern: e.target.value } : x))} />
            <input className={input} disabled={locked} placeholder="Description" value={r.description} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            {!locked && <button className="text-sm text-red-600" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-[#152A35]">Approved claims</div>
          {!locked && <button className="text-sm font-semibold text-[#218C84]" onClick={() => setClaims([...claims, ""])}>+ Add claim</button>}
        </div>
        {claims.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input className={input} disabled={locked} value={c} onChange={(e) => setClaims(claims.map((x, j) => j === i ? e.target.value : x))} />
            {!locked && <button className="text-sm text-red-600" onClick={() => setClaims(claims.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="font-semibold text-[#152A35]">VisualGuard settings</div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[#152A35]">Approved colours</label>
          {!locked && palette.length < 12 && <button className="text-sm font-semibold text-[#218C84]" onClick={() => setPalette([...palette, { name: "", hex: "#" }])}>+ Add colour</button>}
        </div>
        {palette.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-8 w-8 rounded border border-slate-300" style={{ backgroundColor: validHex(p.hex) ? (p.hex.startsWith("#") ? p.hex : "#" + p.hex) : "transparent" }} />
            <input className={input} disabled={locked} placeholder="Name" value={p.name} onChange={(e) => setPalette(palette.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input className={input} disabled={locked} placeholder="#1E6FD9" value={p.hex} onChange={(e) => setPalette(palette.map((x, j) => j === i ? { ...x, hex: e.target.value } : x))} />
            {!locked && <button className="text-sm text-red-600" onClick={() => setPalette(palette.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-[#152A35]">Minimum text contrast (ratio)</label>
          <input className="w-24 rounded-lg border border-slate-300 p-2 text-sm" disabled={locked} value={minContrast} onChange={(e) => setMinContrast(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#152A35]">Brand logo</label>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Brand logo" className="max-h-20 rounded border border-slate-200" />
          ) : <p className="text-sm text-slate-500">No logo uploaded.</p>}
          {!locked && (
            <>
              <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0] ?? null)} />
              <button disabled={busy === "logo"} onClick={() => logoRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                {busy === "logo" ? "Uploading…" : "Upload logo (PNG or JPG)"}
              </button>
              <p className="text-xs text-slate-500">Transparent logos are placed on white for matching, so a logo on a solid background works best.</p>
            </>
          )}
        </div>
      </div>

      {!locked && (
        <div className="flex gap-3">
          <button disabled={busy === "save"} onClick={save} className="rounded-lg bg-[#152A35] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "save" ? "Saving…" : "Save changes"}</button>
          <button disabled={busy === "publish"} onClick={publish} className="rounded-lg bg-[#218C84] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "publish" ? "Publishing…" : "Publish this version"}</button>
        </div>
      )}

      <div className={card}>
        <div className="font-semibold text-[#152A35]">Compare with another version</div>
        <select className={input} value={other} onChange={(e) => compare(e.target.value)}>
          <option value="">Choose a version…</option>
          {versions.filter((v) => v.id !== id).map((v) => <option key={v.id} value={v.id}>{v.version}</option>)}
        </select>
        {diff && (
          <div className="text-sm space-y-2">
            <p className="font-semibold">{diff.new} compared with {diff.base}: {diff.changes} change(s)</p>
            {diff.rules_added.map((r, i) => <p key={"ra" + i} className="text-emerald-700">+ Rule ({r.rule_type}): {r.pattern}</p>)}
            {diff.rules_removed.map((r, i) => <p key={"rr" + i} className="text-red-700">− Rule ({r.rule_type}): {r.pattern}</p>)}
            {diff.claims_added.map((c, i) => <p key={"ca" + i} className="text-emerald-700">+ Approved claim: {c}</p>)}
            {diff.claims_removed.map((c, i) => <p key={"cr" + i} className="text-red-700">− Approved claim: {c}</p>)}
            {diff.palette_added.map((c, i) => <p key={"pa" + i} className="text-emerald-700">+ Colour: {c.name} {c.hex}</p>)}
            {diff.palette_removed.map((c, i) => <p key={"pr" + i} className="text-red-700">− Colour: {c.name} {c.hex}</p>)}
            {diff.tone_changed && <p className="text-amber-700">Tone changed</p>}
            {diff.min_contrast_changed && <p className="text-amber-700">Minimum contrast: {diff.min_contrast_before} → {diff.min_contrast_after}</p>}
            {diff.logo_changed && <p className="text-amber-700">Logo changed</p>}
            {diff.changes === 0 && <p className="text-slate-500">No differences.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
