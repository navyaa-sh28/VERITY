"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface Guideline {
  id: string;
  version: string;
  notes: string | null;
  tone_guidance: string | null;
  is_active: boolean;
  created_at: string;
}

interface Rule {
  rule_type: string;
  pattern: string;
  description: string;
}

interface ApprovedClaim {
  claim_text: string;
}

interface GuidelineFormData {
  version: string;
  notes: string;
  tone_guidance: string;
  rules: Rule[];
  approved_claims: ApprovedClaim[];
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

const EMPTY_RULE: Rule = { rule_type: "", pattern: "", description: "" };
const EMPTY_CLAIM: ApprovedClaim = { claim_text: "" };

function emptyForm(): GuidelineFormData {
  return {
    version: "",
    notes: "",
    tone_guidance: "",
    rules: [{ ...EMPTY_RULE }],
    approved_claims: [{ ...EMPTY_CLAIM }],
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-[#152A35] mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full text-sm text-[#152A35] bg-white border border-slate-200 rounded-lg px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition"
    />
  );
}

function TextareaInput({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm text-[#152A35] bg-white border border-slate-200 rounded-lg px-3 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#218C84]/30 focus:border-[#218C84] transition resize-none"
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function GuidelinesPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();

  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Publish state: map of id → "idle" | "loading" | "done" | "error"
  const [publishState, setPublishState] = useState<Record<string, string>>({});

  // Create form
  const [form, setForm] = useState<GuidelineFormData>(emptyForm);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Admin-only guard
  useEffect(() => {
    if (!authLoading && me && me.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, me, router]);

  const fetchGuidelines = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await api<Guideline[]>("/guidelines");
      setGuidelines(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : "Failed to load guidelines.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!me || me.role !== "admin") return;
    fetchGuidelines();
  }, [authLoading, me, fetchGuidelines]);

  // ── Publish ────────────────────────────────────────────────────────────────
  async function handlePublish(id: string) {
    setPublishState((prev) => ({ ...prev, [id]: "loading" }));
    try {
      await api(`/guidelines/${id}/publish`, { method: "POST" });
      setPublishState((prev) => ({ ...prev, [id]: "done" }));
      // Refresh list so is_active badge updates
      fetchGuidelines();
    } catch (err: unknown) {
      setPublishState((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setPublishState((prev) => ({ ...prev, [id]: "idle" })), 3000);
      console.error(err);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  function setField<K extends keyof GuidelineFormData>(key: K, value: GuidelineFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateRule(index: number, field: keyof Rule, value: string) {
    setForm((prev) => {
      const rules = [...prev.rules];
      rules[index] = { ...rules[index], [field]: value };
      return { ...prev, rules };
    });
  }

  function addRule() {
    setForm((prev) => ({ ...prev, rules: [...prev.rules, { ...EMPTY_RULE }] }));
  }

  function removeRule(index: number) {
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  }

  function updateClaim(index: number, value: string) {
    setForm((prev) => {
      const approved_claims = [...prev.approved_claims];
      approved_claims[index] = { claim_text: value };
      return { ...prev, approved_claims };
    });
  }

  function addClaim() {
    setForm((prev) => ({
      ...prev,
      approved_claims: [...prev.approved_claims, { ...EMPTY_CLAIM }],
    }));
  }

  function removeClaim(index: number) {
    setForm((prev) => ({
      ...prev,
      approved_claims: prev.approved_claims.filter((_, i) => i !== index),
    }));
  }

  // ── Submit form ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(false);

    const payload = {
      version: form.version.trim(),
      notes: form.notes.trim() || null,
      tone_guidance: form.tone_guidance.trim() || null,
      rules: form.rules
        .filter((r) => r.rule_type.trim() || r.pattern.trim() || r.description.trim())
        .map((r) => ({
          rule_type: r.rule_type.trim(),
          pattern: r.pattern.trim(),
          description: r.description.trim(),
        })),
      approved_claims: form.approved_claims
        .filter((c) => c.claim_text.trim())
        .map((c) => ({ claim_text: c.claim_text.trim() })),
    };

    try {
      await api("/guidelines", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFormSuccess(true);
      setForm(emptyForm());
      fetchGuidelines();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create guideline version.");
    } finally {
      setFormSubmitting(false);
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
          <span className="material-symbols-outlined text-[#218C84] text-[20px]">policy</span>
          <span className="text-xs font-semibold text-[#218C84] uppercase tracking-wider">
            Admin
          </span>
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[#152A35] tracking-tight">
          Brand Guidelines
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage governance guideline versions and publish the active one.
        </p>
      </div>

      {/* ── Guidelines List ── */}
      <section>
        <h2 className="font-heading text-base font-bold text-[#152A35] mb-4">
          All Versions
        </h2>

        {listLoading ? (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Loading guidelines…</p>
          </div>
        ) : listError ? (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[20px]">error</span>
            </div>
            <p className="text-sm font-semibold text-[#152A35] mb-1">Failed to load guidelines</p>
            <p className="text-xs text-slate-500 mb-4">{listError}</p>
            <button
              type="button"
              onClick={fetchGuidelines}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#218C84] text-white text-xs font-semibold hover:bg-[#1a736d] transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">refresh</span>
              Retry
            </button>
          </div>
        ) : guidelines.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-14 flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#EAF3F1] flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-[#218C84]">policy</span>
            </div>
            <h3 className="font-heading text-sm font-bold text-[#152A35]">No guidelines yet</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Use the form below to create your first guideline version.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                    Version
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden sm:table-cell">
                    Notes
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500 hidden md:table-cell">
                    Created
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guidelines.map((g) => {
                  const pState = publishState[g.id] ?? "idle";
                  return (
                    <tr key={g.id} className="hover:bg-[#EAF3F1]/30 transition-colors">
                      {/* Version */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#152A35]">{g.version}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {g.id.slice(0, 8)}…
                        </div>
                      </td>

                      {/* Notes */}
                      <td className="px-5 py-4 text-slate-600 hidden sm:table-cell max-w-[200px]">
                        <span className="line-clamp-2">{g.notes ?? "—"}</span>
                      </td>

                      {/* Created */}
                      <td className="px-5 py-4 text-slate-500 hidden md:table-cell whitespace-nowrap">
                        {formatDate(g.created_at)}
                      </td>

                      {/* Active badge */}
                      <td className="px-5 py-4">
                        {g.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E8F4EE] text-[#3F8F6B] border border-[#3F8F6B]/25">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3F8F6B]" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        )}
                      </td>

                      {/* Publish button */}
                      <td className="px-5 py-4 text-right">
                        {g.is_active ? (
                          <span className="text-[11px] text-slate-400 italic">Published</span>
                        ) : (
                          <button
                            type="button"
                            disabled={pState === "loading"}
                            onClick={() => handlePublish(g.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#152A35] hover:bg-[#1f3a47] text-white text-xs font-semibold transition-all shadow-xs active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {pState === "loading" ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Publishing…</span>
                              </>
                            ) : pState === "error" ? (
                              <>
                                <span className="material-symbols-outlined text-[14px] text-red-300">error</span>
                                <span>Failed</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[14px]">publish</span>
                                <span>Publish</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
              {guidelines.length} guideline version{guidelines.length !== 1 ? "s" : ""} ·{" "}
              {guidelines.filter((g) => g.is_active).length === 1
                ? "1 active"
                : "none active"}
            </div>
          </div>
        )}
      </section>

      {/* ── Create New Version Form ── */}
      <section>
        <h2 className="font-heading text-base font-bold text-[#152A35] mb-4">
          Create New Version
        </h2>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200/90 shadow-sm divide-y divide-slate-100"
        >
          {/* Basic fields */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Version</FieldLabel>
                <TextInput
                  value={form.version}
                  onChange={(v) => setField("version", v)}
                  placeholder="e.g. v2.1"
                  required
                />
              </div>
            </div>

            <div>
              <FieldLabel>Notes</FieldLabel>
              <TextareaInput
                value={form.notes}
                onChange={(v) => setField("notes", v)}
                placeholder="Describe what changed in this version…"
                rows={2}
              />
            </div>

            <div>
              <FieldLabel>Tone Guidance</FieldLabel>
              <TextareaInput
                value={form.tone_guidance}
                onChange={(v) => setField("tone_guidance", v)}
                placeholder="Describe the brand tone expected in all submissions…"
                rows={3}
              />
            </div>
          </div>

          {/* Rules */}
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-heading text-sm font-bold text-[#152A35]">Rules</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Governance rules applied during claim analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={addRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#218C84] text-[#218C84] text-xs font-semibold hover:bg-[#EAF3F1] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Add rule
              </button>
            </div>

            {form.rules.map((rule, i) => (
              <div
                key={i}
                className="relative bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Rule {i + 1}
                  </span>
                  {form.rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRule(i)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      aria-label="Remove rule"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Rule Type</FieldLabel>
                    <TextInput
                      value={rule.rule_type}
                      onChange={(v) => updateRule(i, "rule_type", v)}
                      placeholder="e.g. prohibited_claim"
                    />
                  </div>
                  <div>
                    <FieldLabel>Pattern</FieldLabel>
                    <TextInput
                      value={rule.pattern}
                      onChange={(v) => updateRule(i, "pattern", v)}
                      placeholder="Regex or keyword pattern"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <TextareaInput
                    value={rule.description}
                    onChange={(v) => updateRule(i, "description", v)}
                    placeholder="What does this rule enforce?"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Approved Claims */}
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-heading text-sm font-bold text-[#152A35]">Approved Claims</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-approved claim text that is always supported.
                </p>
              </div>
              <button
                type="button"
                onClick={addClaim}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#218C84] text-[#218C84] text-xs font-semibold hover:bg-[#EAF3F1] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Add claim
              </button>
            </div>

            {form.approved_claims.map((claim, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <TextInput
                    value={claim.claim_text}
                    onChange={(v) => updateClaim(i, v)}
                    placeholder={`Approved claim ${i + 1}…`}
                  />
                </div>
                {form.approved_claims.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeClaim(i)}
                    className="mt-1 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    aria-label="Remove claim"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-b-xl">
            {/* Feedback messages */}
            <div>
              {formError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {formError}
                </p>
              )}
              {formSuccess && (
                <p className="text-xs text-[#3F8F6B] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Guideline version created successfully.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={formSubmitting || !form.version.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#218C84] hover:bg-[#1a736d] text-white text-sm font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {formSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[17px]">add_circle</span>
                  <span>Create Version</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

