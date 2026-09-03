/**
 * The nine counters. CONCEPT.md section 5, "The arithmetic".
 *
 * Every figure is computed for one real calendar month, because that is the
 * period billing works in. Nothing here converts volume into money: the output
 * is messages per calendar month and that is the whole output (section 2).
 */

import { en } from '../i18n/index.js';
import {
  type Bundle,
  type Counters,
  type Metric,
  type MachineType,
  type MonthResult,
  type Period,
  type PeriodResult,
  type RetentionBucket,
  type Scenario,
  type ScenarioResult,
  addCounters,
  totalOf,
  zeroCounters,
} from './types.js';
import { type CalendarMonth, SECONDS_PER_DAY, expandMonths, secondsInMonth } from './calendar.js';
import { lintScenario } from './lint.js';
import {
  DEFAULT_RETENTION_DAYS,
  peakStorageMonth,
  storageByMonth,
  storagePerPeriod,
} from './storage.js';
import { commandsInMonth } from './cadence.js';

/** A bundle plus the metrics that actually belong to it. */
export interface ResolvedBundle {
  bundle: Bundle;
  members: Metric[];
}

/**
 * Effective bundle membership.
 *
 * `Metric.bundleId` is authoritative -- one source of truth, so a scenario that
 * arrives by JSON import with the two fields out of step still computes
 * predictably. `Bundle.metricIds` supplies display order only.
 */
export function resolveBundles(machineType: MachineType): {
  bundles: ResolvedBundle[];
  /** Continuous metrics that sit in no bundle: each gets its own measurement. */
  loneContinuous: Metric[];
} {
  const byId = new Map(machineType.metrics.map((m) => [m.id, m]));
  const claimed = new Set<string>();

  const bundles = machineType.bundles.map((bundle) => {
    const ordered: Metric[] = [];
    for (const id of bundle.metricIds) {
      const metric = byId.get(id);
      if (metric && metric.bundleId === bundle.id && !claimed.has(id)) {
        ordered.push(metric);
        claimed.add(id);
      }
    }
    // Metrics that point at this bundle but are missing from metricIds.
    for (const metric of machineType.metrics) {
      if (metric.bundleId === bundle.id && !claimed.has(metric.id)) {
        ordered.push(metric);
        claimed.add(metric.id);
      }
    }
    return { bundle, members: ordered };
  });

  const loneContinuous = machineType.metrics.filter(
    (m) => m.kind === 'continuous' && !claimed.has(m.id),
  );

  return { bundles, loneContinuous };
}

/** Machines of this type in this period. */
export function machineCountIn(machineType: MachineType, period: Period | undefined): number {
  if (!period) return machineType.machineCount;
  const override = period.machineCountOverrides[machineType.id];
  return override === undefined || override === null ? machineType.machineCount : override;
}

export interface MachineTypeMonth {
  counters: Counters;
  storedValues: number;
  /** `storedValues`, split by the retention rule governing each measurement type. */
  storedByRetention: RetentionBucket[];
  /** Event, alarm and operation documents, split the same way. */
  documentsByRetention: RetentionBucket[];
  /** Total messages under the naive baseline, for the same information. */
  naiveTotal: number;
  total: number;
}

/**
 * A retention setting, as a number of days the walk-back can use.
 *
 * A measurement type with no rule of its own inherits the tenant's default,
 * which is the scenario setting. Zero is meaningful -- it says nothing is kept
 * -- so only a missing, negative or nonsensical value falls back.
 */
export function retentionFor(own: number | undefined, fallback: number): number {
  return typeof own === 'number' && Number.isFinite(own) && own >= 0 ? own : fallback;
}

/** Accumulates values into the bucket for their window, so equal windows merge. */
function bucketInto(into: Map<number, number>, retentionDays: number, values: number): void {
  into.set(retentionDays, (into.get(retentionDays) ?? 0) + values);
}

/** Shortest window first, so a mixed tenant reads in a stable order. */
function bucketsOf(from: Map<number, number>): RetentionBucket[] {
  return [...from]
    .map(([retentionDays, values]) => ({ retentionDays, values }))
    .sort((a, b) => a.retentionDays - b.retentionDays);
}

/**
 * One machine type, one calendar month.
 *
 * @param machinesOnline machineCount x onlinePct / 100
 */
