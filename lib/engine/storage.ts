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
 * What this counts: everything stored, and it says which half is which.
 * Measurements alone used to be the whole model, on the grounds that they
 * outnumber everything else by three orders of magnitude. Per-type retention
 * destroys that argument -- the ratio held only while everything was kept for
 * the same time -- so event, alarm and operation documents are counted on their
 * own windows, registered devices are counted permanently, and `retainedOther`
 * reports how much of the total they are.
 */

import type {
  DocumentBucket,
  MonthResult,
  PeriodStorage,
  RetentionBucket,
  StorageKind,
  StorageMonth,
} from './types.js';

/**
 * Bytes per stored **document**, by kind.
 *
 * Measured 2026-09-28 against the billing warehouse behind the "Monthly Usage
 * per Customer" dashboard: 39,889 tenant-months, 7,472 tenants, six month-end
 * snapshots. Storage there is a stock under a retention window and document
 * counts are a monthly flow, and the warehouse holds no retention column -- so
 * the estimator is the change in storage between consecutive snapshots divided
 * by the documents written that month, over tenant-months where storage grew.
 * That cancels retention.
 *
 * Outliers rejected at p1/p99 of the ratio. IQR fences looked tidier and were
 * wrong: they dropped a tenth of the rows carrying three fifths of the volume
 * and moved the answer from 125 to 56 B, which is deleting the signal. p1-p99
 * moves the coefficients by under 1 % against no rejection at all, and that
 * agreement is the reason to believe them.
 *
 * Least squares through the origin, stable to three significant figures across
 * subsets of 3,373 / 3,307 / 1,688 tenant-months:
 *
 *     measurement   22.9 B        event   1,737 B        alarm   2,669 B
 *
 * The old model was 100-400 bytes per stored *value*, from a proof of concept
 * and a rule of thumb, both marked "to be verified". Two things were wrong with
 * it beyond the number. It charged per value, so a fleet bundling ten series
 * into one measurement paid ten times for one document -- the tool's whole
 * argument about bundling, absent from its own storage figure. And it charged
 * an alarm the same as a measurement, where the measurement says an alarm is
 * about a hundred times heavier.
 */
export const BYTES_PER_DOCUMENT: Record<StorageKind, number> = {
  measurement: 95,
  event: 1_700,
  alarm: 2_700,
  // No measurement of its own: operations are absent from the billing
  // warehouse entirely. Priced as an alarm, which is the nearest thing to it --
  // a document with a lifecycle and a status history.
  operation: 2_700,
};

/**
 * How far either end of the range sits from the central figure.
 *
 * The per-tenant scatter is enormous -- predicting one tenant's storage growth
 * from its document counts is out by 89 % at the median -- so this supports a
 * range and never a point, which is what it always did. The multipliers are the
 * quartiles of the measurement-dominated population (p25 26 B, p50 95 B,
 * p75 244 B, n = 2,391) expressed as a ratio, and the same spread is borrowed
 * for events and alarms because their own quartiles have not been measured.
 */
export const STORAGE_KINDS: StorageKind[] = ['measurement', 'event', 'alarm', 'operation'];

export const SPREAD_LOW = 0.27;
export const SPREAD_HIGH = 2.6;

export function bytesFor(kind: StorageKind, end: 'low' | 'mid' | 'high'): number {
  const mid = BYTES_PER_DOCUMENT[kind];
  return end === 'mid' ? mid : mid * (end === 'low' ? SPREAD_LOW : SPREAD_HIGH);
}

/**
 * The old per-value constants, kept because `ScenarioSettings.bytesPerValue`
 * is part of every saved scenario and the workbook still names a figure.
 * Nothing in the estimate multiplies by them any more.
 */
export const BYTES_PER_VALUE_LOW = 100;
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
 * The windows in play across one stream, and the units in each per month.
 *
 * Called twice -- once for measurement values, once for documents -- because
 * the two rest on different evidence and the estimate has to be able to say how
 * much of itself is which. A type added in period 2 has no bucket in period 1,
 * and a window nobody uses any more still has to be walked through the months
 * that wrote into it, so the set of windows is collected across every month
 * rather than read off the first one.
 *
 * `orElse` covers a month carrying no buckets at all: it is read as one bucket
 * at `fallback`. Not a live code path for the engine's own output -- it always
 * fills them in -- but it keeps a hand-built month series computable, which
 * several tests and any future caller depend on.
 *
 * That stand-in only applies when there is something in it. A stream that wrote
 * nothing must register no window at all: an empty document list read as "the
 * default, holding zero" put 30 days into the reported span of a tenant that
 * keeps everything for 45, which is a wrong answer to the one question the
 * span exists to answer.
 */
