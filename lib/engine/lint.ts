/**
 * The guidance report. CONCEPT.md section 7, rules L1-L10.
 *
 * Every rule that can put a number on itself does, because advice is worth more
 * quantified than asserted. Deltas are stated per 31-day month, so they line up
 * with the peak-month figure in the results table.
 */

import {
  type Finding,
  type MachineType,
  type Metric,
  type Scenario,
} from './types.js';
import { resolveBundles } from './compute.js';
import { REFERENCE_DAYS, SECONDS_PER_DAY } from './calendar.js';
import { commandsInMonth } from './cadence.js';
import { ownFragmentName } from './payload.js';

/** The platform recommendation, CONCEPT.md section 11. */
export const MAX_SERIES_PER_BUNDLE = 100;
const REFERENCE_SECONDS = REFERENCE_DAYS * SECONDS_PER_DAY;
/** A state sampled this many times faster than it changes is mostly noise. */
const REDUNDANCY_FACTOR = 10;
/** Above this many raises per machine per day, an alarm is being re-raised. */
const ALARM_RERAISE_PER_DAY = 24;
const MAX_SENSIBLE_TRANSITIONS = 4;

function online(machineType: MachineType): number {
  return machineType.machineCount * (machineType.onlinePct / 100);
}

/** Interval a continuous metric is actually sent at. */
function effectiveInterval(metric: Metric, bundleInterval: number | undefined): number | undefined {
  if (bundleInterval !== undefined) return bundleInterval;
  return metric.cadence.mode === 'interval' ? metric.cadence.seconds : undefined;
}

