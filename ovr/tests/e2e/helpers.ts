import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const pool = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", max: 2 });
export const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as T[];

export const uniqueEmail = (p: string) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}@ovr.test`;

export const PASSWORD = "lock-in-123";

/** Full signup through the UI: email + password, setup quiz, hold-to-lock-in. */
export async function signUpAndOnboard(page: Page, opts: { email?: string; handle: string; name?: string; quit?: string }) {
  const email = opts.email ?? uniqueEmail(opts.handle);
  await page.goto("/login");
  await page.getByRole("tab", { name: "Sign up" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
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
  await expect(page.getByTestId("starting-estimate")).toContainText("Starting estimate: 54 · Bronze II");
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

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Lock in" }).click();
  await page.waitForURL("**/today");
}

export async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
}
