import { avatarColors } from "@/lib/rank-style";

export function Avatar({ seed, name, size = 40 }: { seed: string; name: string; size?: number }) {
  const [a, b] = avatarColors(seed);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-black text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
