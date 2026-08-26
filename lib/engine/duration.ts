/**
 * Durations as a value and a unit.
 *
 * A sampling interval is a quantity with a unit, not one of a fixed set of
 * blessed values, so the wizard asks for it that way: a free number and a unit
 * dropdown. Everything downstream still works in seconds -- this module is only
 * the translation at the edge.
 */

export type DurationUnit = 'ms' | 's' | 'min' | 'h' | 'day' | 'week';

/** Seconds in one of each unit. */
export const UNIT_SECONDS: Record<DurationUnit, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  day: 86_400,
  week: 604_800,
};

/** Coarsest first is wrong for a dropdown; this is the order people read. */
export const DURATION_UNITS: DurationUnit[] = ['ms', 's', 'min', 'h', 'day', 'week'];

export interface SplitDuration {
  value: number;
  unit: DurationUnit;
}

export function toSeconds(value: number, unit: DurationUnit): number {
  return value * UNIT_SECONDS[unit];
}

/**
 * Picks the unit a person would have used.
 *
 * The rule is the largest unit that leaves a whole number: 900 s reads as
 * 15 min, but 90 s stays 90 s rather than becoming 1.5 min. Fractions are a
 * sign the unit is too coarse.
 */
export function splitDuration(seconds: number): SplitDuration {
  if (!Number.isFinite(seconds) || seconds <= 0) return { value: 0, unit: 's' };

  // Anything under a second is milliseconds; there is no coarser unit to try.
  if (seconds < 1) return { value: round(seconds * 1000), unit: 'ms' };

  // Coarsest to finest, taking the first that divides evenly.
  for (const unit of ['week', 'day', 'h', 'min', 's'] as DurationUnit[]) {
    const value = seconds / UNIT_SECONDS[unit];
    if (value >= 1 && isWhole(value)) return { value: round(value), unit };
  }

  // Divides evenly into nothing down to seconds, so drop to milliseconds
  // rather than show a fraction: 1.5 s reads as 1500 ms.
  const ms = seconds * 1000;
  if (isWhole(ms)) return { value: round(ms), unit: 'ms' };

  // Genuinely awkward. A fraction of a second beats a fraction of a minute.
  return { value: round(seconds), unit: 's' };
}

function isWhole(value: number): boolean {
  // Tolerant of the float error that 0.1-second intervals introduce.
  return Math.abs(value - Math.round(value)) < 1e-9;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

/** "every 15 min", for prose. */
export function formatDuration(seconds: number): string {
  const { value, unit } = splitDuration(seconds);
  const plural = (unit === 'day' || unit === 'week') && value !== 1 ? 's' : '';
  return `${value} ${unit}${plural}`;
}
