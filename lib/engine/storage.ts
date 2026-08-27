/**
 * Operational storage, derived from the values stored.
 *
 * The source is StorageCalculation.txt: **100-400 bytes per datapoint** in
 * MongoDB, marked "needs to be verified" -- 100 B from independent tests on Edge
 * and a rule of thumb, 400 B from a proof of concept -- and a **DataHub extract
 * at 20-25 %** of the MongoDB size, also to be verified.
 *
 * So the answer is a range, and it is reported as one. A 4x spread is what the
 * evidence supports; averaging two unverified figures into a single number would
 * turn a rule of thumb into something that looks like a measurement, and that is
 * how a volume estimate quietly becomes a commitment nobody can defend. The
 * Configurator's ODS line stays a human decision (§7). This hands the human the
 * range, the assumptions and the arithmetic.
 *
 * Two things the source does not say, and this module therefore has to be asked:
 *
 * 1. **Retention.** The platform bills the daily *maximum* stored, so the
 *    quantity is not what a month writes -- it is what is still inside the
 *    retention window on the fullest day of that month. A tenant keeping 30 days
 *    holds a thirtieth of what one keeping 900 days holds, from identical
 *    traffic. It is an input, not a constant, because it is a tenant setting.
 *
 * 2. **The ramp.** A fleet still filling up has less history than its retention
 *    window allows, so the window is walked back day by day through the months
 *    the ramp actually produced. In period 1 that is the difference between a
 *    truthful figure and one that assumes a full window from day one.
 *
 * What this deliberately does not model: events, alarms, inventory and
 * operations. They are stored too, but the source measured datapoints, and in
 * every fleet this tool has modelled the measurements outnumber everything else
 * by three orders of magnitude. `nonMeasurementShare` reports that ratio so the
 * assumption can be checked rather than trusted.
 */

import type { MonthResult, StorageMonth } from './types.js';

/** Bytes per stored value, low end: independent tests on Edge, and a rule of thumb. */
export const BYTES_PER_VALUE_LOW = 100;
/** Bytes per stored value, high end: measured in a proof of concept. */
export const BYTES_PER_VALUE_HIGH = 400;

/** A DataHub extract is this share of the same data in MongoDB. */
export const DATAHUB_SHARE_LOW = 0.2;
export const DATAHUB_SHARE_HIGH = 0.25;

/**
 * Days of data kept, when a scenario does not say.
 *
 * Not "the platform default" -- retention is a tenant setting and the tool has
 * no way to read it. 30 days is a starting point to be replaced by the real
 * retention rule.
 */
export const DEFAULT_RETENTION_DAYS = 30;

export const BYTES_PER_GIB = 1024 ** 3;

/** Every figure here is unverified; the UI and the workbook must say so. */
export const STORAGE_SOURCE_NOTE =
  '100-400 bytes per stored value in MongoDB, and a DataHub extract at 20-25 % of it. Both are ' +
  'rules of thumb from tests on Edge and one proof of concept, both marked "to be verified" at ' +
  'source. The spread is the evidence, not a rounding: treat the range as the answer.';


function gib(values: number, bytesPerValue: number): number {
  return (values * bytesPerValue) / BYTES_PER_GIB;
}

/**
 * One entry per month, with the retention window walked backwards through the
 * months already computed.
 *
 * A month's values are spread evenly across its days: the engine has no daily
 * resolution, and inventing a within-month shape would be inventing precision.
 */
export function storageByMonth(
  months: MonthResult[],
  retentionDays = DEFAULT_RETENTION_DAYS,
  bytesPerValue = BYTES_PER_VALUE_HIGH,
): StorageMonth[] {
  const span = Math.max(retentionDays, 0);
  // Outside the measured range is allowed -- somebody may have verified it -- but
  // a nonsensical figure is not.
  const perValue = bytesPerValue > 0 ? bytesPerValue : BYTES_PER_VALUE_HIGH;

  return months.map((month, i) => {
    let remaining = span;
    let retained = 0;
    for (let j = i; j >= 0 && remaining > 0; j -= 1) {
      const back = months[j]!;
      if (back.days <= 0) continue;
      const days = Math.min(remaining, back.days);
      retained += (back.storedValues / back.days) * days;
      remaining -= days;
    }

    const measurements = month.counters.measurementsCreated;
    const documents = month.total;

    return {
      year: month.year,
      month: month.month,
      periodIndex: month.periodIndex,
      written: month.storedValues,
      retained,
      retentionDays: span,
      daysCovered: span - remaining,
      lowGiB: gib(retained, BYTES_PER_VALUE_LOW),
      highGiB: gib(retained, BYTES_PER_VALUE_HIGH),
      quotedGiB: gib(retained, perValue),
      bytesPerValue: perValue,
      dataHubLowGiB: gib(retained, BYTES_PER_VALUE_LOW) * DATAHUB_SHARE_LOW,
      dataHubHighGiB: gib(retained, BYTES_PER_VALUE_HIGH) * DATAHUB_SHARE_HIGH,
      valuesPerMeasurement: measurements > 0 ? month.storedValues / measurements : 0,
      nonMeasurementShare: documents > 0 ? (documents - measurements) / documents : 0,
    };
  });
}

/**
 * The month holding the most -- the one whose daily maximum a quote is sized
 * against. Not necessarily the peak *message* month: storage is cumulative, so
 * it keeps climbing while the fleet grows even through a quiet month.
 */
export function peakStorageMonth(storage: StorageMonth[]): StorageMonth | undefined {
  return storage.reduce<StorageMonth | undefined>(
    (best, m) => (!best || m.retained > best.retained ? m : best),
    undefined,
  );
}

/**
 * The fullest month inside one contract period.
 *
 * The Configurator asks for a quantity per period, and storage does not
 * necessarily peak in the same month as the message count: it is still filling
 * up after the traffic has levelled off.
 */
export function peakStorageForPeriod(
  storage: StorageMonth[],
  periodIndex: number,
): StorageMonth | undefined {
  return peakStorageMonth(storage.filter((m) => m.periodIndex === periodIndex));
}

/** The GiB a period is quoted at: its fullest month, at the assumed bytes. */
export function storageGiBForPeriod(result: { storage: StorageMonth[] }, periodIndex: number): number {
  return peakStorageForPeriod(result.storage, periodIndex)?.quotedGiB ?? 0;
}

