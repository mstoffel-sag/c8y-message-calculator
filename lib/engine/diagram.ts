/**
 * The measurement view: what one machine of a type actually sends.
 *
 * The same picture the explainer uses -- readings on the left, envelopes on the
 * right -- but built from the customer's own configuration rather than a worked
 * example. Once somebody has understood the diagram, showing them their own
 * design in the same shape is the cheapest review they will ever get: an
 * envelope holding one reading is visibly paying full price for it.
 *
 * Pure view model, no DOM and no layout. Only measurements appear, because
 * bundling is a Measurement API question -- events, alarms, inventory writes and
 * operations each cost one message on their own and have nothing to group.
 */

import type { MachineType, Metric } from './types.js';
import { resolveBundles } from './compute.js';
import { REFERENCE_DAYS, SECONDS_PER_DAY } from './calendar.js';
import { ownFragmentName, seriesNameOf } from './payload.js';
import { fragmentNameFor } from './bundling.js';

const REFERENCE_SECONDS = REFERENCE_DAYS * SECONDS_PER_DAY;

export interface ViewMember {
  metricId: string;
  name: string;
  unit: string;
}

export interface ViewGroup {
  id: string;
  /** The measurement fragment these readings travel in. */
  fragmentName: string;
  /** "every 1 min" or "on change". */
  /**
   * Sampling interval in seconds, or undefined for on-change -- not a phrase.
   * The UI says "every 15 min" or "alle 15 min" from this.
   */
  intervalSeconds?: number;
  /** True when more than one reading shares the envelope. */
  shared: boolean;
  /** True for interval sampling, false for on-change. */
  timed: boolean;
  members: ViewMember[];
  /** Members beyond the display cap, summarised rather than drawn. */
  hiddenMembers: number;
  /** Every member, including any not drawn. */
  seriesCount: number;
  messagesPerMonth: number;
}

export interface MeasurementView {
  groups: ViewGroup[];
  /** Rows to draw: every displayed member, in group order. */
  rowCount: number;
  messagesPerMonth: number;
  /** Readings stored per month -- unchanged by how they are grouped. */
  storedPerMonth: number;
  /** Every reading in its own measurement, states sampled on the fastest tick. */
  naiveMessagesPerMonth: number;
}

export interface ViewOptions {
  /** Readings drawn per envelope before the rest are summarised. */
  maxMembersPerGroup?: number;
  /** Total rows drawn before groups start collapsing. */
  maxRows?: number;
}

function member(metric: Metric): ViewMember {
  return {
    metricId: metric.id,
    name: metric.name.trim() || seriesNameOf(metric.name),
    unit: metric.unit.trim(),
  };
}

/**
 * Builds the view. Group order is the order the diagram draws its rows in, so
 * it is chosen to keep the connectors from crossing: shared bundles first,
 * fastest to slowest, then readings travelling alone, then on-change states.
 */
export function measurementView(
  machineType: MachineType,
  prefix = 'acme',
  options: ViewOptions = {},
): MeasurementView {
  const maxMembers = options.maxMembersPerGroup ?? 8;
  const maxRows = options.maxRows ?? 16;
  const { bundles, loneContinuous } = resolveBundles(machineType);
  const groups: ViewGroup[] = [];

  for (const { bundle, members } of bundles) {
    if (members.length === 0) continue;
    groups.push({
      id: bundle.id,
      fragmentName: bundle.fragmentName.trim() || fragmentNameFor(prefix, machineType.name, bundle.intervalSeconds),
      intervalSeconds: bundle.intervalSeconds,
      shared: members.length > 1,
      timed: true,
      members: members.map(member),
      hiddenMembers: 0,
      seriesCount: members.length,
      messagesPerMonth: REFERENCE_SECONDS / Math.max(bundle.intervalSeconds, 1e-9),
    });
  }

  // Interval readings sitting alone: one message per sample, all to themselves.
  for (const metric of loneContinuous) {
    const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
    groups.push({
      id: metric.id,
      fragmentName: ownFragmentName(prefix, metric),
      intervalSeconds: seconds,
      shared: false,
      timed: true,
      members: [member(metric)],
      hiddenMembers: 0,
      seriesCount: 1,
      messagesPerMonth: REFERENCE_SECONDS / Math.max(seconds, 1e-9),
    });
  }

  for (const metric of machineType.metrics) {
    if (metric.kind !== 'state') continue;
    const perDay = metric.cadence.mode === 'onChange' ? metric.cadence.perDay : 0;
    groups.push({
      id: metric.id,
      fragmentName: ownFragmentName(prefix, metric),
      intervalSeconds: undefined,
      shared: false,
      timed: false,
      members: [member(metric)],
      hiddenMembers: 0,
      seriesCount: 1,
      messagesPerMonth: perDay * REFERENCE_DAYS,
    });
  }

  const capped = capRows(groups, maxMembers, maxRows);

  return {
    groups: capped,
    rowCount: capped.reduce((sum, g) => sum + g.members.length + (g.hiddenMembers > 0 ? 1 : 0), 0),
    messagesPerMonth: groups.reduce((sum, g) => sum + g.messagesPerMonth, 0),
    storedPerMonth: groups.reduce((sum, g) => sum + g.messagesPerMonth * g.seriesCount, 0),
    naiveMessagesPerMonth: naive(machineType, groups),
  };
}

/**
 * A hundred-series bundle would draw a hundred rows. Groups give up their tail
 * first, and only as far as the row budget requires -- a diagram that silently
 * dropped readings would be worse than no diagram, so whatever is not drawn is
 * counted in `hiddenMembers` and said out loud.
 */
function capRows(groups: ViewGroup[], maxMembers: number, maxRows: number): ViewGroup[] {
  const capped = groups.map((group) =>
    group.members.length > maxMembers
      ? {
          ...group,
          members: group.members.slice(0, maxMembers),
          hiddenMembers: group.members.length - maxMembers,
        }
      : group,
  );

  let rows = () => capped.reduce((sum, g) => sum + g.members.length + (g.hiddenMembers > 0 ? 1 : 0), 0);

  // Still too tall: trim the biggest group repeatedly rather than truncating
  // the list, so every measurement stays visible even if its contents do not.
  while (rows() > maxRows) {
    const biggest = capped.reduce((best, g) => (g.members.length > best.members.length ? g : best), capped[0]!);
    if (!biggest || biggest.members.length <= 1) break;
    biggest.members = biggest.members.slice(0, biggest.members.length - 1);
    biggest.hiddenMembers += 1;
  }

  return capped;
}

/** Every reading alone, states sampled on the fastest interval in use. */
function naive(machineType: MachineType, groups: ViewGroup[]): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (const group of groups) {
    if (!group.timed) continue;
    fastest = Math.min(fastest, REFERENCE_SECONDS / group.messagesPerMonth);
  }
  const stateInterval = Number.isFinite(fastest) ? fastest : 60;

  let total = 0;
  for (const group of groups) {
    total += group.timed
      ? group.messagesPerMonth * group.seriesCount
      : (REFERENCE_SECONDS / stateInterval) * group.seriesCount;
  }
  return total;
}
