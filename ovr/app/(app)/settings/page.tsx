"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Header, Input, SectionTitle, Skeleton, Toggle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { copy } from "@/lib/copy";
import { clearPersistentCache, refreshToday, useToday } from "@/lib/data";
import { deviceTimeZone } from "@/lib/dates";
import { isIos, isStandalone } from "@/lib/haptics";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/push/client";
import { rpc, supabase } from "@/lib/supabase/client";
import type { Notify, TodayData } from "@/lib/types";

export default function Settings() {
  const { data } = useToday();
  if (!data) return <Skeleton className="mt-16 h-96" />;
  return <SettingsForm data={data} />;
}

function SettingsForm({ data }: { data: TodayData }) {
  const router = useRouter();
  const toast = useToast();
  const [notify, setNotify] = useState<Notify | null>(data.settings.notify);
  const [push, setPush] = useState<"on" | "off" | "unsupported">(() => (pushSupported() ? "off" : "unsupported"));
  const [name, setName] = useState(data.profile.display_name);
  const [tz, setTz] = useState(data.profile.timezone);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (pushSupported()) currentSubscription().then((s) => setPush(s ? "on" : "off"));
  }, []);

  const saveNotify = async (n: Notify) => {
    setNotify(n);
    const { error } = await supabase().from("profile_settings").update({ notify: n, updated_at: new Date().toISOString() }).eq("user_id", data.profile.id);
    if (error) toast(copy.toast.error, "warn");
  };
  const saveProfile = async () => {
    const { error } = await supabase().from("profiles").update({ display_name: name.trim(), timezone: tz }).eq("id", data.profile.id);
    toast(error ? copy.toast.error : copy.toast.saved, error ? "warn" : "good");
    refreshToday();
  };
  const exportData = async () => {
    const json = await rpc<unknown>("export_my_data");
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ovr-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const signOut = async () => {
    await supabase().auth.signOut();
    clearPersistentCache();
    router.replace("/login");
  };
  const deleteAccount = async () => {
    await disablePush().catch(() => {});
    await rpc("delete_my_account");
    await supabase().auth.signOut();
    clearPersistentCache();
    router.replace("/login");
  };
  const testPush = async () => {
    const { data: s } = await supabase().auth.getSession();
    const r = await fetch("/api/push/test", { method: "POST", headers: { authorization: `Bearer ${s.session?.access_token}` } });
    toast(r.ok ? "Sent." : copy.toast.error, r.ok ? "good" : "warn");
  };

  return (
    <div>
      <Header title={copy.settings.title} back="/profile" />
      <SectionTitle>{copy.settings.profile}</SectionTitle>
      <Card className="space-y-3 p-4">
        <Input label={copy.quiz.nameLabel} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <Input label={copy.settings.timezone} value={tz} onChange={(e) => setTz(e.target.value)} hint={`This device: ${deviceTimeZone()}`} />
        <Button variant="secondary" className="w-full" onClick={saveProfile}>{copy.toast.saved.replace(".", "")}</Button>
      </Card>

      <SectionTitle>{copy.settings.notifications}</SectionTitle>
      <Card className="p-4">
        {notify && (
          <div className="divide-y divide-stroke">
            <div className="flex items-center gap-3">
              <div className="flex-1"><Toggle label={copy.settings.morning} checked={notify.morning_on} onChange={(v) => saveNotify({ ...notify, morning_on: v })} /></div>
              <input type="time" aria-label="Morning time" className="tnum min-h-11 rounded-xl border border-stroke bg-raised px-3" value={notify.morning} onChange={(e) => saveNotify({ ...notify, morning: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1"><Toggle label={copy.settings.evening} sub="Only if reps are left" checked={notify.evening_on} onChange={(v) => saveNotify({ ...notify, evening_on: v })} /></div>
              <input type="time" aria-label="Evening time" className="tnum min-h-11 rounded-xl border border-stroke bg-raised px-3" value={notify.evening} onChange={(e) => saveNotify({ ...notify, evening: e.target.value })} />
            </div>
            <Toggle label={copy.settings.recap} sub="Sunday 7pm" checked={notify.recap_on} onChange={(v) => saveNotify({ ...notify, recap_on: v })} />
          </div>
        )}
        <div className="mt-3">
          {isIos() && !isStandalone() ? (
            <p className="rounded-xl border border-ice/30 bg-ice/10 p-3 text-sm text-ice">{copy.settings.iosInstall}</p>
          ) : push === "unsupported" ? (
            <p className="text-sm text-muted">{copy.settings.pushUnsupported}</p>
          ) : push === "on" ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-success">{copy.settings.pushOn}</p>
              <Button size="sm" variant="secondary" onClick={testPush}>{copy.settings.testPush}</Button>
              <Button size="sm" variant="ghost" onClick={() => disablePush().then(() => setPush("off"))}>Off</Button>
            </div>
          ) : (
            <Button className="w-full" onClick={async () => {
              const r = await enablePush();
              setPush(r === "on" ? "on" : "off");
              if (r !== "on") toast(r === "denied" ? copy.settings.pushDenied : copy.toast.error, "warn");
            }}>{copy.settings.enablePush}</Button>
          )}
        </div>
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card className="space-y-3 p-4">
        <Button variant="secondary" className="w-full" onClick={exportData} data-testid="export">{copy.settings.export}</Button>
        <Button variant="secondary" className="w-full" onClick={signOut}>{copy.settings.signOut}</Button>
      </Card>
      <Card className="mt-3 space-y-3 border-danger/30 p-4">
        <p className="text-sm text-muted">{copy.settings.deleteConfirm}</p>
        <Input aria-label="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        <Button variant="danger" className="w-full" disabled={confirm !== "DELETE"} onClick={deleteAccount}>{copy.settings.delete}</Button>
      </Card>
    </div>
  );
}
