"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client. Session lives in localStorage so the installed PWA stays signed in. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "ovr-auth" },
    });
  }
  return client;
}

export class RpcError extends Error {
  constructor(
    message: string,
    public network = false,
  ) {
    super(message);
  }
}

/** Call a Postgres function; throws RpcError(message) where message is the SQL error code we raise. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await supabase().rpc(fn, args);
  } catch (e) {
    throw new RpcError((e as Error).message, true);
  }
  if (res.error) {
    const network = !res.status || res.status === 0 || /fetch|network|Failed to fetch|Load failed/i.test(res.error.message);
    throw new RpcError(res.error.message, network);
  }
  return res.data as T;
}