function windowsOf(
  months: MonthResult[],
  fallback: number,
  bucketsOf: (month: MonthResult) => RetentionBucket[] | undefined,
  orElse: (month: MonthResult) => number,
): {
  windows: number[];
  valuesIn: (monthIndex: number, retentionDays: number) => number;
} {
  const windows = new Set<number>();
  const perMonth = months.map((month) => {
    const given = bucketsOf(month);
    const standIn = orElse(month);
    const buckets = given?.length
      ? given
      : standIn > 0
        ? [{ retentionDays: fallback, values: standIn }]
        : [];
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
 * A month's units are spread evenly across its days: the engine has no daily
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

/** Every window across both streams, so the reported span covers the tenant. */
function spanOf(...sets: number[][]): { longest: number; shortest: number } | undefined {
  const all = sets.flat();
  return all.length > 0
    ? { longest: Math.max(...all), shortest: Math.min(...all) }
    : undefined;
}

/**
 * One entry per month: what the database holds when that month closes, with
 * every retention window walked backwards through the months already computed.
 *
 * Three things are added up, and they age differently:
 *
 * - **measurement values**, per their measurement type's window;
 * - **event, alarm and operation documents**, per their type's window;
 * - **managed objects**, which no retention rule removes, so every one ever
 *   registered is still there.
 *
 * The byte figure behind the GiB columns was measured on datapoints, so
 * applying it to a document is the weaker half of the estimate. It is applied
 * anyway, and `retainedOther` reports how much of the total rests on it --
 * because the alternative, counting measurements alone, understates the bill,
 * and on a commit-to-consume contract understating is the expensive direction.
 * Retention is also exactly what decides whether the simplification holds: a
 * tenant keeping measurements for a week and alarms for five years is one no
 * fleet-wide document ratio would have predicted.
 *
 * @param defaultRetentionDays the tenant default, for types with no rule of
 *   their own. Individual windows arrive on the months themselves.
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
  // `settings.bytesPerValue` was the one figure this model had, so an override
  // is read as what it was always about: the size of a measurement. The other
  // kinds are measured separately and are not scaled by a guess about this one.
  const measurementBytes = (end: 'low' | 'mid' | 'high') =>
    bytesPerValue > 0 && bytesPerValue !== BYTES_PER_VALUE_HIGH
      ? bytesPerValue * (end === 'mid' ? 1 : end === 'low' ? SPREAD_LOW : SPREAD_HIGH)
      : bytesFor('measurement', end);

  const series = windowsOf(months, fallback, (m) => m.storedByRetention, (m) => m.storedValues);
  // No stand-in for documents: a month with no document buckets wrote none, and
  // there is no single total to fall back to that would not double-count the
  // measurement stream.
  // `retainedOther` is the display figure for everything that is not a
  // measurement, so it has to skip the measurement buckets that now live in the
  // same list -- otherwise every measurement is counted twice, once as a value
  // and once as a document.
  const docs = windowsOf(
    months,
    fallback,
    (m) => m.documentsByRetention?.filter((b) => b.kind !== 'measurement'),
    () => 0,
  );
  // And once per kind, because that is what the bytes depend on. Same walk, one
  // stream each, so a tenant keeping alarms for five years and measurements for
  // a week is priced on both windows rather than on an average of them.
  const byKind = new Map(
    STORAGE_KINDS.map((kind) => [
      kind,
      windowsOf(months, fallback, (m) => m.documentsByRetention?.filter((b) => b.kind === kind), () => 0),
    ]),
  );

  // The longest window decides how long storage keeps climbing, and the pair is
  // what the UI reports when a tenant keeps its types for different times.
  const span = spanOf(series.windows, docs.windows) ?? { longest: fallback, shortest: fallback };

  // Managed objects accumulate: month i holds every one registered up to it.
  let permanent = 0;
  const permanentBy = months.map((month) => (permanent += month.permanentDocuments ?? 0));

  return months.map((month, i) => {
    let retainedMeasurements = 0;
    for (const window of series.windows) {
      retainedMeasurements += walkBack(months, i, window, series.valuesIn).retained;
    }
    let retainedOther = permanentBy[i]!;
    for (const window of docs.windows) {
      retainedOther += walkBack(months, i, window, docs.valuesIn).retained;
    }
    const retained = retainedMeasurements + retainedOther;

    /** What is on disk at the end of this month, in bytes, at one end of the range. */
    const bytesAt = (end: 'low' | 'mid' | 'high') => {
      let bytes = 0;
      for (const kind of STORAGE_KINDS) {
        const stream = byKind.get(kind)!;
        const perDoc = kind === 'measurement' ? measurementBytes(end) : bytesFor(kind, end);
        for (const window of stream.windows) {
          bytes += walkBack(months, i, window, stream.valuesIn).retained * perDoc;
        }
      }
      // Registered devices never age out and have no measurement of their own.
      // Priced as a generic document, which is what a managed object is.
      return bytes + permanentBy[i]! * bytesFor('event', end);
    };
    const quotedBytes = bytesAt('mid');

    const measurements = month.counters.measurementsCreated;

    return {
      year: month.year,
      month: month.month,
      periodIndex: month.periodIndex,
      written: month.storedValues,
      writtenOther:
        (month.documentsByRetention
          ?.filter((b) => b.kind !== 'measurement')
          .reduce((sum, b) => sum + b.values, 0) ?? 0) + (month.permanentDocuments ?? 0),
      retained,
      retainedMeasurements,
      retainedOther,
      retentionDays: span.longest,
      retentionDaysShortest: span.shortest,
      daysCovered: walkBack(months, i, span.longest, series.valuesIn).daysCovered,
      lowGiB: bytesAt('low') / BYTES_PER_GIB,
      highGiB: bytesAt('high') / BYTES_PER_GIB,
      quotedGiB: quotedBytes / BYTES_PER_GIB,
      // What the platform actually bills for this month: whole GiB, rounded up.
      // A fleet holding 150 MiB is billed one unit, not 0.15, and twelve months
      // of it is twelve units rather than 1.8 (CTC Metrics Dashboard).
      unitsGiB: Math.ceil(quotedBytes / BYTES_PER_GIB),
      bytesPerValue: perValue,
      dataHubLowGiB: (bytesAt('low') / BYTES_PER_GIB) * DATAHUB_SHARE_LOW,
      dataHubHighGiB: (bytesAt('high') / BYTES_PER_GIB) * DATAHUB_SHARE_HIGH,
      valuesPerMeasurement: measurements > 0 ? month.storedValues / measurements : 0,
    };
  });
}

