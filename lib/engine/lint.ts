/**
 * The guidance report. CONCEPT.md section 7, rules L1-L10.
 *
 * Every rule that can put a number on itself does, because advice is worth more
 * quantified than asserted. Deltas are stated per 31-day month, so they line up
 * with the peak-month figure in the results table.
 */

import {
  MAX_SERIES_PER_BUNDLE,
  looksLikeFlag,
  seriesIn,
  typesFor,
  typesIn,
  type Bundle,
  type Finding,
  type MachineType,
  type Metric,
  type Scenario,
} from './types.js';
import { bundleFragmentName } from './bundling.js';
import { resolveBundles } from './compute.js';
import { REFERENCE_DAYS, SECONDS_PER_DAY } from './calendar.js';
import { commandsInMonth } from './cadence.js';
import { ownFragmentName } from './payload.js';

const REFERENCE_SECONDS = REFERENCE_DAYS * SECONDS_PER_DAY;
/**
 * Faster than this, and a status is being polled rather than reported.
 *
 * Fifteen minutes: slow enough that a genuinely fast-moving signal (a valve
 * that cycles every few minutes) is not nagged about, fast enough to catch the
 * default of dropping a flag into the fleet's one-minute tick.
 */
const STATUS_TICK_SECONDS = 15 * 60;
/** Above this many raises per machine per day, an alarm is being re-raised. */
const ALARM_RERAISE_PER_DAY = 24;
const MAX_SENSIBLE_TRANSITIONS = 4;
/**
 * The grouping key for series nobody gave a semantic group. It is a key, not a
 * name -- L1 picks a title that does not quote it.
 */
const NO_SEMANTIC = '(none)';

function online(machineType: MachineType): number {
  return machineType.machineCount * (machineType.onlinePct / 100);
}

/** Interval a continuous metric is actually sent at. */
function effectiveInterval(metric: Metric, bundleInterval: number | undefined): number | undefined {
  if (bundleInterval !== undefined) return bundleInterval;
  return metric.cadence.mode === 'interval' ? metric.cadence.seconds : undefined;
}

