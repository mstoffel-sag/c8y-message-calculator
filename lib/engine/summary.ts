/**
 * A machine type in a line: what it is made of, and what it sends.
 *
 * Once a fleet has more than one machine type, the wizard's long editing blocks
 * stop being readable -- so they collapse, and this is what the collapsed
 * header has to say instead. Two questions, answered without opening anything:
 * what did I model here, and how much of the bill is it.
 *
 * Message figures are per REFERENCE_DAYS month at the machine type's own count
 * and online percentage. They are NOT the peak-month total the header shows:
 * that one runs the real calendar and adds onboarding. This is a like-for-like
 * comparison between machine types, which is what a summary is for.
 */

import { type MachineType, type MetricKind, type Counters } from './types.js';
import { REFERENCE_DAYS } from './calendar.js';
import { computeMachineTypeMonth, resolveBundles } from './compute.js';
import { intervalsOf } from './bundling.js';

/** How many datapoints of one kind the machine type carries. */
export interface SummaryPart {
  kind: MetricKind;
  count: number;
}

/**
 * Messages by platform element rather than by counter.
 *
 * The nine counters split created from updated, which matters when pasting into
 * the Configurator and nowhere else. A customer comparing machine types thinks
 * in elements, so an alarm's raise and clear are one line here.
 */
export interface SummaryElement {
  element: 'Measurements' | 'Events' | 'Alarms' | 'Inventory' | 'Operations';
  messages: number;
}

export interface MachineTypeSummary {
  machines: number;
  /** machines x onlinePct / 100 -- the ones actually sending. */
  online: number;
  datapoints: number;
  /**
   * Distinct measurements a machine sends: shared bundles, plus every series
   * travelling alone, plus every state -- a state cannot join an interval
   * bundle without making the bundle's series set vary, so it is always its own
   * fragment. Events, alarms, facts and commands are not measurements and are
   * not counted here.
   */
  measurementTypes: number;
  /** Distinct sampling intervals, in seconds, fastest first. */
  intervals: number[];
  /** Non-empty kinds only, in the order the wizard asks for them. */
  parts: SummaryPart[];
  /** Non-zero elements only, biggest first. */
  elements: SummaryElement[];
  perMachine: number;
  total: number;
  /** The same information sent one series per request, for the comparison. */
  naiveTotal: number;
  storedValues: number;
  days: number;
  /** False when nothing has been modelled yet, so the UI can stay quiet. */
  hasContent: boolean;
}

/** The order the wizard asks for them in, so the summary reads in step order. */
const KIND_ORDER: MetricKind[] = ['continuous', 'state', 'occurrence', 'condition', 'fact', 'command'];

const ELEMENT_OF: Array<{ element: SummaryElement['element']; keys: Array<keyof Counters> }> = [
  { element: 'Measurements', keys: ['measurementsCreated'] },
  { element: 'Events', keys: ['eventsCreated', 'eventsUpdated'] },
  { element: 'Alarms', keys: ['alarmsCreated', 'alarmsUpdated'] },
  { element: 'Inventory', keys: ['inventoriesCreated', 'inventoriesUpdated'] },
  { element: 'Operations', keys: ['operationsCreated', 'operationsUpdated'] },
];

export function machineTypeSummary(
  machineType: MachineType,
  days = REFERENCE_DAYS,
): MachineTypeSummary {
  const online = machineType.machineCount * (machineType.onlinePct / 100);
  const month = computeMachineTypeMonth(machineType, online, days);
  const { bundles, loneContinuous } = resolveBundles(machineType);

  const parts: SummaryPart[] = [];
  for (const kind of KIND_ORDER) {
    const count = machineType.metrics.filter((m) => m.kind === kind).length;
    if (count > 0) parts.push({ kind, count });
  }

  const elements: SummaryElement[] = [];
  for (const { element, keys } of ELEMENT_OF) {
    const messages = keys.reduce((sum, key) => sum + month.counters[key], 0);
    if (messages > 0) elements.push({ element, messages });
  }
  elements.sort((a, b) => b.messages - a.messages);

  return {
    machines: machineType.machineCount,
    online,
    datapoints: machineType.metrics.length,
    measurementTypes:
      bundles.filter((b) => b.members.length > 0).length +
      loneContinuous.length +
      machineType.metrics.filter((m) => m.kind === 'state').length,
    intervals: intervalsOf(machineType),
    parts,
    elements,
    perMachine: online > 0 ? month.total / online : 0,
    total: month.total,
    naiveTotal: month.naiveTotal,
    storedValues: month.storedValues,
    days,
    hasContent: machineType.metrics.length > 0,
  };
}
