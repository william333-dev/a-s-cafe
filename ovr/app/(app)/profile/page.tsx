"use client";
import Link from "next/link";
import { useState } from "react";
import { OvrCard } from "@/components/rating/ovr-card";
import { Button, Card, ErrorState, Header, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { BADGES, badgeMeta } from "@/lib/badges";
import { copy } from "@/lib/copy";
import { useStats, useToday } from "@/lib/data";
import { renderChartCard, renderOvrCard, shareOrDownload, toBlob } from "@/lib/share-card";
import { attrsOf } from "@/lib/snapshot";

export default function Profile() {
  const { data, isLoading, mutate } = useToday();
  const { data: stats } = useStats();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data && isLoading) return <Skeleton className="mt-16 h-96" />;
  if (!data) return <ErrorState onRetry={() => mutate()} />;

  const share = async (kind: "card" | "chart") => {
    setBusy(kind);
    try {
      const c =
        kind === "card"
          ? await renderOvrCard({ displayName: data.profile.display_name, handle: data.profile.handle, overall: data.snapshot.overall, level: data.level.level, attrs: attrsOf(data.snapshot) })
          : await renderChartCard({ displayName: data.profile.display_name, points: stats?.history ?? [{ d: data.today, o: data.snapshot.overall }] });
      await shareOrDownload(await toBlob(c), kind === "card" ? "ovr-card.png" : "ovr-30-days.png");
    } catch {
      toast(copy.toast.error, "warn");
    } finally {
      setBusy(null);
    }
  };
  const makeInvite = async () => {
    const url = `${location.origin}/login`;
    try {
      if (navigator.share) await navigator.share({ title: "OVR", text: copy.profile.inviteText, url });
      else {
        await navigator.clipboard.writeText(`${copy.profile.inviteText} ${url}`);
        toast(copy.profile.inviteCopied, "good");
      }
    } catch {
      /* share sheet cancelled */
    }
  };

  const earned = new Set(data.badges);
  const allBadges = [...Object.keys(BADGES), ...data.badges.filter((b) => !BADGES[b])];

  return (
    <div>
      <Header title={copy.profile.title} right={<Link href="/settings" className="grid size-11 place-items-center text-muted" aria-label={copy.profile.settings}>⚙️</Link>} />
      <OvrCard overall={data.snapshot.overall} name={data.profile.display_name} handle={data.profile.handle} level={data.level.level} attrs={attrsOf(data.snapshot)} avatarSeed={data.profile.avatar_seed} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => share("card")} loading={busy === "card"} data-testid="share-card">{copy.profile.share}</Button>
        <Button variant="secondary" onClick={() => share("chart")} loading={busy === "chart"}>{copy.profile.shareChart}</Button>
      </div>

      <Card className="mt-3 p-4">
        <Button className="w-full" onClick={makeInvite}>{copy.profile.invite}</Button>
      </Card>

      {data.settings.setup.goal && (
        <Card className="mt-3 p-4">
          <div className="text-xs uppercase tracking-widest text-muted">Goal · {data.settings.setup.timeframe}</div>
          <div className="font-display mt-1 text-2xl uppercase">{data.settings.setup.goal}</div>
        </Card>
      )}

      <SectionTitle>{copy.profile.badges}</SectionTitle>
      <div className="grid grid-cols-3 gap-2" data-testid="badges">
        {allBadges.map((k) => {
          const m = badgeMeta(k);
          const on = earned.has(k);
          return (
            <div key={k} className={`rounded-2xl border p-3 text-center ${on ? "border-ember/40 bg-ember/5" : "border-stroke bg-surface opacity-40"}`} title={m.how}>
              <div className="text-2xl">{m.emoji}</div>
              <div className="mt-1 text-[11px] font-semibold leading-tight">{m.name}</div>
            </div>
          );
        })}
      </div>

      <SectionTitle>More</SectionTitle>
      <Card className="divide-y divide-stroke">
        {[
          ["/habits", copy.profile.habits],
          ["/quit", copy.profile.quit],
          ["/journal", copy.profile.journal],
          ["/ranks", copy.ladder.link],
          ["/how-ovr-works", copy.profile.rules],
          ["/settings", copy.profile.settings],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-12 items-center justify-between px-4 active:bg-raised">
            <span>{label}</span>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
