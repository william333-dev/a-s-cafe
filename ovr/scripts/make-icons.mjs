// Renders the OVR logo to PNG icons with the pre-installed Chromium.
// Usage: node scripts/make-icons.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const svg = (size, pad, bg = true) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A1A"/><stop offset="1" stop-color="#FF2D55"/></linearGradient>
  </defs>
  ${bg ? '<rect width="512" height="512" fill="#0B0B0D"/>' : ""}
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M256 36 L452 112 V268 C452 380 368 448 256 484 C144 448 60 380 60 268 V112 Z" fill="url(#g)"/>
    <path d="M256 70 L420 134 V266 C420 360 350 418 256 450 C162 418 92 360 92 266 V134 Z" fill="#0B0B0D" opacity=".18"/>
    <text x="256" y="318" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="700" font-size="190" fill="#0B0B0D" letter-spacing="-4">OVR</text>
  </g>
</svg>`;

const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 70],
  ["apple-touch-icon.png", 180, 24],
  ["badge-72.png", 72, 0, false],
];
mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=block" rel="stylesheet"><div id=x></div>`);
await page.evaluate(() => document.fonts.ready).catch(() => {});
for (const [name, size, pad, bg] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=block" rel="stylesheet"><style>html,body{margin:0;background:transparent}</style></head><body>${svg(size, pad, bg !== false)}</body></html>`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: bg === false });
  console.log("wrote", name);
}
await browser.close();
