"use client";
// Data hooks. SWR with a cache persisted to localStorage so every screen
// renders instantly from the last sync — including offline.

import useSWR, { mutate as defaultMutate, useSWRConfig, type Cache } from "swr";
import { useLayoutEffect } from "react";
import { rpc, RpcError } from "./supabase/client";
import type { Duo, LadderData, LeagueData, MemberCard, StatsData, TodayData } from "./types";

const CACHE_KEY = "ovr-swr-cache-v1";

export function persistentCache(): Cache {
  const map = new Map<string, unknown>();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, unknown][]) map.set(k, v);
  } catch {
    /* private mode / quota */
  }
  const save = () => {
    try {
      const entries = [...map.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => {
        const s = v as { data?: unknown };
        return [k, { data: s?.data }];
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && save());
  setInterval(save, 15_000);
  return map as unknown as Cache;
}

export function clearPersistentCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const fetcher = <T>([fn, arg]: [string, Record<string, unknown>?]) => rpc<T>(fn, arg);

const opts = { revalidateOnFocus: true, keepPreviousData: true, shouldRetryOnError: (e: unknown) => !(e instanceof RpcError && !e.network) };

export const useToday = () => useSWR<TodayData>(["get_today"], fetcher, { ...opts, refreshInterval: 60_000 });
export const useStats = () => useSWR<StatsData>(["get_stats"], fetcher, opts);
export const useLeague = () => useSWR<LeagueData>(["league_board"], fetcher, { ...opts, refreshInterval: 60_000 });
export const useMember = (handle: string) =>
  useSWR<MemberCard | null>(["member_card", { p_handle: handle }], fetcher, opts);
export const useLadder = () => useSWR<LadderData>(["rank_ladder"], fetcher, opts);
export const useDuo = () => useSWR<Duo | null>(["my_duo"], fetcher, opts);

// SWR's exported `mutate` only touches the default cache. We use a custom
// (persisted) cache provider, so bind a mutator to it from inside <SWRConfig>.
type Mutator = ReturnType<typeof useSWRConfig>["mutate"];
let bound: Mutator | null = null;
export const mutate: Mutator = ((...args: Parameters<Mutator>) => (bound ?? (defaultMutate as Mutator))(...args)) as Mutator;

export function MutateBinder() {
  const { mutate: m } = useSWRConfig();
  useLayoutEffect(() => {
    bound = m;
  }, [m]);
  return null;
}

export const refreshToday = () => mutate(["get_today"]);
export const refreshAll = () => mutate(() => true);
