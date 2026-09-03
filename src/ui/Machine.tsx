/**
 * A machine type's editing block, folded down to one readable header.
 *
 * StepTimeSeries and StepDiscrete both edit the same machine types from
 * different angles, and both used to open with a full-height block per type.
 * Past two types that is a page nobody reads. So the block collapses, and the
 * header carries the summary: what was modelled, and what it costs in messages.
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
import { useT } from './i18n.js';
import type { Key, PluralBase, T } from '../../lib/i18n/index.js';

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

const ELEMENT_KEY: Record<SummaryElement['element'], Key> = {
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

/**
 * The composition line: the parts, the rhythm, then the measurement design.
 *
 * In that order on purpose. "10 datapoints in 3 measurement types" would be a
 * lie -- only the series and states are measurements; the event, alarm, inventory
 * entry and command are not in a measurement at all. Listing the parts first and the
 * measurement count last claims nothing about what contains what.
 */
export function machineStructure(t: T, s: MachineTypeSummary): string {
  const bits = [s.parts.map((p) => plural(t, p.kind, p.count)).join(', ')];
  const rhythm = intervalPhrase(t, s.intervals);
  if (rhythm) bits.push(rhythm);
  if (s.measurementTypes > 0) {
    bits.push(`${n(s.measurementTypes)} ${t.plural('measurementType', s.measurementTypes)}`);
  }
  return bits.filter(Boolean).join(' · ');
}

/** The message mix, by platform element rather than by counter. */
function mix(t: T, s: MachineTypeSummary): string {
  return s.elements
    .map((e) => `${t(ELEMENT_KEY[e.element])} ${compact(e.messages)}`)
    .join(' · ');
}

function Figure({ messages, perMachine }: { messages: number; perMachine?: number }) {
  const t = useT();
  return (
    <span class="mt-sum-fig">
      <b>{compact(messages)}</b>
      <span>
        {t('machine.messagesPerMonth')}
        {/* Per machine is a small number by construction, so it is worth in
            full: "45,977 per machine" says something "46 k" does not. */}
        {perMachine !== undefined && (
          <> &middot; {t('machine.perMachine', { count: n(perMachine) })}</>
        )}
      </span>
    </span>
  );
}

/**
 * @param only narrows the summary to one kind. StepDiscrete shows the same
 *   machine type once per element, so a full summary there would repeat the
 *   same three numbers three times; inside the Alarms panel the useful summary
 *   is the alarms.
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
  const t = useT();
  if (only !== undefined) {
    if (metrics === 0) return <span class="mt-sum-empty">{t('machine.none')}</span>;
    const element = ELEMENT_FOR_KIND[only];
    const messages = s.elements.find((e) => e.element === element)?.messages ?? 0;
    return (
      <>
        <span class="mt-sum-text">
          <span>{plural(t, only, metrics)}</span>
        </span>
        <Figure messages={messages} />
      </>
    );
  }

  if (!s.hasContent) return <span class="mt-sum-empty">{t('machine.nothingModelled')}</span>;

  return (
    <>
      <span class="mt-sum-text">
        <span>{machineStructure(t, s)}</span>
        <span class="mt-sum-mix">{mix(t, s)}</span>
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
  const t = useT();
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
          <span class="mt-name">{mt.name || t('machine.unnamed')}</span>
          <span class="mt-tag">{t('machine.machines', { count: n(mt.machineCount) })}</span>
          {mt.onlinePct < 100 && (
            <span class="mt-tag">{t('machine.onlinePct', { pct: n(mt.onlinePct) })}</span>
          )}
          {mt.protocol?.trim() && <span class="mt-tag">{mt.protocol}</span>}
        </span>
        <MachineSummary summary={summary} metrics={metrics} only={only} />
      </summary>
      <div class="metrics">{children}</div>
    </details>
  );
}