export function computeMachineTypeMonth(
  machineType: MachineType,
  machinesOnline: number,
  days: number,
  defaultRetentionDays: number = DEFAULT_RETENTION_DAYS,
): MachineTypeMonth {
  const counters = zeroCounters();
  const naive = zeroCounters();
  const spm = secondsInMonth(days);
  const n = machinesOnline;
  let storedValues = 0;
  // Keyed by window rather than by type: two types kept for the same 30 days
  // age out together, so they can be added up here. Measurements and documents
  // stay apart because the byte assumption behind them is not equally strong.
  const retention = new Map<number, number>();
  const documents = new Map<number, number>();

  // --- continuous readings, bundled: one POST carries every series in the
  // --- bundle, so the count is per send, not per series.
  const { bundles, loneContinuous } = resolveBundles(machineType);
  for (const { bundle, members } of bundles) {
    if (members.length === 0) continue;
    const interval = Math.max(bundle.intervalSeconds, 1e-9);
    const sends = (n * spm) / interval;
    counters.measurementsCreated += sends;
    storedValues += sends * members.length;
    // The rule belongs to the measurement type, so every series in the bundle
    // ages out on the bundle's window whatever else it has been given.
    bucketInto(
      retention,
      retentionFor(bundle.retentionDays, defaultRetentionDays),
      sends * members.length,
    );

    // Naive: every series its own measurement at the same cadence.
    naive.measurementsCreated += sends * members.length;
  }

  // --- continuous readings in no bundle: their own measurement either way.
  for (const metric of loneContinuous) {
    if (metric.cadence.mode !== 'interval') continue;
    const sends = (n * spm) / Math.max(metric.cadence.seconds, 1e-9);
    counters.measurementsCreated += sends;
    storedValues += sends;
    bucketInto(retention, retentionFor(metric.retentionDays, defaultRetentionDays), sends);
    naive.measurementsCreated += sends;
  }

  for (const metric of machineType.metrics) {
    const cadence = metric.cadence;
    switch (metric.kind) {
      case 'continuous':
        // Already counted above.
        break;

      case 'occurrence': {
        if (cadence.mode !== 'onChange') break;
        const sends = n * cadence.perDay * days;
        counters.eventsCreated += sends;
        // One document per event, aged by the event type's own rule.
        bucketInto(documents, retentionFor(metric.retentionDays, defaultRetentionDays), sends);
        naive.eventsCreated += sends;
        break;
      }

      case 'condition': {
        // An alarm is a state with a lifecycle: the raise creates, the clear
        // updates, and both bill.
        if (cadence.mode !== 'onChange') break;
        const raises = n * cadence.perDay * days;
        counters.alarmsCreated += raises;
        counters.alarmsUpdated += raises;
        // The raise creates the document and the clear updates it, so the pair
        // is two messages and one stored alarm.
        bucketInto(documents, retentionFor(metric.retentionDays, defaultRetentionDays), raises);
        naive.alarmsCreated += raises;
        naive.alarmsUpdated += raises;
        break;
      }

      case 'inventory': {
        // An inventory write may be quoted per month (a firmware version) or per day (a
        // config block re-sent nightly). A daily rate scales with month length;
        // a monthly count does not.
        const writes =
          cadence.mode === 'perMonth'
            ? n * cadence.count
            : cadence.mode === 'onChange'
              ? n * cadence.perDay * days
              : 0;
        counters.inventoriesUpdated += writes;
        // Nothing to store and nothing to age out: a PUT overwrites the managed
        // object in place. The object itself was created at registration and is
        // not retention-governed, so it is counted once, in computeMonth.
        naive.inventoriesUpdated += writes;
        break;
      }

      case 'command': {
        // One create plus one update per status transition, so a single
        // command is realistically 3-4 messages. A monthly campaign does not
        // scale with month length; a command sent most working days does.
        if (cadence.mode !== 'command') break;
        const commands = n * commandsInMonth(cadence, days);
        counters.operationsCreated += commands;
        counters.operationsUpdated += commands * cadence.transitions;
        // One document per command; the transitions update it as it runs.
        bucketInto(documents, retentionFor(metric.retentionDays, defaultRetentionDays), commands);
        naive.operationsCreated += commands;
        naive.operationsUpdated += commands * cadence.transitions;
        break;
      }
    }
  }

  return {
    counters,
    storedValues,
    storedByRetention: bucketsOf(retention),
    documentsByRetention: bucketsOf(documents),
    naiveTotal: totalOf(naive),
    total: totalOf(counters),
  };
}

/**
 * Registration volume: the machines this period adds that the previous one did
 * not have. A one-off spike in whichever period the rollout lands, not a
 * monthly cost -- putting it in the monthly rate overstates every later period.
 */
export function onboardingByPeriod(scenario: Scenario): Map<number, number> {
  const out = new Map<number, number>();
  const previous = new Map<string, number>();

  for (const period of scenario.periods) {
    let creates = 0;
    for (const machineType of scenario.machineTypes) {
      const count = machineCountIn(machineType, period);
      const before = previous.get(machineType.id) ?? 0;
      creates += Math.max(0, count - before);
      previous.set(machineType.id, count);
    }
    out.set(period.index, creates);
  }
  return out;
}

