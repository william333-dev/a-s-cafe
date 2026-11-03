import { expect, test } from "@playwright/test";
import { noHorizontalScroll, signUpAndOnboard } from "./helpers";


test("manifest + icons are installable", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "OVR", display: "standalone", start_url: "/today" });
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
  const html = await (await request.get("/login")).text();
  expect(html).toContain('name="apple-mobile-web-app-capable"');
  expect(html).toContain('name="mobile-web-app-capable"');
  expect(html).toContain("apple-touch-icon");
});

test("service worker caches the shell; Today opens offline from cache", async ({ page, context }) => {
  await signUpAndOnboard(page, { handle: `pwa${Date.now() % 100000}` });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the SW
  await expect(page.getByTestId("habit-row").first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("habit-row").first()).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  // a never-visited tab still boots offline (its chunks were precached at install)
  await page.goto("/stats");
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("This page couldn’t load");
  // unknown dynamic URLs fall back to the offline page
  await page.goto("/league/nobody-cached");
  await expect(page.locator("body")).toContainText(/offline/i);
  await context.setOffline(false);
});

for (const width of [360, 390, 430]) {
  test(`gallery fits at ${width}px with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dev/gallery");
    await expect(page.getByTestId("ovr-card").first()).toBeVisible();
    await noHorizontalScroll(page);
  });
}

test("reduced motion: no confetti/sheen animation, hold button still works", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/dev/gallery");
  const dur = await page.locator(".animate-sheen").first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(dur)).toBeLessThan(0.01);
  const hold = page.getByTestId("hold-to-lock-in");
  await hold.scrollIntoViewIfNeeded();
  const b = (await hold.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await expect(page.getByTestId("toast").filter({ hasText: "Locked in." })).toBeVisible();
  await ctx.close();
});
