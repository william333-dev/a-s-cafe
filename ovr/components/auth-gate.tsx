"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToday } from "@/lib/data";

/** Signed-in + onboarded, or bounce. Works offline (session is in localStorage). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => setState(data.session ? "in" : "out"));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setState(s ? "in" : "out"));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (state === "out") router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [state, router, path]);
  if (state !== "in") return <Splash />;
  return <OnboardedGate>{children}</OnboardedGate>;
}

function OnboardedGate({ children }: { children: React.ReactNode }) {
  const { data } = useToday();
  const router = useRouter();
  useEffect(() => {
    if (data && !data.profile.onboarded) router.replace("/onboarding");
  }, [data, router]);
  if (data && !data.profile.onboarded) return <Splash />;
  return <>{children}</>;
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <span className="font-display animate-pulse text-6xl text-ember">OVR</span>
    </div>
  );
}
