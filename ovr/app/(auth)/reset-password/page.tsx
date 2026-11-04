"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { supabase } from "@/lib/supabase/client";

// Landing page for the password-reset email link (#access_token=…&type=recovery).
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "bad">("checking");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const access_token = h.get("access_token");
    const refresh_token = h.get("refresh_token");
    const done = (ok: boolean) => setReady(ok ? "ok" : "bad");
    if (access_token && refresh_token) {
      supabase()
        .auth.setSession({ access_token, refresh_token })
        .then(({ error }) => {
          history.replaceState(null, "", "/reset-password");
          done(!error);
        });
    } else {
      supabase()
        .auth.getSession()
        .then(({ data }) => done(!!data.session));
    }
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setErr(copy.auth.weakPassword);
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace("/today");
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <div className="font-display mt-10 text-6xl text-ember">OVR</div>
      <h1 className="font-display mt-2 mb-6 text-4xl uppercase">{copy.auth.resetTitle}</h1>
      {ready === "bad" ? (
        <p className="text-muted">{copy.auth.resetInvalid}</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <Input label={copy.auth.passwordLabel} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint={copy.auth.passwordHint} />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={ready !== "ok"}>
            {copy.auth.resetSave}
          </Button>
        </form>
      )}
    </main>
  );
}
