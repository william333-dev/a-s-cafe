"use client";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { supabase } from "@/lib/supabase/client";

type Mode = "signup" | "signin";

// Plain email + password. No invite codes, no emailed codes.
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => data.session && router.replace("/today"));
  }, [router]);

  const next = () => {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/today";
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setNote(null);
    if (password.length < 8) return setErr(copy.auth.weakPassword);
    setBusy(true);
    try {
      const creds = { email: email.trim(), password };
      if (mode === "signup") {
        const { data, error } = await supabase().auth.signUp(creds);
        if (error) {
          if (/already registered|already exists/i.test(error.message)) {
            setMode("signin");
            return setErr(copy.auth.exists);
          }
          return setErr(/password/i.test(error.message) ? copy.auth.weakPassword : error.message);
        }
        // Supabase hides "already registered" behind an empty identities list when confirmations are on
        if (data.user && data.user.identities?.length === 0) {
          setMode("signin");
          return setErr(copy.auth.exists);
        }
        if (!data.session) return setNote(copy.auth.checkEmail(creds.email));
        router.replace("/today");
      } else {
        const { error } = await supabase().auth.signInWithPassword(creds);
        if (error) return setErr(/confirm/i.test(error.message) ? copy.auth.checkEmail(creds.email) : copy.auth.wrongPassword);
        router.replace(next());
      }
    } catch {
      setErr(copy.toast.error);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setErr(null);
    if (!email.trim()) return setErr("Type your email first.");
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setErr(error.message);
    else setNote(copy.auth.resetSent(email.trim()));
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <div className="mt-10 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-7xl text-ember">
          OVR
        </motion.div>
        <h1 className="font-display mt-2 text-4xl uppercase">{copy.auth.title}</h1>
        <p className="mt-1 text-muted">{copy.tagline}</p>
      </div>

      <Segmented<Mode>
        value={mode}
        onChange={(m) => {
          setMode(m);
          setErr(null);
          setNote(null);
        }}
        options={[
          { value: "signup", label: copy.auth.signUpTab },
          { value: "signin", label: copy.auth.signInTab },
        ]}
      />

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Input
          label={copy.auth.emailLabel}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={copy.auth.passwordLabel}
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          hint={mode === "signup" ? copy.auth.passwordHint : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        {note && <p className="rounded-xl border border-ice/30 bg-ice/10 p-3 text-sm text-ice" data-testid="auth-note">{note}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {mode === "signup" ? copy.auth.signUp : copy.auth.signIn}
        </Button>
        {mode === "signin" && (
          <button type="button" onClick={forgot} className="min-h-11 w-full text-sm text-muted underline">
            {copy.auth.forgot}
          </button>
        )}
      </form>

      <p className="mt-auto pt-10 text-xs leading-relaxed text-muted" data-testid="privacy-note">
        {copy.auth.privacy}
      </p>
    </main>
  );
}
