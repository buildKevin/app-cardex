/**
 * Levels are purely cosmetic. The curve is soft at the start so the first
 * scans always produce a level-up, then stretches out.
 */
const BASE = 200;
const EXPONENT = 1.35;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((BASE * (level - 1) ** EXPONENT) / 10) * 10;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  current: number;
  /** XP needed to span the current level. */
  span: number;
  /** 0 → 1 */
  ratio: number;
  xpToNext: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  const current = xp - floor;
  return {
    level,
    current,
    span,
    ratio: Math.min(1, current / span),
    xpToNext: Math.max(0, ceiling - xp),
  };
}