/**
 * How much bigger a month has to be to count as fuller: one part in ten
 * thousand.
 *
 * Without a tolerance this reads as a strict maximum, and a strict maximum on a
 * flat fleet is decided by noise. A monthly command campaign does not scale
 * with month length, so February packs the same commands into 28 days and a
 * 30-day window ending there catches marginally more of them -- which named
 * February the fullest month of a fleet that had not grown since January, by 97
 * documents out of 174 million. The figure was true and the label was useless.
 */
const FULLER_BY = 1.0001;

/**
 * The month holding the most at its close, and the earliest of those when
 * several are level.
 *
 * "Fullest" is a label a reader uses to ask when the fleet stopped filling up,
 * so on a plateau the answer they want is the month it reached, not the last
 * one that tied. Not necessarily the peak *message* month either: storage is
 * cumulative, so it keeps climbing while the fleet grows even through a quiet
 * month.
 *
 * This ranks for display only -- the quantity is `PeriodStorage.giBMonths`, a
 * sum over every month -- so a tolerance here cannot move a quoted figure.
 */
export function peakStorageMonth(storage: StorageMonth[]): StorageMonth | undefined {
  return storage.reduce<StorageMonth | undefined>(
    (best, m) => (!best || m.retained > best.retained * FULLER_BY ? m : best),
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
    unitMonths: sum((m) => m.unitsGiB),
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
 * The quantity a period's Operational Data Store line is filled in with: whole
 * GiB units, one month at a time, added up over the period.
 *
 * Named for what it is rather than "GiB", because it is not a GiB figure and a
 * reader who treats it as one will wonder why a year reads twelve times too
 * high.
 *
 * It rounds each month up before adding, because that is what is billed. The
 * unrounded sum is still there as `giBMonths` and is the honest answer to "how
 * much is on disk"; it is not the answer to "what goes in D37", and for a small
 * fleet the two differ by most of the figure.
 */
export function storageGiBMonthsForPeriod(
  result: { storageByPeriod: PeriodStorage[] },
  periodIndex: number,
): number {
  return result.storageByPeriod.find((p) => p.periodIndex === periodIndex)?.unitMonths ?? 0;
}
