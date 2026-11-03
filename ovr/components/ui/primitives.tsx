"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { forwardRef, useEffect } from "react";
import { copy } from "@/lib/copy";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg" | "sm";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, className = "", children, disabled, ...rest },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 select-none";
  const sizes = { sm: "min-h-9 px-3 text-sm", md: "min-h-11 px-4 text-[15px]", lg: "min-h-14 px-6 text-base" };
  const variants = {
    primary: "bg-ember text-black shadow-[0_8px_30px_-8px_rgba(255,106,26,0.7)]",
    secondary: "bg-raised text-fg border border-stroke",
    ghost: "text-muted hover:text-fg",
    danger: "bg-danger/15 text-danger border border-danger/30",
  };
  return (
    <button ref={ref} disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {loading ? <Spinner /> : children}
    </button>
  );
});

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-label={copy.states.loading} />;
}

export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-stroke bg-surface ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="font-display text-sm uppercase tracking-[0.14em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Header({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 -mx-4 mb-2 flex items-center gap-2 bg-bg/85 px-4 pb-3 backdrop-blur-md">
      {back && (
        <Link href={back} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-muted active:bg-raised">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
      )}
      <h1 className="font-display flex-1 text-3xl uppercase tracking-wide">{title}</h1>
      {right}
    </header>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const { label, hint, className = "", id, ...rest } = props;
  const inputId = id ?? rest.name ?? label;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>}
      <input
        id={inputId}
        className={`min-h-12 w-full rounded-2xl border border-stroke bg-raised px-4 text-base text-fg outline-none placeholder:text-muted/60 focus:border-ember ${className}`}
        {...rest}
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span>
        <span className="block text-[15px]">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-ember" : "bg-stroke"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl border border-stroke bg-surface p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative min-h-10 flex-1 rounded-xl text-sm font-semibold transition ${value === o.value ? "text-black" : "text-muted"}`}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-xl bg-fg" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-[28px] border-t border-stroke bg-surface px-5 pt-3"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 24px)" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-stroke" />
            {title && <h2 className="font-display mb-4 text-2xl uppercase">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({ emoji = "🫡", title, body, action }: { emoji?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="empty-state">
      <div className="mb-3 text-5xl">{emoji}</div>
      <h3 className="font-display text-2xl uppercase">{title}</h3>
      {body && <p className="mt-2 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 text-4xl">🧯</div>
      <p className="text-sm text-muted">{message ?? copy.states.error}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          {copy.states.retry}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-raised ${className}`} />;
}

export function ProgressBar({ value, max, color = "bg-ember" }: { value: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
    </div>
  );
}
