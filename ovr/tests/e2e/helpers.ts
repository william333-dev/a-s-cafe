import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const pool = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 2 });
export const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as T[];

export async function otpFor(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`http://127.0.0.1:54324/api/v1/messages?limit=50`).then((x) => x.json());
    const m = (r.messages ?? []).find((x: { To: { Address: string }[] }) => x.To?.some((t) => t.Address === email));
    if (m) {
      const full = await fetch(`http://127.0.0.1:54324/api/v1/message/${m.ID}`).then((x) => x.json());
      const code = (full.Text as string).match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`no OTP email for ${email}`);
}

export const uniqueEmail = (p: string) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}@ovr.test`;

/** Full signup through the UI: invite + email OTP + setup quiz + hold-to-lock-in. */
export async function signUpAndOnboard(page: Page, opts: { email?: string; handle: string; name?: string; quit?: string }) {
  const email = opts.email ?? uniqueEmail(opts.handle);
  await page.goto("/login");
  await page.getByLabel("Invite code").fill("LOCKIN");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await page.getByLabel("6-digit code").fill(await otpFor(email));
  await page.getByRole("button", { name: "Lock in" }).click();
  await page.waitForURL("**/onboarding");

  await page.getByRole("button", { name: /Body/ }).click();
  await page.getByRole("button", { name: /Focus/ }).click();
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-rate")).toBeVisible();
  await page.getByTestId("quiz-next").click();
  await page.getByPlaceholder("Run a half marathon").fill("Run a half marathon");
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-starter")).toBeVisible();
  await page.getByTestId("quiz-next").click();
  if (opts.quit) await page.getByPlaceholder("e.g. Vaping").fill(opts.quit);
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-notify")).toBeVisible();
  await page.getByTestId("quiz-next").click();
  await page.getByLabel("Handle").fill(opts.handle);
  await page.getByLabel("Display name").fill(opts.name ?? opts.handle);
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("starting-estimate")).toContainText("Starting estimate: 54 · Bronze");
  await page.getByTestId("quiz-next").click();
  const hold = page.getByTestId("hold-to-lock-in");
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await page.waitForURL("**/today", { timeout: 15_000 });
  return email;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("6-digit code").fill(await otpFor(email));
  await page.getByRole("button", { name: "Lock in" }).click();
  await page.waitForURL("**/today");
}

export async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
}
