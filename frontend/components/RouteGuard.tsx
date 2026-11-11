"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

type Role = "creator" | "reviewer" | "admin";

/**
 * Centralised role-based redirect guard.
 * Mounted once in (app)/layout.tsx — fires before any page renders.
 *
 * Rules (first match wins):
 *   /admin/*  → admin only          → redirect to home for role
 *   /audit    → admin only          → redirect to home for role
 *   /review   → reviewer + admin    → redirect to home for role
 *   /dashboard→ reviewer + admin    → redirect to home for role
 *   /submit   → creator  + admin    → redirect to home for role
 *
 * "Home for role":
 *   creator  → /submissions
 *   reviewer → /dashboard
 *   admin    → /      (should never be blocked, but safe fallback)
 */

interface RouteRule {
  match: (pathname: string) => boolean;
  allowed: Role[];
}

const RULES: RouteRule[] = [
  // Admin-only
  {
    match: (p) => p.startsWith("/admin") || p === "/audit",
    allowed: ["admin"],
  },
  // Reviewer + admin
  {
    match: (p) => p === "/review" || p === "/dashboard",
    allowed: ["reviewer", "admin"],
  },
  // Creator + admin (submit is hidden from reviewer nav, but guard it too)
  {
    match: (p) => p === "/submit",
    allowed: ["creator", "admin"],
  },
];

function homeFor(role: Role): string {
  if (role === "creator") return "/submissions";
  if (role === "reviewer") return "/dashboard";
  return "/"; // admin — should never redirect
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !me) return; // wait for auth to settle

    for (const rule of RULES) {
      if (rule.match(pathname) && !rule.allowed.includes(me.role)) {
        router.replace(homeFor(me.role));
        return;
      }
    }
  }, [loading, me, pathname, router]);

  return <>{children}</>;
}

