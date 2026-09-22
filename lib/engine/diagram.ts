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

import { seriesCountOf, seriesIn, typesIn, type MachineType, type Metric } from './types.js';
import { resolveBundles } from './compute.js';
import { REFERENCE_DAYS, SECONDS_PER_DAY } from './calendar.js';
import { ownFragmentName, seriesNameOf } from './payload.js';
import { bundleFragmentName } from './bundling.js';

const REFERENCE_SECONDS = REFERENCE_DAYS * SECONDS_PER_DAY;

export interface ViewMember {
  metricId: string;
  name: string;
  unit: string;
  /**
   * How many series this row stands for -- 1 for a named reading, 450 for a
   * row that says "PLC tags". Drawn on the row, because a single sensor pill
   * standing for 450 readings is a picture that lies.
   */
  seriesCount: number;
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
  /** Every series in the envelope, including any row not drawn. */
  seriesCount: number;
  /**
   * Measurement types these series actually travel in: one, unless there are
   * more series than the platform recommends putting in a measurement, in
   * which case as few as the recommendation allows. Drawn as a badge on the
   * envelope, because the envelope is then not one message but this many.
   */
  types: number;
  /** Sends per month of one of those types -- the tick rate. */
  ticksPerMonth: number;
  messagesPerMonth: number;
}

export interface MeasurementView {
  groups: ViewGroup[];
  /** Rows to draw: every displayed member, in group order. */
  rowCount: number;
  messagesPerMonth: number;
  /** Readings stored per month -- unchanged by how they are grouped. */
  storedPerMonth: number;
  /** Every series in a measurement of its own -- the counterfactual. */
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
    seriesCount: seriesCountOf(metric),
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
    const ticks = REFERENCE_SECONDS / Math.max(bundle.intervalSeconds, 1e-9);
    const series = seriesIn(members);
    const types = typesIn(members);
    groups.push({
      id: bundle.id,
      fragmentName: bundleFragmentName(prefix, machineType.name, bundle),
      intervalSeconds: bundle.intervalSeconds,
      // Shared is about the picture: one envelope, more than one thing in it.
      // A single row standing for 450 tags shares its envelope with 449
      // readings nobody named, which is exactly what the wide box is for --
      // unless each of them is sent on its own, in which case there are as
      // many envelopes as readings and nothing is shared at all.
      shared: series > types,
      timed: true,
      members: members.map(member),
      hiddenMembers: 0,
      seriesCount: series,
      types,
      ticksPerMonth: ticks,
      messagesPerMonth: ticks * types,
    });
  }

  // Interval readings sitting alone: one message per sample, all to themselves.
  for (const metric of loneContinuous) {
    const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
    const ticks = REFERENCE_SECONDS / Math.max(seconds, 1e-9);
    const series = seriesCountOf(metric);
    const types = typesIn([metric]);
    groups.push({
      id: metric.id,
      fragmentName: ownFragmentName(prefix, metric),
      intervalSeconds: seconds,
      shared: series > types,
      timed: true,
      members: [member(metric)],
      hiddenMembers: 0,
      seriesCount: series,
      types,
      ticksPerMonth: ticks,
      messagesPerMonth: ticks * types,
    });
  }

  const capped = capRows(groups, maxMembers, maxRows);

  return {
    groups: capped,
    rowCount: capped.reduce((sum, g) => sum + g.members.length + (g.hiddenMembers > 0 ? 1 : 0), 0),
    messagesPerMonth: groups.reduce((sum, g) => sum + g.messagesPerMonth, 0),
    // Every series is read once a tick whatever it travels in, so this is the
    // tick rate times the series -- not the message count, which the split
    // multiplies and storage does not.
    storedPerMonth: groups.reduce((sum, g) => sum + g.ticksPerMonth * g.seriesCount, 0),
    naiveMessagesPerMonth: naive(groups),
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

/** Every reading in a measurement of its own -- the counterfactual, section 5. */
function naive(groups: ViewGroup[]): number {
  let total = 0;
  for (const group of groups) total += group.ticksPerMonth * group.seriesCount;
  return total;
}
