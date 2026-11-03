"use client";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { copy } from "@/lib/copy";
import { supabase, rpc } from "@/lib/supabase/client";

// Email OTP codes (not magic links): links open in Safari, not the installed
// Home Screen app, so the session would land in the wrong place on iPhone.
export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [invite, setInvite] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/today");

  useEffect(() => {
    // Static page: URL params are only readable after hydration.
    const p = new URLSearchParams(window.location.search);
    const n = p.get("next");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL (external) after hydration
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
    const i = p.get("invite");
    if (i) setInvite(i.toUpperCase());
    supabase()
      .auth.getSession()
      .then(({ data }) => data.session && router.replace("/today"));
  }, [router]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const code = invite.trim().toUpperCase();
      if (code && !(await rpc<boolean>("check_invite", { p_code: code }))) {
        setErr(copy.auth.badInvite);
        return;
      }
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: !!code, data: code ? { invite_code: code } : undefined },
      });
      if (error) {
        if (/signups? not allowed|not found|invalid login/i.test(error.message)) setErr(copy.auth.noAccount);
        else if (/invite/i.test(error.message)) setErr(copy.auth.badInvite);
        else setErr(error.message);
        return;
      }
      setStep("code");
    } catch {
      setErr(copy.toast.error);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setErr(copy.auth.badCode);
    router.replace(next);
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

      {step === "email" ? (
        <form onSubmit={send} className="space-y-4">
          <Input
            label={copy.auth.inviteLabel}
            name="invite"
            placeholder={copy.auth.invitePlaceholder}
            value={invite}
            onChange={(e) => setInvite(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            autoCapitalize="characters"
            autoComplete="off"
            hint={copy.auth.inviteHint}
            maxLength={16}
          />
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
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {copy.auth.sendCode}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-muted">{copy.auth.codeSent(email)}</p>
          <Input
            label={copy.auth.codeLabel}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="font-display tnum text-center text-3xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length < 6}>
            {copy.auth.verify}
          </Button>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => send()}>
              {copy.auth.resend}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setStep("email"); setCode(""); }}>
              {copy.auth.changeEmail}
            </Button>
          </div>
        </form>
      )}

      <p className="mt-auto pt-10 text-xs leading-relaxed text-muted" data-testid="privacy-note">
        {copy.auth.privacy}
      </p>
    </main>
  );
}
