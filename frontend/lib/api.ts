import { supabase } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL!;

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(opts.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (opts.body && !(opts.body instanceof FormData)) headers.set("Content-Type", "application/json");

    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = await res.json();
            msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        } catch { }
        throw Object.assign(new Error(msg), { status: res.status });
    }
    return res.json();
}