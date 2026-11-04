import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, signUpAndOnboard } from "./helpers";


test("league board, member card, reactions, share card PNG, quit slip, journal, export", async ({ page }) => {
  const stamp = Date.now() % 100000;
  // a rival who has done more this week (seeded through the real RPC as that user)
  const rivalEmail = await signUpAndOnboard(page, { handle: `sam${stamp}`, name: "Sam" });
  const rivalRows = page.getByTestId("habit-row");
  await expect(rivalRows.first()).toBeVisible();
  for (let i = 0; i < (await rivalRows.count()); i++) {
    await rivalRows.nth(i).click();
    await expect(rivalRows.nth(i)).toHaveAttribute("data-done", "true");
  }
  await expect(page.getByTestId("today-status")).toHaveText("Perfect day. That's how it's done.");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);

  await signUpAndOnboard(page, { handle: `hunter${stamp}`, name: "Hunter", quit: "Vaping" });
  await page.goto("/league");
  const sam = page.locator(`[data-testid=league-row][data-handle=sam${stamp}]`);
  await expect(sam).toBeVisible();
  await expect(page.getByTestId("season")).toBeVisible();
  await expect(page.getByTestId("duo")).toBeVisible();
  await page.getByRole("tab", { name: "All-time OVR" }).click();
  await expect(sam).toBeVisible();

  // member card + reaction
  await sam.click();
  await page.waitForURL(`**/league/sam${stamp}`);
  await expect(page.getByTestId("ovr-card")).toBeVisible();
  await page.getByRole("button", { name: "Fire" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Sent." })).toBeVisible();
  const [{ n }] = await q<{ n: string }>(
    "select count(*) n from public.reactions r join public.profiles p on p.id = r.to_user where p.handle = $1 and r.kind = 'fire'",
    [`sam${stamp}`],
  );
  expect(n).toBe("1");
  expect(rivalEmail).toBeTruthy();

  // share card: 1080×1920 PNG
  await page.goto("/profile");
  const dl = page.waitForEvent("download");
  await page.getByTestId("share-card").click();
  const file = await (await dl).path();
  const png = readFileSync(file!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);

  // quit tracker: slip → no shame, counter reset
  await page.goto("/quit");
  await page.getByText("Vaping").click();
  await expect(page.getByTestId("quit-counter")).toBeVisible();
  await page.getByTestId("slip").click();
  await page.getByRole("button", { name: "Stress" }).click();
  await page.getByLabel("Note to self (private, optional)").fill("work deadline");
  await page.getByTestId("confirm-slip").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Logged. Counter reset, progress kept." })).toBeVisible();
  await expect(page.getByText("Need to talk? Free call or text 1737, any time.").first()).toBeVisible();

  // journal
  await page.goto("/journal");
  await page.getByRole("radio").nth(3).click();
  await page.getByLabel("Journal line").fill("Solid day.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Saved." })).toBeVisible();

  // export
  await page.goto("/settings");
  const ex = page.waitForEvent("download");
  await page.getByTestId("export").click();
  const json = JSON.parse(readFileSync((await (await ex).path())!, "utf8"));
  expect(json.journal_entries[0].body).toBe("Solid day.");
  expect(json.relapses[0].note).toBe("work deadline");
});
