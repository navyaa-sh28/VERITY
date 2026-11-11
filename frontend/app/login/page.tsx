"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { me, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If user is already authenticated, redirect immediately based on role
  useEffect(() => {
    if (!loading && me) {
      if (me.role === "creator") {
        router.replace("/submit");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [me, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }

      // On successful signIn, AuthProvider's onAuthStateChange fires load()
      // which fetches /me and sets `me`. The useEffect above redirects upon `me` update.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in. Please try again.";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Main Card */}
        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 flex flex-col relative overflow-hidden">
          {/* Header Brand */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-[#152A35] flex items-center justify-center text-white mb-3 shadow-sm">
              <svg
                className="w-8 h-8 text-[#77d6cd]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 32 32"
              >
                <path
                  d="M16 3L5 7.5V14.5C5 21.2 9.7 27.4 16 29C22.3 27.4 27 21.2 27 14.5V7.5L16 3Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
                <path
                  d="M11 16L14.5 19.5L21 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              </svg>
            </div>
            <h1 className="font-heading text-3xl font-bold text-[#152A35] tracking-tight">
              VERITY
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
              Trust every word before it reaches the world.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3.5 rounded-lg bg-[#ffdad6] border border-[#ba1a1a]/20 text-[#ba1a1a] text-xs flex items-start space-x-2 animate-in fade-in">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                error
              </span>
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Credentials Form */}
          <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-col space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-semibold text-slate-700"
              >
                Email
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[18px] pointer-events-none">
                  mail
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full h-11 pl-10 pr-3 rounded-lg bg-white text-slate-900 text-sm border border-slate-300 focus:border-[#218C84] focus:ring-2 focus:ring-[#218C84]/20 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[18px] pointer-events-none">
                  key
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full h-11 pl-10 pr-10 rounded-lg bg-white text-slate-900 text-sm border border-slate-300 focus:border-[#218C84] focus:ring-2 focus:ring-[#218C84]/20 outline-none transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute right-3 text-slate-400 hover:text-slate-600 flex items-center justify-center p-1 focus:outline-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-lg bg-[#218C84] hover:bg-[#1b736c] text-white text-sm font-semibold flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
