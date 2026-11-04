"use client";
import { SWRConfig } from "swr";
import { useEffect, useState } from "react";
import { MutateBinder, persistentCache } from "@/lib/data";
import { ToastProvider } from "./ui/toast";
import { SyncProvider } from "./sync";

export function Providers({ children }: { children: React.ReactNode }) {
  const [provider] = useState(() => (typeof window === "undefined" ? undefined : persistentCache));

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`, { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  return (
    <SWRConfig value={provider ? { provider } : {}}>
      <MutateBinder />
      <ToastProvider>
        <SyncProvider>{children}</SyncProvider>
      </ToastProvider>
    </SWRConfig>
  );
}
