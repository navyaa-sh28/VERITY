"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const router = useRouter();
  const { me, loading } = useAuth();

  useEffect(() => {
    if (!loading && me) {
      if (me.role === "creator") {
        router.replace("/submit");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [me, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 border-2 border-[#218C84]/20 border-t-[#218C84] rounded-full animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-medium">Redirecting to workspace...</p>
      </div>
    </div>
  );
}

