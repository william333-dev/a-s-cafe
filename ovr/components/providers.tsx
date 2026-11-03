"use client";
import { SWRConfig } from "swr";
import { useEffect, useState } from "react";
import { persistentCache } from "@/lib/data";
import { ToastProvider } from "./ui/toast";
import { SyncProvider } from "./sync";

export function Providers({ children }: { children: React.ReactNode }) {
  const [provider] = useState(() => (typeof window === "undefined" ? undefined : persistentCache));

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  return (
    <SWRConfig value={provider ? { provider } : {}}>
      <ToastProvider>
        <SyncProvider>{children}</SyncProvider>
      </ToastProvider>
    </SWRConfig>
  );
}
