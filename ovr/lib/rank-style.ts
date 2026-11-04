import type { RankKey } from "./rating-engine";

export const RANK_GRADIENT: Record<RankKey, [string, string]> = {
  rookie: ["#8E8E96", "#4A4A52"],
  bronze: ["#B87333", "#7A4A1F"],
  silver: ["#D9DDE3", "#8A9099"],
  gold: ["#FFD66B", "#C99A2E"],
  platinum: ["#B8F3FF", "#5FA8B8"],
  diamond: ["#C9B8FF", "#6E5BD6"],
  apex: ["#FF6A1A", "#FF2D55"],
};

/** Text colour that reads on top of the tier frame. */
export const RANK_INK: Record<RankKey, string> = {
  rookie: "#F5F5F7",
  bronze: "#FFF1E3",
  silver: "#16161A",
  gold: "#2A1E00",
  platinum: "#06262D",
  diamond: "#140B3A",
  apex: "#FFFFFF",
};

export const TOKENS = {
  bg: "#0B0B0D",
  surface: "#141418",
  raised: "#1C1C22",
  stroke: "#2A2A33",
  fg: "#F5F5F7",
  muted: "#A1A1AA",
  ember: "#FF6A1A",
  ice: "#5AC8FA",
  success: "#2FD27A",
  danger: "#FF4D4D",
};

export function avatarColors(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  return [`hsl(${a} 70% 55%)`, `hsl(${(a + 50) % 360} 70% 35%)`];
}
