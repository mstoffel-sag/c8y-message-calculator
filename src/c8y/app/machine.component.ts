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
} from '../../../lib/engine/index.js';
import { machineLine } from '../../../lib/wizard/machine-line.js';
import { compact, n } from '../../../lib/format/index.js';
import type { Key, T } from '../../../lib/i18n/index.js';
import { CollapseService } from './collapse.service.js';
import { LocaleService } from './i18n/locale.service.js';

/**
 * The composition line, kept exported because the fleet step prints the same
 * sentence under each machine type and the two must not drift.
 */
export function machineStructure(t: T, s: MachineTypeSummary, only?: MetricKind): string {
  return machineLine(t, s, only).structure;
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

        @if (line().empty) {
          <span class="mc-mt-empty">{{ emptyLabel() }}</span>
        } @else {
          <span class="mc-mt-text">
            <span>{{ line().structure }}</span>
            @if (line().mix) {
              <span class="mc-mt-mix">{{ line().mix }}</span>
            }
          </span>
          <span class="mc-mt-fig">
            <b>{{ figure() }}</b>
            <span>
              {{ figureLabel() }}
              @if (line().perMachine !== undefined) {
                <!-- Per machine is a small number by construction, so it is
                     worth in full: "45,977 per machine" says something "46 k"
                     does not. -->
                &middot; {{ perMachineLabel() }}
              }
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

  readonly line = computed(() => machineLine(this.locales.t(), this.summary(), this.only()));

  readonly figure = computed(() => compact(this.line().messages));

  /** Which element the figure counts, where it counts one rather than all five. */
  readonly figureLabel = computed(() => {
    const t = this.locales.t();
    const element = this.line().element;
    return element
      ? t('machine.elementPerMonth', { element: t(element) })
      : t('machine.messagesPerMonth');
  });

  readonly emptyLabel = computed(() =>
    this.locales.t()(this.only() === undefined ? 'machine.nothingModelled' : 'machine.none'),
  );

  readonly machinesLabel = computed(() =>
    this.locales.t()('machine.machines', { count: n(this.machineType().machineCount) }),
  );

  readonly onlineLabel = computed(() =>
    this.locales.t()('machine.onlinePct', { pct: n(this.machineType().onlinePct) }),
  );

  readonly perMachineLabel = computed(() =>
    this.locales.t()('machine.perMachine', { count: n(this.line().perMachine ?? 0) }),
  );

  label(key: Key): string {
    return this.locales.t()(key);
  }

  onToggle(event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    this.collapse.toggle(this.machineType().id, !open);
  }
}
