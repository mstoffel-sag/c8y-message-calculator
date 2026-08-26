/**
 * Calendar-month handling. CONCEPT.md section 2, "A calendar month is not a
 * fixed length".
 *
 * Billing is per calendar month, so the engine uses real month lengths rather
 * than a 30-day or 30.44-day convention. The same fleet doing exactly the same
 * thing spans an 11 % range between February and January; reporting one
 * averaged number would be wrong eleven months out of twelve.
 */

export const SECONDS_PER_DAY = 86_400;

/**
 * The month a per-machine figure is quoted in.
 *
 * Real months are 28 to 31 days, so any statement of the form "n messages per
 * machine per month" has to name a length or it is not a number. 31 is the one
 * used throughout: it is the longest, so a figure quoted against it is the
 * ceiling rather than a figure the customer can be surprised by. Anything
 * billed goes through the real calendar instead -- see expandMonths.
 */
export const REFERENCE_DAYS = 31;

export interface CalendarMonth {
  year: number;
  /** 1-12. */
  month: number;
  days: number;
  periodIndex: number;
  /** Position inside the period, from 1. */
  monthOfPeriod: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function formatMonth(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

export function secondsInMonth(days: number): number {
  return days * SECONDS_PER_DAY;
}

/**
 * Walks the periods in order and yields every calendar month they cover,
 * starting from the given year and month.
 */
export function expandMonths(
  periods: Array<{ index: number; months: number }>,
  startYear: number,
  startMonth: number,
): CalendarMonth[] {
  const out: CalendarMonth[] = [];
  let year = startYear;
  let month = startMonth;

  for (const period of periods) {
    const length = Math.max(1, Math.round(period.months));
    for (let i = 0; i < length; i++) {
      out.push({
        year,
        month,
        days: daysInMonth(year, month),
        periodIndex: period.index,
        monthOfPeriod: i + 1,
      });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return out;
}