function computeMonth(
  scenario: Scenario,
  month: CalendarMonth,
  onboardingThisMonth: number,
): MonthResult {
  const period = scenario.periods.find((p) => p.index === month.periodIndex);
  const counters = zeroCounters();
  const byMachineType: MonthResult['byMachineType'] = [];
  const retention = new Map<number, number>();
  const documents = new Map<number, number>();
  let storedValues = 0;
  let naiveTotal = 0;
  let machinesOnline = 0;
  let machinesTotal = 0;

  const defaultRetention = retentionFor(scenario.settings.retentionDays, DEFAULT_RETENTION_DAYS);

  for (const machineType of scenario.machineTypes) {
    const count = machineCountIn(machineType, period);
    const online = count * (machineType.onlinePct / 100);
    const result = computeMachineTypeMonth(machineType, online, month.days, defaultRetention);

    addCounters(counters, result.counters);
    storedValues += result.storedValues;
    for (const bucket of result.storedByRetention) {
      retention.set(
        bucket.retentionDays,
        (retention.get(bucket.retentionDays) ?? 0) + bucket.values,
      );
    }
    for (const bucket of result.documentsByRetention) {
      documents.set(
        bucket.retentionDays,
        (documents.get(bucket.retentionDays) ?? 0) + bucket.values,
      );
    }
    naiveTotal += result.naiveTotal;
    machinesOnline += online;
    machinesTotal += count;
    byMachineType.push({
      machineTypeId: machineType.id,
      name: machineType.name,
      total: result.total,
    });
  }

  counters.inventoriesCreated += onboardingThisMonth;
  naiveTotal += onboardingThisMonth;

  const total = totalOf(counters);
  const spm = secondsInMonth(month.days);
  const avgMessagesPerSec = total / spm;

  return {
    year: month.year,
    month: month.month,
    days: month.days,
    periodIndex: month.periodIndex,
    monthOfPeriod: month.monthOfPeriod,
    counters,
    total,
    storedValues,
    storedByRetention: bucketsOf(retention),
    documentsByRetention: bucketsOf(documents),
    // The registrations, which no retention rule removes.
    permanentDocuments: onboardingThisMonth,
    naiveTotal,
    onboardingCreates: onboardingThisMonth,
    byMachineType,
    avgMessagesPerSec,
    perMachinePerMonth: machinesTotal > 0 ? total / machinesTotal : 0,
    machinesOnline,
  };
}

export function computeScenario(scenario: Scenario): ScenarioResult {
  const calendar = expandMonths(
    scenario.periods,
    scenario.settings.startYear,
    scenario.settings.startMonth,
  );
  const onboarding = onboardingByPeriod(scenario);

  const months = calendar.map((month) =>
    computeMonth(
      scenario,
      month,
      // The registration spike lands in the first month of its period.
      month.monthOfPeriod === 1 ? (onboarding.get(month.periodIndex) ?? 0) : 0,
    ),
  );

  const periods: PeriodResult[] = scenario.periods.map((period) => {
    const own = months.filter((m) => m.periodIndex === period.index);
    const fallback = own[0] ?? months[0]!;
    return {
      index: period.index,
      months: own,
      peak: own.reduce((best, m) => (m.total > best.total ? m : best), fallback),
      lean: own.reduce((best, m) => (m.total < best.total ? m : best), fallback),
      periodTotal: own.reduce((sum, m) => sum + m.total, 0),
    };
  });

  const first = months[0]!;
  // Storage needs the whole month series, not one month: what is on disk when a
  // month closes is what the months before it left inside the retention
  // windows, and the quantity billed is those month-end figures added up. So it
  // is derived here, once, rather than per consumer.
  const storage = storageByMonth(
    months,
    scenario.settings.retentionDays,
    scenario.settings.bytesPerValue,
  );
  return {
    scenarioName: scenario.name,
    periods,
    months,
    peakMonth: months.reduce((best, m) => (m.total > best.total ? m : best), first),
    leanMonth: months.reduce((best, m) => (m.total < best.total ? m : best), first),
    findings: lintScenario(scenario),
    storage,
    peakStorage: peakStorageMonth(storage),
    // What the Configurator asks for is the period's sum of month-end
    // snapshots, so it is derived here beside the months rather than by every
    // consumer summing the array itself.
    storageByPeriod: storagePerPeriod(storage),
  };
}

export { SECONDS_PER_DAY };

/**
 * What the naive baseline assumes, in words, so the UI can state its own
 * counterfactual instead of asking the reader to trust a ratio.
 */
export const NAIVE_BASELINE_RULE = en['engine.naiveBaselineRule'];
