/**
 * The commit-to-consume commitment, in quantities.
 *
 * Cumulocity is sold commit-to-consume: the customer commits to a **total spend
 * over the term**, not to quantities, and usage is metered daily against it. So
 * the number that decides a deal is not the peak month -- it is what the whole
 * contract adds up to. The Configurator computes it at `E18`, as
 * `Σ periods (Σ line items (billable quantity x unit price)) x months`.
 *
 * This module produces every factor in that expression **except the prices**,
 * which stay in the Configurator (CONCEPT.md §1). The workbook carries the
 * multiplication as a live formula over an empty price column, so a commitment
 * appears the moment a salesperson types their rates and never before.
 *
 * One thing worth knowing, and the reason this is a module rather than a SUM:
 * the Configurator quotes a period at **one month's quantity times its length**,
 * and the honest month to quote is the peak. Real consumption is the sum of the
 * actual months, which is lower whenever the fleet ramps or the calendar has a
 * February in it. Both are computed here and the gap is reported -- a commitment
 * sized on peak x months is one the customer will not use up, and unused
 * commitment is forfeited at expiry rather than carried forward.
 */

import type { ScenarioResult, Scenario } from './types.js';
import { storageGiBPerMonthForPeriod } from './storage.js';

/** Messages are sold in blocks of this many per month. */
export const MESSAGE_BILLING_UNIT = 100_000;

export interface Commitment {
  /** Contract length of each period, in months, in period order. */
  months: number[];
  termMonths: number;
  /**
   * Messages the fleet is actually expected to send across the term -- every
   * month at its own volume, on the real calendar.
   */
  termMessages: number;
  /** The same, in whole billing units, counted month by month. */
  termUnitsActual: number;
  /**
   * And as the Configurator quotes it: each period's peak month in billing
   * units, times that period's length. Never below `termUnitsActual`.
   */
  termUnitsQuoted: number;
  /**
   * The share of the quoted commitment the fleet is not expected to consume,
   * 0-1. Worth arguing about before signature: unused commitment is forfeited.
   */
  headroom: number;
  /** Billing units per month at each period's peak, in period order. */
  unitsPerMonth: number[];
}

export function billingUnits(messages: number): number {
  return Math.ceil(messages / MESSAGE_BILLING_UNIT);
}

/** The quantity side of the commitment. No prices, by construction. */
export function commitmentFor(scenario: Scenario, result: ScenarioResult): Commitment {
  const months = result.periods.map(
    (p) => scenario.periods.find((s) => s.index === p.index)?.months ?? 0,
  );
  const unitsPerMonth = result.periods.map((p) => billingUnits(p.peak.total));

  const termUnitsQuoted = unitsPerMonth.reduce(
    (sum, units, i) => sum + units * (months[i] ?? 0),
    0,
  );
  const termUnitsActual = result.months.reduce((sum, m) => sum + billingUnits(m.total), 0);

  return {
    months,
    termMonths: months.reduce((sum, m) => sum + m, 0),
    termMessages: result.months.reduce((sum, m) => sum + m.total, 0),
    termUnitsActual,
    termUnitsQuoted,
    headroom: termUnitsQuoted > 0 ? 1 - termUnitsActual / termUnitsQuoted : 0,
    unitsPerMonth,
  };
}

/**
 * What one contract period is quoted at -- the two figures the results page
 * leads with, and the two the Configurator multiplies by the period's length.
 *
 * Both are one month, rounded up, on the safe side: messages at the period's
 * peak calendar month in whole 100,000-message units, storage at its fullest
 * month-end in whole GiB. Times the months, neither can come out below what the
 * fleet consumes, which is the direction a commit-to-consume figure has to err
 * in. A storage figure stated on the contract step replaces the estimate, as it
 * does in the hand-off table.
 */
export interface PeriodQuote {
  index: number;
  months: number;
  /** First and last calendar month of the period. */
  start: { year: number; month: number };
  end: { year: number; month: number };
  /** Peak month in whole billing units, and those units as messages. */
  messageUnitsPerMonth: number;
  messagesPerMonth: number;
  messageUnitsOverPeriod: number;
  messagesOverPeriod: number;
  /** Whole GiB, stated or the fullest month's. */
  storageGiBPerMonth: number;
  storageGiBOverPeriod: number;
  storageStated: boolean;
}

export function periodQuotes(scenario: Scenario, result: ScenarioResult): PeriodQuote[] {
  return result.periods.map((p) => {
    const period = scenario.periods.find((s) => s.index === p.index);
    const months = period?.months ?? 0;
    const units = billingUnits(p.peak.total);
    const stated = period?.commercial['ods'];
    const storageStated = typeof stated === 'number' && stated > 0;
    const storage = storageStated ? stated : storageGiBPerMonthForPeriod(result, p.index);
    const first = p.months[0];
    const last = p.months[p.months.length - 1];
    return {
      index: p.index,
      months,
      start: { year: first?.year ?? 0, month: first?.month ?? 0 },
      end: { year: last?.year ?? 0, month: last?.month ?? 0 },
      messageUnitsPerMonth: units,
      messagesPerMonth: units * MESSAGE_BILLING_UNIT,
      messageUnitsOverPeriod: units * months,
      messagesOverPeriod: units * MESSAGE_BILLING_UNIT * months,
      storageGiBPerMonth: storage,
      storageGiBOverPeriod: storage * months,
      storageStated,
    };
  });
}
