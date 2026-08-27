/**
 * The nine counters. CONCEPT.md section 5, "The arithmetic".
 *
 * Every figure is computed for one real calendar month, because that is the
 * period billing works in. Nothing here converts volume into money: the output
 * is messages per calendar month and that is the whole output (section 2).
 */

import {
  type Bundle,
  type Counters,
  type Metric,
  type MachineType,
  type MonthResult,
  type Period,
  type PeriodResult,
  type Scenario,
  type ScenarioResult,
  addCounters,
  totalOf,
  zeroCounters,
} from './types.js';
import { type CalendarMonth, SECONDS_PER_DAY, expandMonths, secondsInMonth } from './calendar.js';
import { lintScenario } from './lint.js';
import { peakStorageMonth, storageByMonth } from './storage.js';
import { commandsInMonth } from './cadence.js';

/** Interval assumed for a state metric in the naive baseline when the machine
 *  type has no continuous metric to borrow a cadence from. */
export const NAIVE_FALLBACK_INTERVAL_SECONDS = 60;

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

/** The fastest continuous cadence in a machine type, used by the naive baseline. */
function fastestContinuousInterval(machineType: MachineType): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (const { bundle, members } of resolveBundles(machineType).bundles) {
    if (members.length > 0) fastest = Math.min(fastest, bundle.intervalSeconds);
  }
  for (const metric of machineType.metrics) {
    if (metric.kind === 'continuous' && metric.cadence.mode === 'interval') {
      fastest = Math.min(fastest, metric.cadence.seconds);
    }
  }
  return Number.isFinite(fastest) ? fastest : NAIVE_FALLBACK_INTERVAL_SECONDS;
}

export interface MachineTypeMonth {
  counters: Counters;
  storedValues: number;
  /** Total messages under the naive baseline, for the same information. */
  naiveTotal: number;
  total: number;
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
): MachineTypeMonth {
  const counters = zeroCounters();
  const naive = zeroCounters();
  const spm = secondsInMonth(days);
  const n = machinesOnline;
  let storedValues = 0;

  // --- continuous readings, bundled: one POST carries every series in the
  // --- bundle, so the count is per send, not per series.
  const { bundles, loneContinuous } = resolveBundles(machineType);
  for (const { bundle, members } of bundles) {
    if (members.length === 0) continue;
    const interval = Math.max(bundle.intervalSeconds, 1e-9);
    const sends = (n * spm) / interval;
    counters.measurementsCreated += sends;
    storedValues += sends * members.length;

    // Naive: every series its own measurement at the same cadence.
    naive.measurementsCreated += sends * members.length;
  }

  // --- continuous readings in no bundle: their own measurement either way.
  for (const metric of loneContinuous) {
    if (metric.cadence.mode !== 'interval') continue;
    const sends = (n * spm) / Math.max(metric.cadence.seconds, 1e-9);
    counters.measurementsCreated += sends;
    storedValues += sends;
    naive.measurementsCreated += sends;
  }

  const naiveStateInterval = fastestContinuousInterval(machineType);

  for (const metric of machineType.metrics) {
    const cadence = metric.cadence;
    switch (metric.kind) {
      case 'continuous':
        // Already counted above.
        break;

      case 'state': {
        // On change, in its own measurement -- the timestamp of the transition
        // is the information (section 4.4).
        if (cadence.mode !== 'onChange') break;
        const sends = n * cadence.perDay * days;
        counters.measurementsCreated += sends;
        storedValues += sends;
        // Naive: sampled on the fleet's fastest interval like everything else.
        naive.measurementsCreated += (n * spm) / naiveStateInterval;
        break;
      }

      case 'occurrence': {
        if (cadence.mode !== 'onChange') break;
        const sends = n * cadence.perDay * days;
        counters.eventsCreated += sends;
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
        naive.alarmsCreated += raises;
        naive.alarmsUpdated += raises;
        break;
      }

      case 'fact': {
        // A fact may be quoted per month (firmware version) or per day (a
        // config block re-sent nightly). A daily rate scales with month length;
        // a monthly count does not.
        const writes =
          cadence.mode === 'perMonth'
            ? n * cadence.count
            : cadence.mode === 'onChange'
              ? n * cadence.perDay * days
              : 0;
        counters.inventoriesUpdated += writes;
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
        naive.operationsCreated += commands;
        naive.operationsUpdated += commands * cadence.transitions;
        break;
      }
    }
  }

  return {
    counters,
    storedValues,
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
  let storedValues = 0;
  let naiveTotal = 0;
  let machinesOnline = 0;
  let machinesTotal = 0;

  for (const machineType of scenario.machineTypes) {
    const count = machineCountIn(machineType, period);
    const online = count * (machineType.onlinePct / 100);
    const result = computeMachineTypeMonth(machineType, online, month.days);

    addCounters(counters, result.counters);
    storedValues += result.storedValues;
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
    naiveTotal,
    onboardingCreates: onboardingThisMonth,
    byMachineType,
    avgMessagesPerSec,
    peakMessagesPerSec: avgMessagesPerSec * scenario.settings.peakFactor,
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
  // Storage needs the whole month series, not one month: what is on disk at the
  // end of a month is what the months before it left inside the retention
  // window. So it is derived here, once, rather than per consumer.
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
  };
}

export { SECONDS_PER_DAY };

/**
 * What the naive baseline assumes, in words, so the UI can state its own
 * counterfactual instead of asking the reader to trust a ratio.
 */
export const NAIVE_BASELINE_RULE =
  'Every series in its own measurement, and every state or flag sampled on a timer at the machine ' +
  "type's fastest interval rather than sent on change. Events, alarms, inventory writes and " +
  'operations are identical in both models -- the whole difference is in the Measurement API.';