function lintMachineType(machineType: MachineType, prefix: string): Finding[] {
  const findings: Finding[] = [];
  const { bundles } = resolveBundles(machineType);
  const n = online(machineType);
  // A finding that says "acme_" because nobody has typed a name yet is a
  // finding nobody can act on. Same resolution as the diagram and the payloads.
  const nameOf = (bundle: Bundle) => bundleFragmentName(prefix, machineType.name, bundle);

  const bundleOf = new Map<string, { id: string; fragmentName: string; interval: number }>();
  for (const { bundle, members } of bundles) {
    for (const member of members) {
      bundleOf.set(member.id, {
        id: bundle.id,
        fragmentName: nameOf(bundle),
        interval: bundle.intervalSeconds,
      });
    }
  }

  /* -- L1: same interval, same semantics, different measurements ----------- */
  const groups = new Map<string, { interval: number; semantic: string; containers: Map<string, Metric[]> }>();
  for (const metric of machineType.metrics) {
    if (metric.kind !== 'continuous') continue;
    const interval = effectiveInterval(metric, bundleOf.get(metric.id)?.interval);
    if (interval === undefined) continue;
    const semantic = metric.semanticGroup.trim().toLowerCase() || NO_SEMANTIC;
    const key = `${interval}|${semantic}`;
    let group = groups.get(key);
    if (!group) {
      group = { interval, semantic, containers: new Map() };
      groups.set(key, group);
    }
    const container = bundleOf.get(metric.id)?.id ?? `lone:${metric.id}`;
    const existing = group.containers.get(container);
    if (existing) existing.push(metric);
    else group.containers.set(container, [metric]);
  }

  for (const group of groups.values()) {
    const metrics = [...group.containers.values()].flat();
    // Measurement types these series are sent in now, and the fewest they
    // could be sent in. Counting containers was the same question only while a
    // container was always one type: a row that sends each of its series
    // separately is one container and hundreds of types, and a hundred series
    // pooled together are one container and two types. So both ends are asked
    // of the same function, and the rule fires on the gap between them.
    const currentTypes = [...group.containers.values()].reduce(
      (sum, members) => sum + typesIn(members),
      0,
    );
    // One type is the floor: a pool is never split, so anything sharing a tick
    // and a meaning can share one measurement. Deliberately NOT typesIn, which
    // honours the one-type-per-series flag and would report a row as already
    // optimal at the very moment it is the thing worth advising about.
    const fewestTypes = 1;
    if (currentTypes <= fewestTypes) continue;
    const sendsPerType = (n * REFERENCE_SECONDS) / group.interval;
    // '(none)' is the key these were grouped under, not a group anybody named,
    // so the sentence must not quote it as one.
    const named = group.semantic !== NO_SEMANTIC;
    findings.push({
      rule: 'L1',
      severity: 'suggestion',
      titleKey: named ? 'lint.L1.title' : 'lint.L1.titleNoGroup',
      titleParams: {
        count: seriesIn(metrics),
        interval: group.interval,
        semantic: group.semantic,
        containers: currentTypes,
      },
      detailKey: 'lint.L1.detail',
      detailParams: {
        // The series are the sentence's subject; the row names are a list at
        // the end of it. One row standing for 1,000 series is still 1,000
        // series, and "Reading are read on the same tick" is not English.
        count: seriesIn(metrics),
        names: metrics.map((m) => m.name).join(', '),
        containers: currentTypes,
      },
      machineTypeId: machineType.id,
      metricIds: metrics.map((m) => m.id),
      messageDelta: -(currentTypes - fewestTypes) * sendsPerType,
    });
  }

  /* -- L3: a non-measurement in an interval bundle -------------------------- */
  for (const metric of machineType.metrics) {
    const bundle = bundleOf.get(metric.id);
    if (!bundle) continue;

    if (metric.kind !== 'continuous') {
      // The UI only offers bundling for continuous metrics, so this is
      // reachable only through JSON import -- but it is the violation that
      // degrades write and query performance, so it is an error either way.
      findings.push({
        rule: 'L3',
        severity: 'error',
        titleKey: 'lint.L3.title',
        titleParams: {
          name: metric.name,
          kind: metric.kind,
          // Already resolved: this one comes out of bundleOf, not the bundle.
          fragment: bundle.fragmentName,
        },
        detailKey: 'lint.L3.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        bundleId: bundle.id,
      });
    }
  }

  /* -- L2: a status sampled on a fast tick ---------------------------------- */
  /**
   * This rule used to catch a flag sitting inside an interval bundle, back when
   * a flag was its own kind sent on change. With one rhythm there is nothing
   * structural left to catch -- a status is a series like any other -- so the
   * mistake it was guarding against is now easier to make rather than harder,
   * and this is the only place left to say so. A two-state value on a one-minute
   * tick pays for 44,640 identical readings a month to learn something that
   * changed twenty times.
   *
   * It reads the name, so it is a hint and not an assertion: no figure depends
   * on it, and a series the pattern misses is simply not flagged.
   */
  for (const metric of machineType.metrics) {
    if (metric.cadence.mode !== 'interval') continue;
    if (metric.cadence.seconds >= STATUS_TICK_SECONDS) continue;
    if (!looksLikeFlag(metric)) continue;

    const sends = (n * REFERENCE_SECONDS) / Math.max(metric.cadence.seconds, 1e-9);
    findings.push({
      rule: 'L2',
      severity: 'warning',
      titleKey: 'lint.L2.title',
      titleParams: {
        name: metric.name,
        interval: Math.round(metric.cadence.seconds),
      },
      detailKey: 'lint.L2.detail',
      detailParams: { sends: Math.round(sends).toLocaleString('en-GB') },
      machineTypeId: machineType.id,
      metricIds: [metric.id],
    });
  }

  /* -- L4 / L6: bundle shape ---------------------------------------------- */
  for (const { bundle, members } of bundles) {
    if (bundle.intervalSeconds < 1) {
      const sends = (n * REFERENCE_SECONDS) / Math.max(bundle.intervalSeconds, 1e-9);
      findings.push({
        rule: 'L4',
        severity: 'warning',
        titleKey: 'lint.L4.title',
        titleParams: { fragment: nameOf(bundle) },
        detailKey: 'lint.L4.detail',
        // Grouped digits, but not localised: the engine has no locale, and the
        // UI cannot reformat a number once it is inside a sentence. A figure
        // this large is read as a magnitude either way.
        detailParams: {
          interval: bundle.intervalSeconds,
          messages: Math.round(sends).toLocaleString('en-GB'),
          machines: Math.round(n).toLocaleString('en-GB'),
        },
        machineTypeId: machineType.id,
        bundleId: bundle.id,
      });
    }

    // The recommendation is advice, and the engine quotes what it is given:
    // 450 series in one measurement is one message, which is what the platform
    // does with it. So this reports the shape, and prices what *following* the
    // recommendation would cost -- a positive delta, because splitting adds
    // messages. The tool used to split regardless and quote the larger number,
    // which over-stated every fleet whose agent really does post one fat
    // measurement.
    const series = seriesIn(members);
    if (series > MAX_SERIES_PER_BUNDLE) {
      const ticks = (n * REFERENCE_SECONDS) / Math.max(bundle.intervalSeconds, 1e-9);
      const split = typesFor(series);
      findings.push({
        rule: 'L6',
        severity: 'warning',
        titleKey: 'lint.L6.size.title',
        titleParams: { fragment: nameOf(bundle), count: series, max: MAX_SERIES_PER_BUNDLE },
        detailKey: 'lint.L6.size.detail',
        detailParams: { max: MAX_SERIES_PER_BUNDLE, count: series, types: split },
        machineTypeId: machineType.id,
        bundleId: bundle.id,
        // What following the advice would add, so the trade is explicit.
        messageDelta: (split - 1) * ticks,
      });
    }

    const units = new Set(members.map((m) => m.unit.trim()).filter(Boolean));
    const semantics = new Set(
      members.map((m) => m.semanticGroup.trim().toLowerCase()).filter(Boolean),
    );
    // Mixed units prove nothing on their own: temperature, humidity, CO2 and
    // pressure off one sensor board are four units and one perfectly good
    // bundle. Mixed semantics are the signal.
    if (members.length > 1 && semantics.size > 1) {
      findings.push({
        rule: 'L6',
        severity: 'warning',
        titleKey: 'lint.L6.mixed.title',
        titleParams: { fragment: nameOf(bundle), count: semantics.size },
        detailKey: 'lint.L6.mixed.detail',
        detailParams: { semantics: [...semantics].join(', '), units: units.size },
        machineTypeId: machineType.id,
        bundleId: bundle.id,
      });
    }
  }

  /* -- L5 / L10: inventory misuse ----------------------------------------- */
  for (const metric of machineType.metrics) {
    if (metric.kind !== 'inventory') continue;
    const writesPerMonth =
      metric.cadence.mode === 'perMonth'
        ? metric.cadence.count
        : metric.cadence.mode === 'onChange'
          ? metric.cadence.perDay * REFERENCE_DAYS
          : 0;
    const minutesPerMonth = REFERENCE_DAYS * 24 * 60;
    if (writesPerMonth > minutesPerMonth) {
      findings.push({
        rule: 'L5',
        severity: 'warning',
        titleKey: 'lint.L5.title',
        titleParams: { name: metric.name },
        detailKey: 'lint.L5.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
      });
    }
    if (metric.resentOnTimer) {
      findings.push({
        rule: 'L10',
        severity: 'warning',
        titleKey: 'lint.L10.title',
        titleParams: { name: metric.name },
        detailKey: 'lint.L10.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        messageDelta: -(online(machineType) * writesPerMonth),
      });
    }
  }

  /* -- L8: alarms used as events ------------------------------------------ */
  for (const metric of machineType.metrics) {
    if (metric.kind !== 'condition' || metric.cadence.mode !== 'onChange') continue;
    if (metric.cadence.perDay > ALARM_RERAISE_PER_DAY) {
      findings.push({
        rule: 'L8',
        severity: 'suggestion',
        titleKey: 'lint.L8.title',
        titleParams: { name: metric.name, count: metric.cadence.perDay },
        detailKey: 'lint.L8.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
      });
    }
  }

  /* -- L9: operation transitions ------------------------------------------ */
  for (const metric of machineType.metrics) {
    if (metric.kind !== 'command' || metric.cadence.mode !== 'command') continue;
    const { transitions } = metric.cadence;
    const perMonth = commandsInMonth(metric.cadence, REFERENCE_DAYS);
    if (transitions <= 0) {
      findings.push({
        rule: 'L9',
        severity: 'warning',
        titleKey: 'lint.L9.none.title',
        titleParams: { name: metric.name },
        detailKey: 'lint.L9.none.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        messageDelta: online(machineType) * perMonth * 3,
      });
    } else if (transitions > MAX_SENSIBLE_TRANSITIONS) {
      findings.push({
        rule: 'L9',
        severity: 'warning',
        titleKey: 'lint.L9.many.title',
        titleParams: { name: metric.name, count: transitions },
        detailKey: 'lint.L9.many.detail',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        messageDelta: online(machineType) * perMonth * (transitions - MAX_SENSIBLE_TRANSITIONS),
      });
    }
  }

  return findings;
}

