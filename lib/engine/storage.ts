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
 * Three things the source does not say, and this module therefore has to be
 * asked:
 *
 * 1. **What is measured, and when.** Storage is billed on what the database
 *    holds when a calendar month closes; that snapshot is taken every month and
 *    the month-end figures are added up over the contract period. So the
 *    quantity is a sum in GiB-months, not the fullest month and not the last
 *    one: a period that ends full has paid for every month it took to fill up.
 *    `storagePerPeriod` does that addition and is the only thing a quote should
 *    read.
 *
 * 2. **Retention, per measurement type.** What survives to the end of the month
 *    is what is still inside its retention window, and a retention rule in
 *    Cumulocity is attached to a measurement type -- a tenant keeping
 *    `acme_Climate` for 90 days and `acme_Vibration` for 7 is the ordinary
 *    case. So the engine hands this module one bucket of values per window and
 *    each bucket is walked back through its own, rather than a single total
 *    through a single scenario-wide number. The scenario setting survives as
 *    the tenant's default, for every type that has no rule of its own.
 *
 * 3. **The ramp.** A fleet still filling up has less history than its retention
 *    window allows, so each window is walked back day by day through the months
 *    the ramp actually produced. In period 1 that is the difference between a
 *    truthful figure and one that assumes a full window from day one.
 *
 * What this deliberately does not model: events, alarms, inventory and
 * operations. They are stored too, but the source measured datapoints, and in
 * every fleet this tool has modelled the measurements outnumber everything else
 * by three orders of magnitude. `nonMeasurementShare` reports that ratio so the
 * assumption can be checked rather than trusted.
 */

import type { MonthResult, PeriodStorage, StorageMonth } from './types.js';

/** Bytes per stored value, low end: independent tests on Edge, and a rule of thumb. */
export const BYTES_PER_VALUE_LOW = 100;
/** Bytes per stored value, high end: measured in a proof of concept. */
export const BYTES_PER_VALUE_HIGH = 400;

/** A DataHub extract is this share of the same data in MongoDB. */
export const DATAHUB_SHARE_LOW = 0.2;
export const DATAHUB_SHARE_HIGH = 0.25;

/**
 * Days of data kept, when neither the measurement type nor the scenario says.
 *
 * Not "the platform default" -- retention is a tenant setting and the tool has
 * no way to read it. 30 days is a starting point to be replaced by the real
 * retention rules.
 */
export const DEFAULT_RETENTION_DAYS = 30;

export const BYTES_PER_GIB = 1024 ** 3;



function gib(values: number, bytesPerValue: number): number {
  return (values * bytesPerValue) / BYTES_PER_GIB;
}

/**
 * The windows in play across the whole run, and the values in each per month.
 *
 * A measurement type added in period 2 has no bucket in period 1, and a window
 * nobody uses any more still has to be walked through the months that wrote
 * into it -- so the set of windows is collected across every month rather than
 * read off the first one.
 *
 * A month carrying no buckets at all is read as one bucket at `fallback`. That
 * is not a live code path -- the engine always fills them in -- but it keeps a
 * hand-built month series computable, which several tests and any future
 * caller depend on.
 */
function windowsOf(months: MonthResult[], fallback: number): {
  windows: number[];
  valuesIn: (monthIndex: number, retentionDays: number) => number;
} {
  const windows = new Set<number>();
  const perMonth = months.map((month) => {
    const buckets = month.storedByRetention?.length
      ? month.storedByRetention
      : [{ retentionDays: fallback, values: month.storedValues }];
    const map = new Map<number, number>();
    for (const bucket of buckets) {
      const days = Math.max(bucket.retentionDays, 0);
      windows.add(days);
      map.set(days, (map.get(days) ?? 0) + bucket.values);
    }
    return map;
  });

  return {
    windows: [...windows].sort((a, b) => a - b),
    valuesIn: (monthIndex, retentionDays) => perMonth[monthIndex]?.get(retentionDays) ?? 0,
  };
}

/**
 * How much of one window's writing is still there at the end of month `i`, and
 * how many days of history stand behind it.
 *
 * A month's values are spread evenly across its days: the engine has no daily
 * resolution, and inventing a within-month shape would be inventing precision.
 * So a 30-day window reaching into a 31-day month takes thirty thirty-firsts of
 * what that month wrote.
 */
function walkBack(
  months: MonthResult[],
  i: number,
  retentionDays: number,
  valuesIn: (monthIndex: number, retentionDays: number) => number,
): { retained: number; daysCovered: number } {
  let remaining = Math.max(retentionDays, 0);
  let retained = 0;

  for (let j = i; j >= 0 && remaining > 0; j -= 1) {
    const back = months[j]!;
    if (back.days <= 0) continue;
    const days = Math.min(remaining, back.days);
    retained += (valuesIn(j, retentionDays) / back.days) * days;
    remaining -= days;
  }

  return { retained, daysCovered: Math.max(retentionDays, 0) - remaining };
}

