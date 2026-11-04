"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/auth-gate";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => router.replace(data.session ? "/today" : "/login"));
  }, [router]);
  return <Splash />;
}
