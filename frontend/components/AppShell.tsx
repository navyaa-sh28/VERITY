"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect to /login if no session exists
  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login");
    }
  }, [loading, me, router]);

  // Loading state: "Waking up the server…" spinner
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F7F5] p-6 text-center">
        <div className="flex flex-col items-center max-w-sm">
          <div className="w-12 h-12 border-4 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-4" />
          <h2 className="font-heading text-xl font-bold text-[#152A35] tracking-tight">
            Waking up the server…
          </h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Connecting to the Verity governance engine and verifying session credentials.
          </p>
        </div>
      </div>
    );
  }

  // Not loading and no session: return null while redirecting
  if (!me) {
    return null;
  }

  // Define links strictly based on user role
  const navItems: NavItem[] = [];

  if (me.role === "creator") {
    navItems.push(
      { label: "Submit", href: "/submit", icon: "edit_note" },
      { label: "My submissions", href: "/submissions", icon: "folder_shared" }
    );
  } else if (me.role === "reviewer") {
    navItems.push(
      { label: "Review queue", href: "/review", icon: "fact_check" },
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "All submissions", href: "/submissions", icon: "table_rows" }
    );
  } else if (me.role === "admin") {
    // Admin: everything plus Guidelines, Evidence, Audit
    navItems.push(
      { label: "Submit", href: "/submit", icon: "edit_note" },
      { label: "Review queue", href: "/review", icon: "fact_check" },
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "All submissions", href: "/submissions", icon: "table_rows" },
      { label: "Guidelines", href: "/admin/guidelines", icon: "policy" },
      { label: "Evidence", href: "/admin/evidence", icon: "verified" },
      { label: "Audit", href: "/audit", icon: "history" }
    );
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } catch {
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  const roleBadgeColors: Record<string, string> = {
    creator: "bg-[#218C84]/20 text-[#77d6cd] border border-[#218C84]/40",
    reviewer: "bg-[#D4A85A]/20 text-[#ffdea9] border border-[#D4A85A]/40",
    admin: "bg-white/15 text-white border border-white/30",
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#152A35] text-white">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-9 h-9 rounded-lg bg-[#001520] flex items-center justify-center text-[#77d6cd] shadow-sm">
            <svg
              className="w-5 h-5"
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
          <div className="flex flex-col">
            <span className="font-heading font-bold text-base tracking-tight text-white group-hover:text-[#77d6cd] transition-colors">
              VERITY
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
              Brand Governance
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#218C84] text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout Button */}
      <div className="p-3 border-t border-white/10 shrink-0 bg-[#001520]/40">
        <div className="flex items-center space-x-3 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-[#218C84] flex items-center justify-center font-bold text-xs text-white shrink-0">
            {me.email ? me.email.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-white truncate">
              {me.email}
            </span>
            <div className="flex items-center mt-0.5">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                  roleBadgeColors[me.role] || "bg-white/10 text-white"
                }`}
              >
                {me.role}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loggingOut ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Signing out...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span>Sign Out</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F7F5]">
      {/* Desktop Left Navy Sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Header & Drawer */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-[#152A35] text-white flex items-center justify-between px-4 z-40 shadow-sm">
        <Link href="/" className="flex items-center space-x-2">
          <span className="font-heading font-bold text-base tracking-tight">VERITY</span>
          <span className="text-[10px] uppercase font-semibold text-[#77d6cd] bg-[#218C84]/20 px-2 py-0.5 rounded">
            {me.role}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 focus:outline-none"
          aria-label="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined text-[24px]">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-full z-10 h-full">
            {navContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen pt-14 md:pt-0">
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