/**
 * One entry per month: what the database holds when that month closes, with
 * every retention window walked backwards through the months already computed.
 *
 * @param defaultRetentionDays the tenant default, for measurement types with no
 *   rule of their own. Individual windows arrive on the months themselves.
 */
export function storageByMonth(
  months: MonthResult[],
  defaultRetentionDays = DEFAULT_RETENTION_DAYS,
  bytesPerValue = BYTES_PER_VALUE_HIGH,
): StorageMonth[] {
  const fallback = Math.max(defaultRetentionDays, 0);
  // Outside the measured range is allowed -- somebody may have verified it -- but
  // a nonsensical figure is not.
  const perValue = bytesPerValue > 0 ? bytesPerValue : BYTES_PER_VALUE_HIGH;
  const { windows, valuesIn } = windowsOf(months, fallback);

  // The longest window decides how long storage keeps climbing, and the pair is
  // what the UI reports when a tenant keeps its types for different times.
  const longest = windows.length > 0 ? windows[windows.length - 1]! : fallback;
  const shortest = windows.length > 0 ? windows[0]! : fallback;

  return months.map((month, i) => {
    let retained = 0;
    for (const window of windows) {
      retained += walkBack(months, i, window, valuesIn).retained;
    }

    const measurements = month.counters.measurementsCreated;
    const documents = month.total;

    return {
      year: month.year,
      month: month.month,
      periodIndex: month.periodIndex,
      written: month.storedValues,
      retained,
      retentionDays: longest,
      retentionDaysShortest: shortest,
      daysCovered: walkBack(months, i, longest, valuesIn).daysCovered,
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
 * The month holding the most at its close. Not necessarily the peak *message*
 * month: storage is cumulative, so it keeps climbing while the fleet grows even
 * through a quiet month.
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
 * Not the quantity -- see `storageForPeriod` for that -- but worth naming: it
 * says when the fleet stopped filling up, which is a different month from the
 * one where the message count levelled off.
 */
export function peakStorageForPeriod(
  storage: StorageMonth[],
  periodIndex: number,
): StorageMonth | undefined {
  return peakStorageMonth(storage.filter((m) => m.periodIndex === periodIndex));
}

/**
 * One period's storage: the month-end snapshots, added up.
 *
 * This is the quantity a quote is built on. The platform captures what the
 * database holds at the end of each calendar month and the period's figure is
 * the sum of those captures -- GiB-months -- so a period is not quoted at its
 * fullest month. Quoting the peak would charge twelve months of a full database
 * for a year that spent most of itself filling one up; quoting the last month
 * would do the reverse and under-state a shrinking fleet.
 *
 * Every column is summed the same way, so the unverified byte range and the
 * DataHub share arrive at the period as ranges too rather than being re-derived
 * from a total that has already lost them.
 */
export function storageForPeriod(
  storage: StorageMonth[],
  periodIndex: number,
): PeriodStorage | undefined {
  const own = storage.filter((m) => m.periodIndex === periodIndex);
  if (own.length === 0) return undefined;

  const sum = (pick: (m: StorageMonth) => number): number =>
    own.reduce((total, m) => total + pick(m), 0);
  const giBMonths = sum((m) => m.quotedGiB);

  return {
    periodIndex,
    monthsCounted: own.length,
    giBMonths,
    lowGiBMonths: sum((m) => m.lowGiB),
    highGiBMonths: sum((m) => m.highGiB),
    dataHubLowGiBMonths: sum((m) => m.dataHubLowGiB),
    dataHubHighGiBMonths: sum((m) => m.dataHubHighGiB),
    averageGiB: giBMonths / own.length,
    peak: peakStorageMonth(own),
  };
}

/** Every period that has months, in period order. */
export function storagePerPeriod(storage: StorageMonth[]): PeriodStorage[] {
  const indices = [...new Set(storage.map((m) => m.periodIndex))].sort((a, b) => a - b);
  return indices
    .map((index) => storageForPeriod(storage, index))
    .filter((entry): entry is PeriodStorage => entry !== undefined);
}

/**
 * The quantity a period's Operational Data Store line is filled in with:
 * GiB-months at the assumed bytes per value.
 *
 * Named for what it is rather than "GiB", because it is not a GiB figure and a
 * reader who treats it as one will wonder why a year reads twelve times too
 * high.
 */
export function storageGiBMonthsForPeriod(
  result: { storageByPeriod: PeriodStorage[] },
  periodIndex: number,
): number {
  return result.storageByPeriod.find((p) => p.periodIndex === periodIndex)?.giBMonths ?? 0;
}
