/**
 * The one-line summary in a machine type's folded header.
 *
 * Both wizards draw this header and both used to build its sentence themselves,
 * from two copies of the same six helpers. They drifted the moment the header
 * had to answer a narrower question, so the sentence is built here and the
 * components only place it.
 *
 * The narrower question is `only`. A step that edits one element must summarise
 * that element and nothing else: on **Measurements**, a header totalling the
 * events, alarms, inventory writes and operations too is a number that does not
 * move when you change what the step is for -- a 10-series daily row going from
 * 31 messages to 310 is invisible inside a 15,159 that is mostly alarms, and the
 * reader concludes the arithmetic is broken rather than that the figure is
 * answering a different question.
 */

import type { MachineTypeSummary, MetricKind, SummaryElement } from '../engine/index.js';
import { compact, interval as fmtInterval, n } from '../format/index.js';
import type { Key, PluralBase, T } from '../i18n/index.js';

/**
 * The catalogue key for each kind's noun. A flag is a series like any other,
 * which is why there is no entry for one: it is named as a series, because that
 * is now all it is.
 */
const KIND_KEY: Record<MetricKind, PluralBase> = {
  continuous: 'kind.continuous',
  occurrence: 'kind.occurrence',
  condition: 'kind.condition',
  inventory: 'kind.inventory',
  command: 'kind.command',
};

export const ELEMENT_KEY: Record<SummaryElement['element'], Key> = {
  Measurements: 'element.measurements',
  Events: 'element.events',
  Alarms: 'element.alarms',
  Inventory: 'element.inventory',
  Operations: 'element.operations',
};

/** Which platform element a kind's messages land in. */
const ELEMENT_FOR_KIND: Record<MetricKind, SummaryElement['element']> = {
  continuous: 'Measurements',
  occurrence: 'Events',
  condition: 'Alarms',
  inventory: 'Inventory',
  command: 'Operations',
};

function plural(t: T, kind: MetricKind, count: number): string {
  return `${n(count)} ${t.plural(KIND_KEY[kind], count)}`;
}

/**
 * "every 60 s" / "every 60 s, every 15 min" / "4 intervals".
 *
 * Past three, naming them all is longer than the rest of the summary and says
 * less: the count is the thing that matters, because each interval is a
 * separate measurement that cannot be merged with the others.
 */
function intervalPhrase(t: T, intervals: number[]): string | null {
  if (intervals.length === 0) return null;
  if (intervals.length > 3) return t('machine.intervals', { count: intervals.length });
  return intervals.map(fmtInterval).join(', ');
}

export interface MachineLine {
  /** Nothing modelled in this scope, so the header says so instead. */
  empty: boolean;
  /** The composition: what was modelled here. */
  structure: string;
  /** The message mix by element -- empty when the line is scoped to one. */
  mix: string;
  /** The headline figure, already scoped. */
  messages: number;
  /** What the figure counts, for the label under it. */
  element?: Key;
  /** Absent where the header does not have the room to earn it. */
  perMachine?: number;
}

/**
 * The header's sentence and its figure.
 *
 * @param only narrows everything to one kind. The elements step shows the same
 *   machine type once per element, so a full summary there would repeat the
 *   same three numbers three times; inside the Alarms panel the useful summary
 *   is the alarms.
 */
export function machineLine(
  t: T,
  s: MachineTypeSummary,
  only?: MetricKind,
): MachineLine {
  if (only === undefined) {
    // The composition line: the parts, the rhythm, then the measurement design.
    //
    // In that order on purpose. "10 datapoints in 3 measurement types" would be
    // a lie -- only the series are measurements; the event, alarm, inventory
    // entry and command are not in a measurement at all. Listing the parts
    // first and the measurement count last claims nothing about what contains
    // what.
    const bits = [s.parts.map((p) => plural(t, p.kind, p.count)).join(', ')];
    const rhythm = intervalPhrase(t, s.intervals);
    if (rhythm) bits.push(rhythm);
    if (s.measurementTypes > 0) {
      bits.push(`${n(s.measurementTypes)} ${t.plural('measurementType', s.measurementTypes)}`);
    }
    return {
      empty: !s.hasContent,
      structure: bits.filter(Boolean).join(' · '),
      mix: s.elements.map((e) => `${t(ELEMENT_KEY[e.element])} ${compact(e.messages)}`).join(' · '),
      messages: s.total,
      perMachine: s.perMachine,
    };
  }

  const element = ELEMENT_FOR_KIND[only];
  const part = s.parts.find((p) => p.kind === only);
  const messages = s.elements.find((e) => e.element === element)?.messages ?? 0;

  // Series get the rhythm and the measurement-type count as well, because on
  // the step that edits them those two ARE the design -- the type count is the
  // number the reader is moving, and a header that left it out would be
  // narrower than the old one rather than merely more honest.
  const bits = [plural(t, only, part?.count ?? 0)];
  if (only === 'continuous') {
    const rhythm = intervalPhrase(t, s.intervals);
    if (rhythm) bits.push(rhythm);
    if (s.measurementTypes > 0) {
      bits.push(`${n(s.measurementTypes)} ${t.plural('measurementType', s.measurementTypes)}`);
    }
  }

  return {
    empty: part === undefined,
    structure: bits.filter(Boolean).join(' · '),
    mix: '',
    messages,
    element: ELEMENT_KEY[element],
    // Only where the scoped header replaces a full one that already carried it.
    // The elements step stacks four of these panels per machine type and the
    // figure there is small enough to read whole.
    perMachine: only === 'continuous' && s.online > 0 ? messages / s.online : undefined,
  };
}
