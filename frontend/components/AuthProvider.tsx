"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: "creator" | "reviewer" | "admin" } | null;
const Ctx = createContext<{ me: Me; loading: boolean; logout: () => Promise<void> }>({
    me: null, loading: true, logout: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [me, setMe] = useState<Me>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { setMe(null); setLoading(false); return; }
        try { setMe(await api("/me")); } catch { setMe(null); }
        setLoading(false);
    }

    useEffect(() => {
        load();
        const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
        return () => sub.subscription.unsubscribe();
    }, []);

    const logout = async () => { await supabase.auth.signOut(); setMe(null); };
    return <Ctx.Provider value={{ me, loading, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);