/**
 * L7: one fragment name must mean one series set across the whole tenant.
 *
 * Solo measurement types count as much as bundled ones. A series travelling
 * alone carries a fragment name too -- derived from the series name, or typed
 * into the wizard's table -- and typing one that a bundle elsewhere already uses
 * is the same error with the same consequence.
 */
function lintFragmentNames(scenario: Scenario): Finding[] {
  type Use = { machineType: MachineType; signature: string; bundleId?: string; metricId?: string };
  const seen = new Map<string, Use[]>();
  const note = (name: string, use: Use) => {
    if (!name) return;
    seen.set(name, [...(seen.get(name) ?? []), use]);
  };

  for (const machineType of scenario.machineTypes) {
    const { bundles, loneContinuous } = resolveBundles(machineType);
    for (const { bundle, members } of bundles) {
      if (members.length === 0) continue;
      const signature = members
        .map((m) => m.name.trim().toLowerCase())
        .sort()
        .join('|');
      note(bundleFragmentName(scenario.settings.fragmentPrefix, machineType.name, bundle), {
        machineType,
        signature,
        bundleId: bundle.id,
      });
    }
    for (const metric of loneContinuous) {
      note(ownFragmentName(scenario.settings.fragmentPrefix, metric).trim(), {
        machineType,
        signature: metric.name.trim().toLowerCase(),
        metricId: metric.id,
      });
    }
  }

  const findings: Finding[] = [];
  for (const [name, uses] of seen) {
    const signatures = new Set(uses.map((u) => u.signature));
    if (signatures.size < 2) continue;
    findings.push({
      rule: 'L7',
      severity: 'error',
      titleKey: 'lint.L7.title',
      titleParams: {
        name,
        machineTypes: uses.map((u) => u.machineType.name).join(' and '),
      },
      detailKey: 'lint.L7.detail',
      machineTypeId: uses[0]!.machineType.id,
      bundleId: uses[0]!.bundleId,
      metricIds: uses.map((u) => u.metricId).filter((id): id is string => id !== undefined),
    });
  }
  return findings;
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
};

export function lintScenario(scenario: Scenario): Finding[] {
  const findings = [
    ...scenario.machineTypes.flatMap(mt => lintMachineType(mt, scenario.settings.fragmentPrefix)),
    ...lintFragmentNames(scenario),
  ];
  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule),
  );
}
