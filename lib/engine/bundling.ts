/**
 * Bundle proposal. CONCEPT.md section 4.2.
 *
 * The customer states physical reality -- these are my datapoints, this is how
 * often each one is sampled -- and the tool designs the payload. The proposal
 * is one measurement type per distinct sampling interval, because that is the
 * grouping the Measurement API rewards: everything on the same tick shares one
 * timestamp, so it can share one message.
 *
 * Semantics refine the proposal rather than driving it. Two readings on
 * different intervals can never share a measurement, however related they are;
 * two readings on the same interval always can, and only a dashboard argument
 * splits them afterwards (L6).
 */

import type { MachineType, Metric } from './types.js';
import { resolveBundles } from './compute.js';
import { SECONDS_PER_DAY } from './calendar.js';

/**
 * "60" -> "60s", "900" -> "15min", "0.1" -> "100ms".
 *
 * Seconds are kept up to two minutes so the common intervals read back as the
 * customer typed them, and minutes are spelled "min" rather than "m" -- in a
 * fragment name sitting next to units, a bare "m" reads as metres.
 */
export function intervalSlug(seconds: number): string {
  if (seconds < 1) return `${trim(seconds * 1000)}ms`;
  if (seconds < 120) return `${trim(seconds)}s`;
  if (seconds < 3600) return `${trim(seconds / 60)}min`;
  if (seconds < 86_400) return `${trim(seconds / 3600)}h`;
  return `${trim(seconds / 86_400)}d`;
}

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}

function pascal(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Readings';
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .slice(0, 24);
}

/** e.g. acme_RooftopHvac60s */
export function fragmentNameFor(prefix: string, machineTypeName: string, seconds: number): string {
  const clean = prefix.replace(/[^\p{L}\p{N}]+/gu, '') || 'acme';
  return `${clean}_${pascal(machineTypeName)}${intervalSlug(seconds)}`;
}

export interface BundleProposal {
  intervalSeconds: number;
  fragmentName: string;
  metrics: Metric[];
  /** Messages per machine per 31-day month if these travel separately... */
  messagesApart: number;
  /** ...and if they travel together. */
  messagesTogether: number;
}

/**
 * What the tool would do with the continuous metrics of this machine type: one
 * measurement per interval. Only intervals with more than one datapoint are
 * worth proposing -- a lone reading is already one message per sample either
 * way.
 */
export function proposeBundles(machineType: MachineType, prefix: string): BundleProposal[] {
  const byInterval = new Map<number, Metric[]>();

  for (const metric of machineType.metrics) {
    if (metric.kind !== 'continuous' || metric.cadence.mode !== 'interval') continue;
    const seconds = metric.cadence.seconds;
    const list = byInterval.get(seconds);
    if (list) list.push(metric);
    else byInterval.set(seconds, [metric]);
  }

  const monthSeconds = 31 * SECONDS_PER_DAY;
  return [...byInterval.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([intervalSeconds, metrics]) => {
      const sends = monthSeconds / intervalSeconds;
      return {
        intervalSeconds,
        fragmentName: fragmentNameFor(prefix, machineType.name, intervalSeconds),
        metrics,
        messagesApart: sends * metrics.length,
        messagesTogether: sends,
      };
    });
}

/**
 * True when every continuous metric already sits in a bundle whose interval
 * matches its own -- i.e. the proposal has nothing left to offer.
 */
export function proposalIsApplied(machineType: MachineType): boolean {
  const { loneContinuous, bundles } = resolveBundles(machineType);
  if (loneContinuous.length > 0) return false;
  const intervals = new Set<number>();
  for (const { bundle, members } of bundles) {
    if (members.length === 0) continue;
    // Two bundles on the same interval means a deliberate split; that is fine,
    // but it is not the untouched proposal either.
    if (intervals.has(bundle.intervalSeconds)) return false;
    intervals.add(bundle.intervalSeconds);
  }
  return true;
}

/**
 * Applies the proposal: every continuous metric ends up in the bundle for its
 * interval, and empty bundles are dropped. Existing bundles are reused where
 * their interval matches, so a customer who renamed a fragment keeps the name.
 */
export function applyProposal(machineType: MachineType, prefix: string): MachineType {
  const proposals = proposeBundles(machineType, prefix);
  const bundles = [...machineType.bundles];
  const assignment = new Map<string, string>();

  for (const proposal of proposals) {
    let bundle = bundles.find((b) => b.intervalSeconds === proposal.intervalSeconds);
    if (!bundle) {
      bundle = {
        id: `b_${proposal.intervalSeconds}_${Math.random().toString(36).slice(2, 8)}`,
        fragmentName: proposal.fragmentName,
        intervalSeconds: proposal.intervalSeconds,
        metricIds: [],
      };
      bundles.push(bundle);
    }
    for (const metric of proposal.metrics) assignment.set(metric.id, bundle.id);
  }

  const metrics = machineType.metrics.map((metric) => {
    const bundleId = assignment.get(metric.id);
    return bundleId ? { ...metric, bundleId } : metric.kind === 'continuous' ? { ...metric, bundleId: null } : metric;
  });

  const populated = bundles
    .map((bundle) => ({
      ...bundle,
      metricIds: metrics.filter((m) => m.bundleId === bundle.id).map((m) => m.id),
    }))
    .filter((bundle) => bundle.metricIds.length > 0);

  return { ...machineType, metrics, bundles: populated };
}

/**
 * Adding a datapoint puts it straight into the bundle for its interval, making
 * one so if there is none. The good design is the default; splitting is the
 * deliberate act, not bundling.
 */
export function autoAssign(machineType: MachineType, metricId: string, prefix: string): MachineType {
  const metric = machineType.metrics.find((m) => m.id === metricId);
  if (!metric || metric.kind !== 'continuous' || metric.cadence.mode !== 'interval') {
    return machineType;
  }
  const seconds = metric.cadence.seconds;
  const existing = machineType.bundles.find((b) => b.intervalSeconds === seconds);

  if (existing) {
    return {
      ...machineType,
      metrics: machineType.metrics.map((m) => (m.id === metricId ? { ...m, bundleId: existing.id } : m)),
      bundles: machineType.bundles.map((b) =>
        b.id === existing.id && !b.metricIds.includes(metricId)
          ? { ...b, metricIds: [...b.metricIds, metricId] }
          : { ...b, metricIds: b.metricIds.filter((id) => id !== metricId) },
      ),
    };
  }

  const bundle = {
    id: `b_${seconds}_${Math.random().toString(36).slice(2, 8)}`,
    fragmentName: fragmentNameFor(prefix, machineType.name, seconds),
    intervalSeconds: seconds,
    metricIds: [metricId],
  };
  return {
    ...machineType,
    metrics: machineType.metrics.map((m) => (m.id === metricId ? { ...m, bundleId: bundle.id } : m)),
    bundles: [...machineType.bundles, bundle],
  };
}

/** Distinct sampling intervals in use, fastest first. */
export function intervalsOf(machineType: MachineType): number[] {
  const seen = new Set<number>();
  for (const metric of machineType.metrics) {
    if (metric.kind === 'continuous' && metric.cadence.mode === 'interval') {
      seen.add(metric.cadence.seconds);
    }
  }
  return [...seen].sort((a, b) => a - b);
}
