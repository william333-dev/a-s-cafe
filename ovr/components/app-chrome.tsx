"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { isIos, isStandalone } from "@/lib/haptics";
import { useSync } from "./sync";
import { Button } from "./ui/primitives";

const TABS = [
  { href: "/today", label: "Today", icon: "M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" },
  { href: "/stats", label: "Stats", icon: "M5 20V11M12 20V4M19 20v-6" },
  { href: "/league", label: "League", icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function BottomTabs() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stroke bg-bg/90 backdrop-blur-lg"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-lg items-stretch">
        {TABS.map((t) => {
          const on = path === t.href || path.startsWith(`${t.href}/`) || (t.href === "/today" && path === "/ovr");
          return (
            <Link key={t.href} href={t.href} className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? "text-fg" : "text-muted"}`} aria-current={on ? "page" : undefined}>
              {on && <motion.span layoutId="tab-dot" className="absolute top-0 h-0.5 w-10 rounded-full bg-ember" />}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Fab() {
  const path = usePathname();
  if (!["/today", "/habits"].includes(path)) return null;
  return (
    <Link
      href="/habits/new"
      aria-label={copy.habits.new}
      className="fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-ember text-black shadow-[0_10px_30px_-6px_rgba(255,106,26,.8)] active:scale-95"
      style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 16px)" }}
      data-testid="fab"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </Link>
  );
}

export function OfflineBanner() {
  const { online, ops } = useSync();
  return (
    <AnimatePresence>
      {(!online || ops.length > 0) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          data-testid="offline-banner"
        >
          <div className="mx-auto mb-2 max-w-lg rounded-xl border border-stroke bg-raised px-3 py-2 text-center text-xs text-muted">
            {!online ? copy.states.offline : `Syncing ${ops.length} rep${ops.length === 1 ? "" : "s"}…`}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Android: native install prompt. iOS: "Share → Add to Home Screen" instructions. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem("ovr-install-dismissed") ?? 0) > Date.now() - 7 * 864e5;
    } catch {}
    if (dismissed) return;
    if (isIos()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only detection after hydration
      setIos(true);
      setHidden(false);
    }
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden || (!ios && !evt)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("ovr-install-dismissed", String(Date.now()));
    } catch {}
  };
  return (
    <div className="mx-auto mb-3 flex max-w-lg items-center gap-3 rounded-2xl border border-stroke bg-surface p-3" data-testid="install-prompt">
      <span className="font-display grid size-11 shrink-0 place-items-center rounded-xl bg-ember text-xl text-black">OVR</span>
      <span className="flex-1 text-sm">
        <span className="block font-semibold">{copy.install.title}</span>
        <span className="text-muted">
          {ios ? (
            <>
              Tap <ShareIcon /> Share, then “Add to Home Screen”.
            </>
          ) : (
            copy.install.android
          )}
        </span>
      </span>
      {!ios && evt && (
        <Button size="sm" onClick={() => evt.prompt().then(dismiss)}>
          {copy.install.cta}
        </Button>
      )}
      <button onClick={dismiss} aria-label={copy.install.dismiss} className="grid size-9 place-items-center text-muted">
        ✕
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="inline -mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
