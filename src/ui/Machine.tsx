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
} from '../../lib/engine/index.js';
import { machineLine } from '../../lib/wizard/machine-line.js';
import { compact, n } from './format.js';
import { useT } from './i18n.js';
import type { Key, T } from '../../lib/i18n/index.js';

/**
 * The composition line, kept exported because the fleet step prints the same
 * sentence under each machine type and the two must not drift.
 */
export function machineStructure(t: T, s: MachineTypeSummary, only?: MetricKind): string {
  return machineLine(t, s, only).structure;
}

function Figure({
  messages,
  perMachine,
  element,
}: {
  messages: number;
  perMachine?: number;
  element?: Key;
}) {
  const t = useT();
  return (
    <span class="mt-sum-fig">
      <b>{compact(messages)}</b>
      <span>
        {/* Which element, where the header counts one rather than all five --
            "messages / month" beside a figure that is only the measurements is
            how a reader concludes the arithmetic is broken. */}
        {element ? t('machine.elementPerMonth', { element: t(element) }) : t('machine.messagesPerMonth')}
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
 * @param only narrows the summary to one kind, and to that kind's messages.
 *   Measurements does this too, not just the elements step: a header totalling
 *   every element on a step that edits one is a figure that barely moves when
 *   you change what the step is for.
 */
export function MachineSummary({
  summary: s,
  only,
}: {
  summary: MachineTypeSummary;
  only?: MetricKind;
}) {
  const t = useT();
  const line = machineLine(t, s, only);

  if (line.empty) {
    return (
      <span class="mt-sum-empty">
        {only === undefined ? t('machine.nothingModelled') : t('machine.none')}
      </span>
    );
  }

  return (
    <>
      <span class="mt-sum-text">
        <span>{line.structure}</span>
        {line.mix && <span class="mt-sum-mix">{line.mix}</span>}
      </span>
      <Figure messages={line.messages} perMachine={line.perMachine} element={line.element} />
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
        <MachineSummary summary={summary} only={only} />
      </summary>
      <div class="metrics">{children}</div>
    </details>
  );
}
