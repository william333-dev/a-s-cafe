import { expect, test } from "@playwright/test";
import { PASSWORD, noHorizontalScroll, q, signIn, signUpAndOnboard, uniqueEmail } from "./helpers";


test("plain email + password: no codes, wrong password refused, duplicate sign-up redirected", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("privacy-note")).toContainText("Your journal and relapse notes are visible to you only");
  await expect(page.getByLabel("Invite code")).toHaveCount(0);
  const email = uniqueEmail("plain");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Password needs to be at least 8 characters.");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Lock in" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Wrong email or password.");
  await page.getByRole("tab", { name: "Sign up" }).click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("You've already got an account. Sign in instead.");
});

test("signup → quiz → Today → complete, perfect day, undo, OVR detail", async ({ page }) => {
  const email = await signUpAndOnboard(page, { handle: `will${Date.now() % 100000}`, name: "Will", quit: "Vaping" });
  const rows = page.getByTestId("habit-row");
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("quit-strip")).toContainText("Vaping");

  // tap every habit → XP toast, perfect day confetti
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click();
    await expect(rows.nth(i)).toHaveAttribute("data-done", "true");
  }
  await expect(page.getByTestId("toast").filter({ hasText: /Perfect day\. \+\d+ bonus/ })).toBeVisible();
  await expect(page.getByTestId("today-status")).toHaveText("Perfect day. That's how it's done.");
  const xpBefore = await page.getByTestId("xp-today").textContent();

  // long-press to undo the last one
  const last = rows.nth(n - 1);
  const box = (await last.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(last).toHaveAttribute("data-done", "false");
  await expect(page.getByTestId("toast").filter({ hasText: "Undone" })).toBeVisible();
  await expect(page.getByTestId("xp-today")).not.toHaveText(xpBefore!);

  // server agrees: one completion per habit, no duplicates, undo reversed bonus
  const [{ id }] = await q<{ id: string }>("select id from auth.users where email = $1", [email]);
  const comps = await q<{ count: number }>("select count from public.completions where user_id = $1", [id]);
  expect(comps).toHaveLength(n - 1);
  const [{ net }] = await q<{ net: number }>("select coalesce(sum(amount),0)::int net from public.xp_ledger where user_id = $1 and reason in ('perfect_day') or (user_id = $1 and reason = 'undo' and amount = -25)", [id]);
  expect(net).toBe(0);

  await page.goto("/ovr");
  await expect(page.getByTestId("ovr-card")).toBeVisible();
  await expect(page.getByTestId("next-rank")).toContainText(/to (Bronze|Silver) I/);
  await page.getByTestId("ladder-link").click();
  await page.waitForURL("**/ranks");
  await expect(page.getByTestId("ladder-row")).toHaveCount(25);
  const you = page.locator("[data-testid=ladder-row][data-you=true]");
  await expect(you).toHaveCount(1);
  await expect(you).toContainText("You");
  await expect(page.locator("[data-testid=ladder-row][data-rank='Apex']")).toContainText("0%");
  await noHorizontalScroll(page);
  await page.goto("/ovr");
  await page.getByRole("button", { name: "How OVR works" }).click();
  await expect(page.getByRole("dialog")).toContainText("OVR runs 40–99");
  await noHorizontalScroll(page);

  // sign out / in again lands on Today (already onboarded)
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await signIn(page, email);
  await expect(page.getByTestId("habit-row").first()).toBeVisible();
});

test("offline taps queue in IndexedDB and sync once, without duplicates", async ({ page, context }) => {
  const email = await signUpAndOnboard(page, { handle: `off${Date.now() % 100000}` });
  const rows = page.getByTestId("habit-row");
  await expect(rows.first()).toBeVisible();
  await context.setOffline(true);
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.getByTestId("toast").filter({ hasText: "Offline. Saved" })).toBeVisible();
  // reload while offline: shell + cached data + queued tap still shown
  const [{ id }] = await q<{ id: string }>("select id from auth.users where email = $1", [email]);
  expect(await q("select * from public.completions where user_id = $1", [id])).toHaveLength(0);
  await context.setOffline(false);
  await expect(page.getByTestId("toast").filter({ hasText: /Back online\. 1 rep synced/ })).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toBeHidden();
  // replays (focus/online events) must not duplicate
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(800);
  const comps = await q<{ count: number }>("select count from public.completions where user_id = $1", [id]);
  expect(comps).toEqual([{ count: 1 }]);
  expect(await q("select * from public.completion_ops where user_id = $1", [id])).toHaveLength(1);
});

test("habit CRUD: create weekday habit, edit, archive", async ({ page }) => {
  await signUpAndOnboard(page, { handle: `crud${Date.now() % 100000}` });
  await page.getByTestId("fab").click();
  await page.waitForURL("**/habits/new");
  await page.getByLabel("Name").fill("Guitar");
  await page.getByRole("button", { name: /Craft/ }).click();
  await page.getByRole("tab", { name: "Custom" }).click();
  await page.getByRole("tab", { name: "Pick days" }).click();
  await page.getByTestId("save-habit").click();
  await page.waitForURL("**/today");
  await page.goto("/habits");
  await page.getByText("Guitar").click();
  await page.getByLabel("Name").fill("Guitar practice");
  await page.getByTestId("save-habit").click();
  await page.waitForURL("**/today");
  await page.goto("/habits");
  await expect(page.getByText("Guitar practice")).toBeVisible();
  await page.getByText("Guitar practice").click();
  await page.getByRole("button", { name: "Archive" }).click();
  await page.waitForURL("**/habits");
  await expect(page.getByText("Guitar practice")).toHaveCount(0);
});

test("long journal line never widens Today (iPhone shrink-to-fit bug) + no fake '▲ today' on day 1", async ({ page }) => {
  await signUpAndOnboard(page, { handle: `wide${Date.now() % 100000}` });
  // day 1: there is no previous snapshot, so there must be no movement badge
  await expect(page.getByTestId("ovr-card")).toBeVisible();
  await expect(page.getByTestId("ovr-card")).not.toContainText("today");
  await page.goto("/journal");
  await page.getByRole("radio").nth(4).click();
  await page.getByLabel("Journal line").fill("Today was good I got good workout and short school day and then went to the beach with the boys after");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Saved." })).toBeVisible();
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/today");
    await expect(page.getByText("How'd today go?")).toBeVisible();
    await noHorizontalScroll(page);
    const box = (await page.getByText("How'd today go?").locator("xpath=ancestor::a[1]").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
});
