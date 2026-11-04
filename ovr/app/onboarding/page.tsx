"use client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { OvrCard } from "@/components/rating/ovr-card";
import { Button, Input, Toggle } from "@/components/ui/primitives";
import { HoldToLockInButton } from "@/components/ui/hold-button";
import { useToast } from "@/components/ui/toast";
import { ATTRIBUTE_META, copy, STARTER_HABITS } from "@/lib/copy";
import { deviceTimeZone } from "@/lib/dates";
import { isIos, isStandalone } from "@/lib/haptics";
import { enablePush, pushSupported } from "@/lib/push/client";
import { ATTRIBUTES, baselineFromRatings, rankFor, type Attribute, type Difficulty } from "@/lib/rating-engine";
import { rpc, supabase } from "@/lib/supabase/client";
import { mutate } from "@/lib/data";

type Starter = { title: string; emoji: string; attribute: Attribute; difficulty: Difficulty; on: boolean };

const STEPS = ["focus", "rate", "goal", "starter", "quit", "notify", "profile", "reveal", "commit"] as const;

export default function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const [i, setI] = useState(0);
  const [focus, setFocus] = useState<Attribute[]>([]);
  const [ratings, setRatings] = useState<Partial<Record<Attribute, number>>>({});
  const [goal, setGoal] = useState("");
  const [timeframe, setTimeframe] = useState<string>(copy.quiz.timeframes[1]);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [quit, setQuit] = useState("");
  const [notify, setNotify] = useState({ morning: "07:30", evening: "20:30", morning_on: true, evening_on: true, recap_on: true });
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) return router.replace("/login");
        const base = (data.user.email ?? "player").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
        setHandle((h) => h || base.padEnd(3, "_"));
        setName((n) => n || base.charAt(0).toUpperCase() + base.slice(1));
      });
  }, [router]);

  const baseline = useMemo(() => baselineFromRatings(ratings), [ratings]);
  const step = STEPS[i];

  const next = () => {
    setErr(null);
    if (step === "focus" && !focus.length) return setErr("Pick at least one.");
    if (step === "focus") {
      setRatings(Object.fromEntries(focus.map((a) => [a, ratings[a] ?? 5])));
      const picks: Starter[] = [];
      for (const a of focus) for (const s of STARTER_HABITS[a].slice(0, focus.length > 2 ? 1 : 2)) picks.push({ ...s, attribute: a, on: true });
      setStarters(picks.slice(0, 5));
    }
    if (step === "goal" && !goal.trim()) return setErr("One goal. Doesn't have to be huge.");
    if (step === "profile" && !/^[a-zA-Z0-9_]{3,20}$/.test(handle)) return setErr("Handle: 3–20 letters, numbers or _.");
    if (step === "profile") return save();
    setI((x) => Math.min(STEPS.length - 1, x + 1));
  };

  async function save() {
    setBusy(true);
    try {
      await rpc("complete_onboarding", {
        p_handle: handle,
        p_display_name: name.trim() || handle,
        p_timezone: deviceTimeZone(),
        p_setup: { focus, ratings, goal: goal.trim(), timeframe },
        p_notify: notify,
      });
      const { data: u } = await supabase().auth.getUser();
      const uid = u.user!.id;
      const chosen = starters.filter((s) => s.on && s.title.trim());
      if (chosen.length) {
        const { data: existing } = await supabase().from("habits").select("id").eq("user_id", uid).limit(1);
        if (!existing?.length)
          await supabase().from("habits").insert(
            chosen.map((s, n) => ({ user_id: uid, title: s.title.trim(), emoji: s.emoji, attribute: s.attribute, difficulty: s.difficulty, sort_order: n })),
          );
      }
      if (quit.trim()) {
        const { data: q } = await supabase().from("quit_trackers").select("id").eq("user_id", uid).limit(1);
        if (!q?.length) await supabase().from("quit_trackers").insert({ user_id: uid, title: quit.trim() });
      }
      setI(STEPS.indexOf("reveal"));
    } catch (e) {
      setErr((e as Error).message === "handle_taken" ? "Handle's taken. Try another." : copy.toast.error);
    } finally {
      setBusy(false);
    }
  }

  const finish = async () => {
    // put fresh (onboarded) state in the cache before leaving, so the gate doesn't bounce us back
    await mutate(["get_today"], rpc("get_today"), { revalidate: false }).catch(() => {});
    setTimeout(() => router.replace("/today"), 700);
  };

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8">
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STEPS.map((s, n) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-ember" : "bg-stroke"}`} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className="mt-8 flex-1"
          data-testid={`quiz-${step}`}
        >
          {step === "focus" && (
            <>
              <H title={copy.quiz.focusTitle} sub={copy.quiz.focusSub} />
              <div className="grid grid-cols-2 gap-3">
                {ATTRIBUTES.map((a) => {
                  const on = focus.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => setFocus((f) => (on ? f.filter((x) => x !== a) : [...f, a]))}
                      aria-pressed={on}
                      className={`min-h-24 rounded-2xl border p-3 text-left transition active:scale-95 ${on ? "border-ember bg-ember/10" : "border-stroke bg-surface"}`}
                    >
                      <div className="text-2xl">{ATTRIBUTE_META[a].emoji}</div>
                      <div className="font-display mt-1 text-xl uppercase">{ATTRIBUTE_META[a].label}</div>
                      <div className="text-xs text-muted">{ATTRIBUTE_META[a].blurb}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "rate" && (
            <>
              <H title={copy.quiz.rateTitle} sub={copy.quiz.rateSub} />
              <div className="space-y-5">
                {focus.map((a) => (
                  <label key={a} className="block">
                    <div className="mb-2 flex justify-between">
                      <span className="font-display text-lg uppercase">{ATTRIBUTE_META[a].emoji} {ATTRIBUTE_META[a].label}</span>
                      <span className="font-display tnum text-2xl text-ember">{ratings[a] ?? 5}</span>
                    </div>
                    <input type="range" min={1} max={10} value={ratings[a] ?? 5} onChange={(e) => setRatings((r) => ({ ...r, [a]: Number(e.target.value) }))} className="w-full accent-[#FF6A1A]" aria-label={ATTRIBUTE_META[a].label} />
                  </label>
                ))}
              </div>
            </>
          )}

          {step === "goal" && (
            <>
              <H title={copy.quiz.goalTitle} />
              <Input name="goal" value={goal} maxLength={60} placeholder={copy.quiz.goalPlaceholder} onChange={(e) => setGoal(e.target.value)} hint={`${goal.length}/60`} />
              <p className="mb-2 mt-5 text-sm text-muted">{copy.quiz.timeframeLabel}</p>
              <div className="flex flex-wrap gap-2">
                {copy.quiz.timeframes.map((t) => (
                  <button key={t} onClick={() => setTimeframe(t)} className={`min-h-11 rounded-full border px-4 text-sm ${timeframe === t ? "border-ember bg-ember/10" : "border-stroke"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "starter" && (
            <>
              <H title={copy.quiz.starterTitle} sub={copy.quiz.starterSub} />
              <div className="space-y-2">
                {starters.map((s, n) => (
                  <div key={n} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${s.on ? "border-stroke bg-surface" : "border-stroke/50 opacity-50"}`}>
                    <span className="text-2xl">{s.emoji}</span>
                    <input value={s.title} maxLength={60} onChange={(e) => setStarters((xs) => xs.map((x, k) => (k === n ? { ...x, title: e.target.value } : x)))} className="min-h-11 flex-1 bg-transparent text-[15px] outline-none" aria-label="Habit name" />
                    <span className="text-xs text-muted">{ATTRIBUTE_META[s.attribute].short}</span>
                    <button onClick={() => setStarters((xs) => xs.map((x, k) => (k === n ? { ...x, on: !x.on } : x)))} className="grid size-11 place-items-center text-muted" aria-label={s.on ? "Remove" : "Add back"}>
                      {s.on ? "✕" : "↺"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === "quit" && (
            <>
              <H title={copy.quiz.quitTitle} sub={copy.quiz.quitSub} />
              <Input name="quit" value={quit} maxLength={40} placeholder={copy.quiz.quitPlaceholder} onChange={(e) => setQuit(e.target.value)} />
            </>
          )}

          {step === "notify" && (
            <>
              <H title={copy.quiz.notifyTitle} sub={copy.quiz.notifySub} />
              <div className="space-y-3 rounded-2xl border border-stroke bg-surface p-4">
                <TimeRow label={copy.settings.morning} on={notify.morning_on} time={notify.morning} onChange={(on, time) => setNotify((n) => ({ ...n, morning_on: on, morning: time }))} />
                <TimeRow label={copy.settings.evening} on={notify.evening_on} time={notify.evening} onChange={(on, time) => setNotify((n) => ({ ...n, evening_on: on, evening: time }))} />
              </div>
              {isIos() && !isStandalone() ? (
                <p className="mt-4 rounded-2xl border border-ice/30 bg-ice/10 p-3 text-sm text-ice">{copy.settings.iosInstall}</p>
              ) : pushSupported() ? (
                <Button
                  variant="secondary"
                  className="mt-4 w-full"
                  onClick={async () => {
                    const r = await enablePush();
                    toast(r === "on" ? copy.settings.pushOn : r === "denied" ? copy.settings.pushDenied : copy.toast.error, r === "on" ? "good" : "warn");
                  }}
                >
                  {copy.settings.enablePush}
                </Button>
              ) : (
                <p className="mt-4 text-sm text-muted">{copy.settings.pushUnsupported}</p>
              )}
            </>
          )}

          {step === "profile" && (
            <>
              <H title={copy.quiz.profileTitle} />
              <div className="space-y-4">
                <Input name="handle" label={copy.quiz.handleLabel} value={handle} maxLength={20} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} autoCapitalize="none" />
                <Input name="display_name" label={copy.quiz.nameLabel} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
              </div>
            </>
          )}

          {step === "reveal" && (
            <div className="flex flex-col items-center">
              <H title={copy.quiz.revealTitle} />
              <motion.div initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 1.2, ease: [0.2, 0.9, 0.3, 1.1] }} style={{ transformPerspective: 900 }} className="w-full max-w-xs">
                <OvrCard overall={baseline} name={name || handle} handle={handle} level={1} attrs={Object.fromEntries(focus.map((a) => [a, Math.round(45 + (((ratings[a] ?? 5) - 1) / 9) * 20)]))} />
              </motion.div>
              <p className="font-display mt-6 text-2xl uppercase" data-testid="starting-estimate">{copy.quiz.revealSub(baseline, rankFor(baseline).label)}</p>
              <p className="mt-1 text-center text-sm text-muted">{copy.quiz.revealNote}</p>
            </div>
          )}

          {step === "commit" && (
            <div className="flex flex-col items-center text-center">
              <H title={copy.quiz.commitTitle} />
              <div className="mb-10 rounded-2xl border border-stroke bg-surface px-5 py-4">
                <div className="text-xs uppercase tracking-widest text-muted">Goal · {timeframe}</div>
                <div className="font-display mt-1 text-3xl uppercase">{goal}</div>
              </div>
              <HoldToLockInButton label={copy.quiz.holdLabel} doneLabel={copy.quiz.locked} onComplete={finish} />
              <p className="mt-6 text-sm text-muted">{copy.quiz.commitSub}</p>
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {step !== "commit" && (
        <div className="flex gap-3">
          {i > 0 && step !== "reveal" && (
            <Button variant="secondary" size="lg" onClick={() => setI((x) => x - 1)}>
              {copy.quiz.back}
            </Button>
          )}
          {step === "quit" && !quit && (
            <Button variant="ghost" size="lg" onClick={() => setI((x) => x + 1)}>
              {copy.quiz.skip}
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={step === "reveal" ? () => setI((x) => x + 1) : next} loading={busy} data-testid="quiz-next">
            {copy.quiz.next}
          </Button>
        </div>
      )}
    </main>
  );
}

function H({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-4xl uppercase leading-none">{title}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </div>
  );
}

function TimeRow({ label, on, time, onChange }: { label: string; on: boolean; time: string; onChange: (on: boolean, time: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Toggle checked={on} onChange={(v) => onChange(v, time)} label={label} />
      </div>
      <input type="time" value={time} disabled={!on} onChange={(e) => onChange(on, e.target.value)} className="tnum min-h-11 rounded-xl border border-stroke bg-raised px-3 disabled:opacity-40" aria-label={`${label} time`} />
    </div>
  );
}
