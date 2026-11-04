"use client";
import { AuthGate } from "@/components/auth-gate";
import { BottomTabs, Fab, InstallPrompt, OfflineBanner } from "@/components/app-chrome";
import { Celebrations } from "@/components/rating/celebrations";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <main className="pb-tabbar mx-auto min-h-dvh max-w-lg px-4">
        <div className="pt-safe" />
        <OfflineBanner />
        <InstallPrompt />
        {children}
      </main>
      <Fab />
      <BottomTabs />
      <Celebrations />
    </AuthGate>
  );
}
