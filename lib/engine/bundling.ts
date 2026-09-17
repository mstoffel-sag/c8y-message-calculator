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

import type { Bundle, MachineType, Metric } from './types.js';
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

/**
 * What a measurement type is called.
 *
 * Every bundle the wizard makes is named as it is made, so the stored name is
 * almost always the answer. The fallback is for the ones that arrive without
 * one: a hand-edited import, or a scenario saved by a build that did not set
 * it. Before this existed each reader had its own fallback and they disagreed
 * -- the payload example said `acme_Readings60s` where the diagram said
 * `acme_RooftopHvacUnit60s`, for the same measurement type.
 *
 * Every reader goes through here, so the diagram, the payload examples, the
 * workbook and the findings cannot disagree about what a type is called.
 */
export function bundleFragmentName(
  prefix: string,
  machineTypeName: string,
  bundle: Pick<Bundle, 'fragmentName' | 'intervalSeconds'>,
): string {
  return bundle.fragmentName.trim() || fragmentNameFor(prefix, machineTypeName, bundle.intervalSeconds);
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
    // Only intervals with more than one series, as the contract above says: a
    // lone reading costs one message per sample whether or not the tool mints
    // a type for it, so proposing one is a suggestion that changes nothing.
    // The filter was missing and did not show, because a series sitting alone
    // used to be rare -- a flag was its own kind and never came through here.
    // With one rhythm every ex-flag arrives as a lone series, and the banner
    // filled up with advice worth nothing.
    .filter(([, metrics]) => metrics.length > 1)
    .map(([intervalSeconds, metrics]) => {
      const sends = monthSeconds / intervalSeconds;
      // The name of the measurement type these series would end up in -- which
      // is the one that already exists at this interval, if there is one.
      // applyProposal reuses that bundle rather than minting a second, so
      // promising a derived name here made the panel describe a type nobody
      // was going to create: it kept saying acme_RooftopHvacUnit60s after the
      // series had been put in acme_Climate, and went on saying it in the
      // "already bundled" state, where it is the only name on screen.
      const existing = machineType.bundles.find((b) => b.intervalSeconds === intervalSeconds);
      return {
        intervalSeconds,
        fragmentName:
          existing?.fragmentName.trim() || fragmentNameFor(prefix, machineType.name, intervalSeconds),
        metrics,
        messagesApart: sends * metrics.length,
        messagesTogether: sends,
      };
    });
}

/**
 * True when this one proposal's series already share a measurement type of
 * their own -- so it has nothing left to offer.
 *
 * Needed per proposal, not just per machine type, because a fleet can be
 * half-grouped: the §9 HVAC unit has its four climate readings bundled and its
 * two 72-minute statuses not. Summing the saving across every proposal in that
 * state offered "apply this and save 134.5 M" when 133.9 M of it was already
 * banked, which is the kind of number a customer repeats in a meeting.
 */
export function proposalApplied(machineType: MachineType, proposal: BundleProposal): boolean {
  const ids = new Set(proposal.metrics.map((m) => m.id));
  const homes = new Set(proposal.metrics.map((m) => m.bundleId ?? null));
  if (homes.size !== 1) return false;
  const [only] = [...homes];
  if (only === null) return false;
  const bundle = machineType.bundles.find((b) => b.id === only);
  // Exactly these series and no others: a bundle carrying a seventh would be a
  // different design, not this proposal.
  return bundle !== undefined
    && bundle.metricIds.length === ids.size
    && bundle.metricIds.every((id) => ids.has(id));
}

/**
 * True when every grouping the tool would propose is already in place.
 *
 * Defined in terms of the proposals rather than by walking the bundles, so it
 * cannot disagree with what the banner offers. It used to answer false whenever
 * any series sat alone, which stopped being the same question once a lone
 * series became ordinary rather than a flag that could not be bundled.
 */
export function proposalIsApplied(machineType: MachineType, prefix = 'acme'): boolean {
  const proposals = proposeBundles(machineType, prefix);
  return proposals.every((p) => proposalApplied(machineType, p));
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
