"use client";
// Share cards: 1080×1920 PNGs (Instagram story / group chat), drawn on a canvas
// on-device — works offline and costs nothing server-side.

import { ATTRIBUTES, rankFor } from "../rating-engine";
import { ATTRIBUTE_META } from "../copy";
import { RANK_GRADIENT, RANK_INK, TOKENS } from "../rank-style";

export const SHARE_W = 1080;
export const SHARE_H = 1920;

export type CardData = {
  displayName: string;
  handle: string;
  overall: number;
  level: number;
  attrs: Partial<Record<(typeof ATTRIBUTES)[number], number | null>>;
};

const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = 'Inter, system-ui, sans-serif';

async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`700 100px ${DISPLAY}`), document.fonts.load(`600 40px ${SANS}`)]);
  } catch {
    /* fall back to system fonts */
  }
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = SHARE_W;
  c.height = SHARE_H;
  return [c, c.getContext("2d")!];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function background(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.fillStyle = TOKENS.bg;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const g = ctx.createRadialGradient(SHARE_W / 2, 700, 50, SHARE_W / 2, 700, 1100);
  g.addColorStop(0, `${accent}55`);
  g.addColorStop(1, "#0B0B0D00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
}

function footer(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = TOKENS.muted;
  ctx.font = `600 40px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("OVR · self-improvement, ranked", SHARE_W / 2, SHARE_H - 120);
}

export async function renderOvrCard(d: CardData): Promise<HTMLCanvasElement> {
  await fontsReady();
  const [c, ctx] = canvas();
  const rank = rankFor(d.overall);
  const [g1, g2] = RANK_GRADIENT[rank.key];
  background(ctx, g1);

  // card frame
  const x = 140, y = 260, w = 800, h = 1180;
  const frame = ctx.createLinearGradient(x, y, x + w, y + h);
  frame.addColorStop(0, g1);
  frame.addColorStop(1, g2);
  ctx.save();
  ctx.shadowColor = `${g1}88`;
  ctx.shadowBlur = 80;
  roundRect(ctx, x, y, w, h, 56);
  ctx.fillStyle = frame;
  ctx.fill();
  ctx.restore();
  // sheen
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h * 0.6);
  sheen.addColorStop(0, "#FFFFFF40");
  sheen.addColorStop(0.45, "#FFFFFF00");
  roundRect(ctx, x, y, w, h, 56);
  ctx.fillStyle = sheen;
  ctx.fill();

  const ink = RANK_INK[rank.key];
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = `700 300px ${DISPLAY}`;
  ctx.fillText(String(d.overall), x + 70, y + 330);
  ctx.font = `700 76px ${DISPLAY}`;
  ctx.fillText(rank.label.toUpperCase(), x + 80, y + 420);
  ctx.textAlign = "right";
  ctx.font = `700 64px ${DISPLAY}`;
  ctx.fillText(`LV ${d.level}`, x + w - 70, y + 120);

  ctx.textAlign = "center";
  ctx.font = `700 92px ${DISPLAY}`;
  ctx.fillText(d.displayName.toUpperCase().slice(0, 16), x + w / 2, y + 600);
  ctx.globalAlpha = 0.75;
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(`@${d.handle}`, x + w / 2, y + 660);
  ctx.globalAlpha = 1;

  // divider
  ctx.fillStyle = `${ink}55`;
  ctx.fillRect(x + 80, y + 710, w - 160, 4);

  // six attributes, 2 columns
  ATTRIBUTES.forEach((a, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = x + 120 + col * 340, cy = y + 830 + row * 120;
    const v = d.attrs[a];
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.font = `700 88px ${DISPLAY}`;
    ctx.fillText(v == null ? "--" : String(v), cx, cy);
    ctx.globalAlpha = 0.8;
    ctx.font = `700 52px ${DISPLAY}`;
    ctx.fillText(ATTRIBUTE_META[a].short, cx + 130, cy);
    ctx.globalAlpha = 1;
  });

  footer(ctx);
  return c;
}

export async function renderChartCard(d: { displayName: string; points: { d: string; o: number }[] }): Promise<HTMLCanvasElement> {
  await fontsReady();
  const [c, ctx] = canvas();
  const pts = d.points.slice(-30);
  const last = pts[pts.length - 1]?.o ?? 50;
  const first = pts[0]?.o ?? last;
  const rank = rankFor(last);
  background(ctx, RANK_GRADIENT[rank.key][0]);

  ctx.textAlign = "left";
  ctx.fillStyle = TOKENS.fg;
  ctx.font = `700 96px ${DISPLAY}`;
  ctx.fillText(`${d.displayName.toUpperCase().slice(0, 14)} · 30 DAYS`, 90, 300);
  ctx.font = `700 260px ${DISPLAY}`;
  ctx.fillText(String(last), 90, 560);
  const delta = last - first;
  ctx.fillStyle = delta >= 0 ? TOKENS.ice : TOKENS.muted;
  ctx.font = `700 110px ${DISPLAY}`;
  ctx.fillText(`${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}`, 420, 540);

  // chart
  const cx = 90, cy = 700, cw = 900, ch = 800;
  const lo = Math.max(40, Math.min(...pts.map((p) => p.o)) - 3);
  const hi = Math.min(99, Math.max(...pts.map((p) => p.o)) + 3);
  ctx.strokeStyle = TOKENS.stroke;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const yy = cy + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(cx, yy);
    ctx.lineTo(cx + cw, yy);
    ctx.stroke();
  }
  if (pts.length > 1) {
    const X = (i: number) => cx + (cw * i) / (pts.length - 1);
    const Y = (o: number) => cy + ch - ((o - lo) / Math.max(1, hi - lo)) * ch;
    const fill = ctx.createLinearGradient(0, cy, 0, cy + ch);
    fill.addColorStop(0, `${TOKENS.ember}66`);
    fill.addColorStop(1, `${TOKENS.ember}00`);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.o)) : ctx.moveTo(X(i), Y(p.o))));
    ctx.lineTo(X(pts.length - 1), cy + ch);
    ctx.lineTo(X(0), cy + ch);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.o)) : ctx.moveTo(X(i), Y(p.o))));
    ctx.strokeStyle = TOKENS.ember;
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.fillStyle = TOKENS.muted;
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(rank.label, cx, cy + ch + 90);
  footer(ctx);
  return c;
}

export function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

/** Native share sheet where supported (iOS/Android), otherwise download. */
export async function shareOrDownload(blob: Blob, name: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch {
      /* cancelled → fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
