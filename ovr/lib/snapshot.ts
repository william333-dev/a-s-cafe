import type { Snapshot } from "./types";

export const attrsOf = (s: Partial<Snapshot> | null | undefined) =>
  s ? { body: s.body, mind: s.mind, focus: s.focus, discipline: s.discipline, social: s.social, craft: s.craft } : {};
