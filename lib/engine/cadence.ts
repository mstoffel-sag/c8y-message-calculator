/**
 * "How often" as a value and a unit -- the same two-part entry the sampling
 * interval uses.
 *
 * A rate and a period are the same fact stated two ways, and a period is the
 * one people can answer: "the door opens every four hours" is a sentence, while
 * "0.1666 per hour" is arithmetic. So the wizard asks for a period everywhere
 * and converts here.
 *
 * The conversions never invent a month length. Units up to a week are exact
 * multiples of a day and map to the day-scaled counter; months and years map to
 * the month-scaled one. Which unit the customer picks therefore chooses the
 * rhythm as well as the number, and that is the point rather than a side
 * effect: an alarm that fires "every 30 days" genuinely does scale with month
 * length, and a firmware campaign that runs "every month" genuinely does not.
 */

import type { Cadence, MetricKind } from './types.js';
import { SECONDS_PER_DAY } from './calendar.js';
import { UNIT_SECONDS, splitDuration, type DurationUnit } from './duration.js';

export type RateUnit = DurationUnit | 'month' | 'year';

export const MONTHS_PER_YEAR = 12;

/** Units that resolve to whole days, so they scale with month length. */
const DAY_SCALED: RateUnit[] = ['ms', 's', 'min', 'h', 'day', 'week'];

export function isDayScaled(unit: RateUnit): boolean {
  return DAY_SCALED.includes(unit);
}

/**
 * Which periods make sense for a kind.
 *
 * States, events and alarms only have a day-scaled counter, so they stop at
 * weeks -- "once a month" is said as "every 30 days", which is what the engine
 * actually computes. Inventory has both rhythms. Commands are offered from days up,
 * because sub-daily commands to every machine in a fleet is not a pattern worth
 * making easy to express.
 */
export function unitsForKind(kind: MetricKind): RateUnit[] {
  switch (kind) {
    case 'state':
    case 'occurrence':
    case 'condition':
      return ['s', 'min', 'h', 'day', 'week'];
    case 'inventory':
      return ['min', 'h', 'day', 'week', 'month', 'year'];
    case 'command':
      return ['day', 'week', 'month', 'year'];
    default:
      return ['s', 'min', 'h', 'day', 'week'];
  }
}

export interface RatePeriod {
  value: number;
  unit: RateUnit;
}

/** Months between occurrences, for the month-scaled units. */
function monthsOf(value: number, unit: RateUnit): number {
  return unit === 'year' ? value * MONTHS_PER_YEAR : value;
}

/** Reads a cadence back as "every N <unit>". */
export function cadenceToPeriod(cadence: Cadence): RatePeriod {
  if (cadence.mode === 'onChange') {
    if (cadence.perDay <= 0) return { value: 1, unit: 'day' };
    return splitDuration(SECONDS_PER_DAY / cadence.perDay);
  }

  if (cadence.mode === 'perMonth') {
    return monthPeriod(cadence.count);
  }

  if (cadence.mode === 'command') {
    if (cadence.perDay !== undefined) {
      if (cadence.perDay <= 0) return { value: 1, unit: 'day' };
      return splitDuration(SECONDS_PER_DAY / cadence.perDay);
    }
    return monthPeriod(cadence.perMonth ?? 1);
  }

  // An interval cadence is already a period.
  return splitDuration(cadence.mode === 'interval' ? cadence.seconds : SECONDS_PER_DAY);
}

function monthPeriod(perMonth: number): RatePeriod {
  if (perMonth <= 0) return { value: 1, unit: 'month' };
  const months = 1 / perMonth;
  if (months >= MONTHS_PER_YEAR && isWhole(months / MONTHS_PER_YEAR)) {
    return { value: round(months / MONTHS_PER_YEAR), unit: 'year' };
  }
  return { value: round(months), unit: 'month' };
}

/**
 * Builds a cadence from "every N <unit>", carrying over anything the old
 * cadence held that the period does not describe -- a command's transition
 * count in particular.
 */
export function periodToCadence(value: number, unit: RateUnit, existing: Cadence): Cadence {
  const safe = value > 0 ? value : 1;

  if (existing.mode === 'command') {
    const transitions = existing.transitions;
    return isDayScaled(unit)
      ? { mode: 'command', transitions, perDay: SECONDS_PER_DAY / (safe * UNIT_SECONDS[unit as DurationUnit]) }
      : { mode: 'command', transitions, perMonth: 1 / monthsOf(safe, unit) };
  }

  if (isDayScaled(unit)) {
    return { mode: 'onChange', perDay: SECONDS_PER_DAY / (safe * UNIT_SECONDS[unit as DurationUnit]) };
  }
  return { mode: 'perMonth', count: 1 / monthsOf(safe, unit) };
}

/** What a cadence works out to per 31-day month, for the hint under the field. */
export function perMonthEquivalent(cadence: Cadence, days = 31): number {
  switch (cadence.mode) {
    case 'onChange':
      return cadence.perDay * days;
    case 'perMonth':
      return cadence.count;
    case 'command':
      return cadence.perDay !== undefined ? cadence.perDay * days : (cadence.perMonth ?? 0);
    case 'interval':
      return (days * SECONDS_PER_DAY) / cadence.seconds;
  }
}

/** Commands issued per machine in a month of the given length. */
export function commandsInMonth(cadence: Cadence, days: number): number {
  if (cadence.mode !== 'command') return 0;
  return cadence.perDay !== undefined ? cadence.perDay * days : (cadence.perMonth ?? 0);
}

function isWhole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

/** "every 2 days", "every 1 month" -- for prose, where the bare unit reads wrong. */
export function formatRatePeriod(cadence: Cadence): string {
  const { value, unit } = cadenceToPeriod(cadence);
  const plural = value !== 1 && (unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year');
  return `every ${value} ${unit}${plural ? 's' : ''}`;
}
