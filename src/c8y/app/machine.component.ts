/**
 * A machine type's editing block, folded down to one readable header.
 *
 * The series and discrete steps both edit the same machine types from different
 * angles, and both would otherwise open with a full-height block per type. Past
 * two types that is a page nobody reads. So the block collapses, and the header
 * carries the summary: what was modelled, and what it costs in messages.
 *
 * `<details>` rather than a div and a class -- and rather than the SDK's list
 * group -- because the browser then gives the disclosure keyboard handling, the
 * open/closed state to assistive technology, and find-in-page inside a
 * collapsed block for free.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  machineTypeSummary,
  type MachineType,
  type MachineTypeSummary,
  type MetricKind,
  type SummaryElement,
} from '../../../lib/engine/index.js';
import { compact, interval as fmtInterval, n } from '../../../lib/format/index.js';
import type { Key, PluralBase, T } from '../../../lib/i18n/index.js';
import { CollapseService } from './collapse.service.js';
import { LocaleService } from './i18n/locale.service.js';

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
 * lie -- only the series are measurements; the event, alarm, inventory entry and
 * command are not in a measurement at all. Listing the parts first and the
 * measurement count last claims nothing about what contains what.
 */
export function machineStructure(t: T, s: MachineTypeSummary): string {
  const bits = [s.parts.map(p => plural(t, p.kind, p.count)).join(', ')];
  const rhythm = intervalPhrase(t, s.intervals);
  if (rhythm) bits.push(rhythm);
  if (s.measurementTypes > 0) {
    bits.push(`${n(s.measurementTypes)} ${t.plural('measurementType', s.measurementTypes)}`);
  }
  return bits.filter(Boolean).join(' · ');
}

@Component({
  selector: 'c8y-mc-machine',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="mc-mt" [open]="!collapsed()" (toggle)="onToggle($event)">
      <summary>
        <span class="mc-mt-head">
          <span class="mc-mt-name">{{ machineType().name || label('machine.unnamed') }}</span>
          <span class="mc-mt-tag">{{ machinesLabel() }}</span>
          @if (machineType().onlinePct < 100) {
            <span class="mc-mt-tag">{{ onlineLabel() }}</span>
          }
          @if (machineType().protocol?.trim()) {
            <span class="mc-mt-tag">{{ machineType().protocol }}</span>
          }
        </span>

        @if (only()) {
          @if (metrics() === 0) {
            <span class="mc-mt-empty">{{ label('machine.none') }}</span>
          } @else {
            <span class="mc-mt-text"><span>{{ kindLine() }}</span></span>
            <span class="mc-mt-fig">
              <b>{{ figure() }}</b>
              <span>{{ label('machine.messagesPerMonth') }}</span>
            </span>
          }
        } @else if (!summary().hasContent) {
          <span class="mc-mt-empty">{{ label('machine.nothingModelled') }}</span>
        } @else {
          <span class="mc-mt-text">
            <span>{{ structure() }}</span>
            <span class="mc-mt-mix">{{ mix() }}</span>
          </span>
          <span class="mc-mt-fig">
            <b>{{ figure() }}</b>
            <span>
              {{ label('machine.messagesPerMonth') }}
              <!-- Per machine is a small number by construction, so it is worth
                   in full: "45,977 per machine" says something "46 k" does not. -->
              &middot; {{ perMachineLabel() }}
            </span>
          </span>
        }
      </summary>
      <div class="mc-metrics"><ng-content /></div>
    </details>
  `,
})
export class MachineComponent {
  private readonly locales = inject(LocaleService);
  private readonly collapse = inject(CollapseService);

  readonly machineType = input.required<MachineType>();
  /**
   * Narrows the summary to one kind. The discrete step shows the same machine
   * type once per element, so a full summary there would repeat the same three
   * numbers three times; inside the Alarms panel the useful summary is alarms.
   */
  readonly only = input<MetricKind | undefined>(undefined);

  readonly summary = computed(() => machineTypeSummary(this.machineType()));
  readonly collapsed = computed(() => this.collapse.isCollapsed(this.machineType().id));

  readonly metrics = computed(() => {
    const only = this.only();
    const metrics = this.machineType().metrics;
    return only === undefined ? metrics.length : metrics.filter(m => m.kind === only).length;
  });

  readonly structure = computed(() => machineStructure(this.locales.t(), this.summary()));

  /** The message mix, by platform element rather than by counter. */
  readonly mix = computed(() => {
    const t = this.locales.t();
    return this.summary()
      .elements.map(e => `${t(ELEMENT_KEY[e.element])} ${compact(e.messages)}`)
      .join(' · ');
  });

  readonly kindLine = computed(() => {
    const only = this.only();
    return only ? plural(this.locales.t(), only, this.metrics()) : '';
  });

  readonly figure = computed(() => {
    const only = this.only();
    if (!only) return compact(this.summary().total);
    const element = ELEMENT_FOR_KIND[only];
    return compact(this.summary().elements.find(e => e.element === element)?.messages ?? 0);
  });

  readonly machinesLabel = computed(() =>
    this.locales.t()('machine.machines', { count: n(this.machineType().machineCount) }),
  );

  readonly onlineLabel = computed(() =>
    this.locales.t()('machine.onlinePct', { pct: n(this.machineType().onlinePct) }),
  );

  readonly perMachineLabel = computed(() =>
    this.locales.t()('machine.perMachine', { count: n(this.summary().perMachine) }),
  );

  label(key: Key): string {
    return this.locales.t()(key);
  }

  onToggle(event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    this.collapse.toggle(this.machineType().id, !open);
  }
}