function lintMachineType(machineType: MachineType): Finding[] {
  const findings: Finding[] = [];
  const { bundles } = resolveBundles(machineType);
  const n = online(machineType);

  const bundleOf = new Map<string, { id: string; fragmentName: string; interval: number }>();
  for (const { bundle, members } of bundles) {
    for (const member of members) {
      bundleOf.set(member.id, {
        id: bundle.id,
        fragmentName: bundle.fragmentName,
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
    const semantic = metric.semanticGroup.trim().toLowerCase() || '(none)';
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
    const containerCount = group.containers.size;
    if (containerCount < 2) continue;
    const metrics = [...group.containers.values()].flat();
    // Collapsing k measurements into 1 removes (k-1) sends per interval.
    const sendsPerContainer = (n * REFERENCE_SECONDS) / group.interval;
    findings.push({
      rule: 'L1',
      severity: 'suggestion',
      title: `${metrics.length} readings share ${group.interval} s and "${group.semantic}" but travel in ${containerCount} measurements`,
      detail:
        `${metrics.map((m) => m.name).join(', ')} are sampled on the same tick and mean the same kind of thing, ` +
        `so they can share one measurement and one timestamp. That is one POST instead of ${containerCount}, ` +
        `for identical information.`,
      machineTypeId: machineType.id,
      metricIds: metrics.map((m) => m.id),
      messageDelta: -(containerCount - 1) * sendsPerContainer,
    });
  }

  /* -- L2 / L3: metrics that do not belong in an interval bundle ----------- */
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
        title: `"${metric.name}" is a ${metric.kind} metric inside interval bundle ${bundle.fragmentName}`,
        detail:
          'Only continuous readings belong in an interval bundle. Anything sent on change makes the ' +
          'bundle send a different set of series from one message to the next, and a fragment whose ' +
          'shape varies is what degrades write and query performance. Give it its own measurement.',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        bundleId: bundle.id,
      });
    }

    if (metric.kind === 'state' && metric.cadence.mode === 'onChange' && metric.cadence.perDay > 0) {
      const secondsBetweenChanges = SECONDS_PER_DAY / metric.cadence.perDay;
      const ratio = secondsBetweenChanges / bundle.interval;
      if (ratio >= REDUNDANCY_FACTOR) {
        const sends = (n * REFERENCE_SECONDS) / bundle.interval;
        const onChange = n * metric.cadence.perDay * REFERENCE_DAYS;
        findings.push({
          rule: 'L2',
          severity: 'warning',
          title: `"${metric.name}" changes every ~${Math.round(secondsBetweenChanges / 60)} min but is sampled every ${bundle.interval} s`,
          detail:
            `That is ${Math.round(ratio)}x faster than it changes. Every sample in between stores the value ` +
            'that was already there, and the moment it actually flipped is buried between two ticks. ' +
            'Sent on change it carries the transition timestamp, which is the information.',
          machineTypeId: machineType.id,
          metricIds: [metric.id],
          bundleId: bundle.id,
          messageDelta: onChange - sends,
        });
      }
    }
  }

  /* -- L4 / L6: bundle shape ---------------------------------------------- */
  for (const { bundle, members } of bundles) {
    if (bundle.intervalSeconds < 1) {
      const sends = (n * REFERENCE_SECONDS) / Math.max(bundle.intervalSeconds, 1e-9);
      findings.push({
        rule: 'L4',
        severity: 'warning',
        title: `Bundle ${bundle.fragmentName} is sampled faster than once a second`,
        detail:
          `At ${bundle.intervalSeconds} s this is ${Math.round(sends).toLocaleString('en-GB')} messages a month from ` +
          `${Math.round(n).toLocaleString('en-GB')} machines. Sub-second sampling almost always belongs on an edge ` +
          'gateway that aggregates and forwards a summary; a gateway sending one message a second instead of sixty ' +
          'carries the same signal for a sixtieth of the volume.',
        machineTypeId: machineType.id,
        bundleId: bundle.id,
      });
    }

    if (members.length > MAX_SERIES_PER_BUNDLE) {
      findings.push({
        rule: 'L6',
        severity: 'warning',
        title: `Bundle ${bundle.fragmentName} carries ${members.length} series`,
        detail:
          `The platform recommendation is no more than ${MAX_SERIES_PER_BUNDLE} series in one measurement. ` +
          'Split it along semantic lines -- the split costs one extra message per interval and buys a payload ' +
          'that dashboards and queries can work with.',
        machineTypeId: machineType.id,
        bundleId: bundle.id,
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
        title: `Bundle ${bundle.fragmentName} mixes ${semantics.size} unrelated groups of readings`,
        detail:
          `It holds ${[...semantics].join(', ')} together across ${units.size} units. Bundling purely for volume ` +
          'produces fragments that make no sense to whoever builds the dashboard. Sharing a tick is necessary ' +
          'but not sufficient -- the series should also belong together.',
        machineTypeId: machineType.id,
        bundleId: bundle.id,
      });
    }
  }

  /* -- L5 / L10: inventory misuse ----------------------------------------- */
  for (const metric of machineType.metrics) {
    if (metric.kind !== 'fact') continue;
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
        title: `"${metric.name}" updates the managed object more than once a minute`,
        detail:
          'Inventory is not a time series store. Each PUT bills, overwrites the previous value and leaves ' +
          'nothing to chart. If it changes this often and the history matters, it is a measurement or an event.',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
      });
    }
    if (metric.resentOnTimer) {
      findings.push({
        rule: 'L10',
        severity: 'warning',
        title: `"${metric.name}" is re-sent on a timer or at every boot`,
        detail:
          'The platform does not diff the payload, so a successful PUT that changes nothing still counts. ' +
          'Re-sending the full managed object on a heartbeat bills every time while storing no new ' +
          'information. Sending it only when it changes removes the whole line. (A rejected write, by ' +
          'contrast, does not count at all -- failures are free.)',
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
        title: `"${metric.name}" raises ${metric.cadence.perDay} alarms per machine per day`,
        detail:
          'At that rate the same alarm type is being raised while it is still active. Cumulocity updates ' +
          'the existing alarm rather than creating a duplicate -- which still bills, as Alarms Updated. ' +
          'If the point is "something happened" this is an event; if it is "something is wrong", raise once ' +
          'and let the lifecycle carry it.',
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
        title: `"${metric.name}" is modelled with no status transitions`,
        detail:
          'A machine acknowledging a command through PENDING, EXECUTING and SUCCESSFUL costs one create ' +
          'plus three updates. Both Operations Created and Operations Updated bill, so a command modelled ' +
          'as one message is understated by a factor of three or four.',
        machineTypeId: machineType.id,
        metricIds: [metric.id],
        messageDelta: online(machineType) * perMonth * 3,
      });
    } else if (transitions > MAX_SENSIBLE_TRANSITIONS) {
      findings.push({
        rule: 'L9',
        severity: 'warning',
        title: `"${metric.name}" reports ${transitions} status transitions per command`,
        detail:
          'Every status write bills as Operations Updated. More than four suggests progress reporting through ' +
          'the operation status field -- polling-style control patterns get expensive fast, and progress ' +
          'belongs in an event or a measurement.',
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
      note(bundle.fragmentName.trim(), { machineType, signature, bundleId: bundle.id });
    }
    const solo = [...loneContinuous, ...machineType.metrics.filter((m) => m.kind === 'state')];
    for (const metric of solo) {
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
      title: `Fragment "${name}" holds a different series set on ${uses.map((u) => u.machineType.name).join(' and ')}`,
      detail:
        'One fragment name has to mean one series set. When the same fragment arrives carrying different ' +
        'series depending on which machine sent it, the stored schema varies exactly as if a single device ' +
        'were sending partial payloads -- which is the pattern that degrades database performance. Either ' +
        'align the series sets or give the fragments different names.',
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
    ...scenario.machineTypes.flatMap(lintMachineType),
    ...lintFragmentNames(scenario),
  ];
  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule),
  );
}
