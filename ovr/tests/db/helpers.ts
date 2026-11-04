import pg from "pg";

export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

/** Run queries as an authenticated user (RLS applies), like PostgREST does. */
export async function asUser<T = Record<string, unknown>>(
  uid: string | null,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (uid) {
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: uid, role: "authenticated" }),
      ]);
      await c.query("set local role authenticated");
    } else {
      await c.query("set local role anon");
    }
    const r = await c.query(text, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function rpc<T = unknown>(uid: string, fn: string, args: unknown[] = []): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await asUser<{ r: T }>(uid, `select public.${fn}(${ph}) as r`, args);
  return rows[0].r;
}

export async function errCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no_error";
  } catch (e) {
    return (e as Error).message;
  }
}

export async function setNow(instant: Date | string | null) {
  if (instant === null) {
    await sql("delete from private.app_config where key = 'fake_now'");
  } else {
    const v = typeof instant === "string" ? instant : instant.toISOString();
    await sql(
      "insert into private.app_config(key, value) values ('fake_now', $1) on conflict (key) do update set value = excluded.value",
      [v],
    );
  }
}

export async function resetDb() {
  await setNow(null);
  await sql("delete from auth.users");
  await sql("delete from public.invite_codes");
  await sql("delete from public.weekly_recaps");
  await sql("delete from public.season_champions");
  await sql("insert into public.invite_codes(code, uses_left) values ('LOCKIN', 1000)");
}

let n = 0;
export async function createUser(opts: { invite?: string | null; email?: string } = {}): Promise<string> {
  const email = opts.email ?? `t${Date.now()}_${n++}@ovr.test`;
  const meta = opts.invite === null ? {} : { invite_code: opts.invite ?? "LOCKIN" };
  const res = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password-123", email_confirm: true, user_metadata: meta }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.msg ?? body.message ?? JSON.stringify(body));
  return body.id as string;
}

/** Create + onboard a user directly. */
export async function member(
  handle: string,
  opts: { tz?: string; baseline?: number; startDate?: string; ratings?: Record<string, number> } = {},
): Promise<string> {
  const uid = await createUser();
  await sql(
    `update public.profiles set handle = $2::text, display_name = $2::text, onboarded = true,
       timezone = coalesce($3::text, timezone), baseline_ovr = coalesce($4::int, baseline_ovr),
       start_date = coalesce($5::date, private.local_today($1))
     where id = $1`,
    [uid, handle, opts.tz ?? null, opts.baseline ?? null, opts.startDate ?? null],
  );
  if (opts.ratings)
    await sql(`update public.profile_settings set setup = jsonb_build_object('ratings', $2::jsonb) where user_id = $1`, [
      uid,
      JSON.stringify(opts.ratings),
    ]);
  return uid;
}

export async function addHabit(uid: string, h: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(h);
  const vals = Object.values(h).map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : v));
  const rows = await asUser<{ id: string }>(
    uid,
    `insert into public.habits(user_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [uid, ...vals],
  );
  return rows[0].id;
}

export const uuid = () => crypto.randomUUID();
