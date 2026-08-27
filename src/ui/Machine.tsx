/**
 * A machine type's editing block, folded down to one readable header.
 *
 * Steps 2, 3 and 4 all edit the same machine types from different angles, and
 * all three used to open with a full-height block per type. Past two types that
 * is a page nobody reads. So the block collapses, and the header carries the
 * summary: what was modelled, and what it costs in messages.
 *
 * <details> rather than a div and a class, because the browser then gives the
 * disclosure keyboard handling, the open/closed state to assistive technology,
 * and find-in-page inside a collapsed block for free.
 */

import type { ComponentChildren } from 'preact';

import {
  machineTypeSummary,
  type MachineType,
  type MachineTypeSummary,
  type MetricKind,
  type SummaryElement,
} from '../../lib/engine/index.js';
import { compact, interval as fmtInterval, n } from './format.js';

/** Singular and plural, in the words the step that owns each kind uses. */
const KIND_WORDS: Record<MetricKind, [string, string]> = {
  continuous: ['time series', 'time series'],
  // A flag is a series too -- one sent when the value moves rather than on a
  // tick. Calling it a "state" here said it was a different kind of thing.
  state: ['on-change series', 'on-change series'],
  occurrence: ['event', 'events'],
  condition: ['alarm', 'alarms'],
  fact: ['fact', 'facts'],
  command: ['command', 'commands'],
};

/** Which platform element a kind's messages land in. */
const ELEMENT_FOR_KIND: Record<MetricKind, SummaryElement['element']> = {
  continuous: 'Measurements',
  state: 'Measurements',
  occurrence: 'Events',
  condition: 'Alarms',
  fact: 'Inventory',
  command: 'Operations',
};

function plural(count: number, [one, many]: [string, string]): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

/**
 * "every 60 s" / "every 60 s, every 15 min" / "4 intervals".
 *
 * Past three, naming them all is longer than the rest of the summary and says
 * less: the count is the thing that matters, because each interval is a
 * separate measurement that cannot be merged with the others.
 */
function intervalPhrase(intervals: number[]): string | null {
  if (intervals.length === 0) return null;
  if (intervals.length > 3) return `${intervals.length} intervals`;
  return intervals.map(fmtInterval).join(', ');
}

/**
 * The composition line: the parts, the rhythm, then the measurement design.
 *
 * In that order on purpose. "10 datapoints in 3 measurement types" would be a
 * lie -- only the series and states are measurements; the event, alarm, fact
 * and command are not in a measurement at all. Listing the parts first and the
 * measurement count last claims nothing about what contains what.
 */
export function machineStructure(s: MachineTypeSummary): string {
  const bits = [s.parts.map((p) => plural(p.count, KIND_WORDS[p.kind])).join(', ')];
  const rhythm = intervalPhrase(s.intervals);
  if (rhythm) bits.push(rhythm);
  if (s.measurementTypes > 0) {
    bits.push(plural(s.measurementTypes, ['measurement type', 'measurement types']));
  }
  return bits.filter(Boolean).join(' · ');
}

/** The message mix, by platform element rather than by counter. */
function mix(s: MachineTypeSummary): string {
  return s.elements.map((e) => `${e.element} ${compact(e.messages)}`).join(' · ');
}

function Figure({ messages, perMachine }: { messages: number; perMachine?: number }) {
  return (
    <span class="mt-sum-fig">
      <b>{compact(messages)}</b>
      <span>
        messages / month
        {/* Per machine is a small number by construction, so it is worth in
            full: "45,977 per machine" says something "46 k" does not. */}
        {perMachine !== undefined && <> &middot; {n(perMachine)} per machine</>}
      </span>
    </span>
  );
}

/**
 * @param only narrows the summary to one kind. Step 3 shows the same machine
 *   type once per element, so a full summary there would repeat the same three
 *   numbers three times; inside the Alarms panel the useful summary is the
 *   alarms.
 */
export function MachineSummary({
  summary: s,
  metrics,
  only,
}: {
  summary: MachineTypeSummary;
  metrics: number;
  only?: MetricKind;
}) {
  if (only !== undefined) {
    if (metrics === 0) return <span class="mt-sum-empty">none</span>;
    const element = ELEMENT_FOR_KIND[only];
    const messages = s.elements.find((e) => e.element === element)?.messages ?? 0;
    return (
      <>
        <span class="mt-sum-text">
          <span>{plural(metrics, KIND_WORDS[only])}</span>
        </span>
        <Figure messages={messages} />
      </>
    );
  }

  if (!s.hasContent) return <span class="mt-sum-empty">nothing modelled yet</span>;

  return (
    <>
      <span class="mt-sum-text">
        <span>{machineStructure(s)}</span>
        <span class="mt-sum-mix">{mix(s)}</span>
      </span>
      <Figure messages={s.total} perMachine={s.perMachine} />
    </>
  );
}

export function Machine({
  machineType: mt,
  collapsed,
  onToggle,
  only,
  children,
}: {
  machineType: MachineType;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  only?: MetricKind;
  children: ComponentChildren;
}) {
  const summary = machineTypeSummary(mt);
  const metrics = only === undefined ? mt.metrics.length : mt.metrics.filter((m) => m.kind === only).length;

  return (
    <details
      class="mt"
      open={!collapsed}
      onToggle={(e) => onToggle(!(e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span class="mt-head">
          <span class="mt-name">{mt.name || 'Unnamed machine type'}</span>
          <span class="mt-tag">{n(mt.machineCount)} machines</span>
          {mt.onlinePct < 100 && <span class="mt-tag">{n(mt.onlinePct)} % online</span>}
          {mt.protocol?.trim() && <span class="mt-tag">{mt.protocol}</span>}
        </span>
        <MachineSummary summary={summary} metrics={metrics} only={only} />
      </summary>
      <div class="metrics">{children}</div>
    </details>
  );
}
