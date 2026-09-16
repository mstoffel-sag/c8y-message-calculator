/**
 * Type the number, pick the unit. The wizard's other input control.
 *
 * The unit is local state, not derived from the incoming value on every render.
 * That matters more than it looks: typing "0.5" with the unit on hours makes
 * 1800 seconds, which would re-derive as "30 min" and yank the dropdown out
 * from under the cursor mid-edit. The unit only re-derives when the value
 * arrives from somewhere else -- a preset, an import, an undo.
 *
 * The number is held as text for the same reason. "1." and "" are legal states
 * on the way to a real value, and a control that rewrites them as you type is
 * unusable.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  cadenceToPeriod,
  periodToCadence,
  unitsForKind,
  type RateUnit,
} from '../../../../lib/engine/cadence.js';
import {
  DURATION_UNITS,
  splitDuration,
  toSeconds,
  type DurationUnit,
} from '../../../../lib/engine/duration.js';
import type { Cadence, MetricKind } from '../../../../lib/engine/types.js';
import { LocaleService } from '../i18n/locale.service.js';

@Component({
  selector: 'c8y-mc-value-unit',
  standalone: true,
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-group" [title]="title() ?? ''">
      @if (label()) {
        <label>{{ label() }}</label>
      }
      <div class="input-group">
        @if (prefix()) {
          <span class="input-group-addon">{{ prefix() }}</span>
        }
        <input
          type="number"
          class="form-control"
          min="0"
          step="any"
          [value]="text()"
          (input)="retype($any($event.target).value)"
        />
        <!-- Selected on the options, not with [value] on the select: see
             choice.component.ts. -->
        <select class="form-control mc-unit" (change)="reunit($any($event.target).value)">
          @for (unit of units(); track unit) {
            <option [value]="unit" [selected]="unit === localUnit()">{{ unitLabel(unit) }}</option>
          }
        </select>
      </div>
      @if (hint()) {
        <p class="text-muted small m-t-4 m-b-0">{{ hint() }}</p>
      }
    </div>
  `,
})
export class ValueUnitComponent<U extends string> {
  private readonly locales = inject(LocaleService);

  readonly label = input<string>();
  readonly value = input.required<number>();
  readonly unit = input.required<U>();
  readonly units = input.required<readonly U[]>();
  readonly title = input<string>();
  readonly hint = input<string>();
  /** e.g. "every", shown inside the control. */
  readonly prefix = input<string>();

  readonly changed = output<{ value: number; unit: U }>();

  readonly localUnit = signal<U | undefined>(undefined);
  readonly text = signal('');

  constructor() {
    effect(() => {
      const value = this.value();
      const unit = this.unit();
      // Only when the incoming pair is not the one this control just produced.
      untracked(() => {
        if (unit === this.localUnit() && Math.abs(Number(this.text()) - value) < 1e-9) return;
        this.localUnit.set(unit);
        this.text.set(String(value));
      });
    });
  }

  unitLabel(unit: U): string {
    return this.locales.t().plural(`unit.${unit as DurationUnit | 'month' | 'year'}`, 1);
  }

  retype(raw: string): void {
    this.text.set(raw);
    this.push(raw, this.localUnit() ?? this.unit());
  }

  reunit(raw: string): void {
    const next = raw as U;
    this.localUnit.set(next);
    this.push(this.text(), next);
  }

  private push(rawText: string, rawUnit: U): void {
    const parsed = Number(rawText);
    if (!Number.isFinite(parsed) || parsed <= 0) return; // mid-edit, leave it be
    this.changed.emit({ value: parsed, unit: rawUnit });
  }
}

/** A sampling interval, in seconds. */
@Component({
  selector: 'c8y-mc-duration',
  standalone: true,
  imports: [ValueUnitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-value-unit
      [label]="label()"
      [title]="title()"
      [hint]="hint()"
      [prefix]="prefix()"
      [value]="split().value"
      [unit]="split().unit"
      [units]="units()"
      (changed)="secondsChange.emit(toSeconds($event.value, $event.unit))"
    />
  `,
})
export class DurationComponent {
  readonly seconds = input.required<number>();
  readonly units = input<readonly DurationUnit[]>(DURATION_UNITS);
  readonly label = input<string>();
  readonly title = input<string>();
  readonly hint = input<string>();
  readonly prefix = input<string>();

  readonly secondsChange = output<number>();

  readonly split = computed(() => splitDuration(this.seconds()));
  protected readonly toSeconds = toSeconds;
}

/**
 * How often something happens, asked as the period between occurrences -- the
 * same entry method as the sampling interval, because "every four hours" is a
 * sentence a customer can answer and "0.1666 per hour" is arithmetic.
 */
@Component({
  selector: 'c8y-mc-every',
  standalone: true,
  imports: [ValueUnitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-value-unit
      [label]="label()"
      [title]="title()"
      [hint]="hint()"
      [prefix]="everyWord()"
      [value]="period().value"
      [unit]="period().unit"
      [units]="units()"
      (changed)="cadenceChange.emit(toCadence($event.value, $event.unit))"
    />
  `,
})
export class EveryComponent {
  private readonly locales = inject(LocaleService);

  readonly cadence = input.required<Cadence>();
  readonly kind = input.required<MetricKind>();
  readonly label = input<string>();
  readonly title = input<string>();
  readonly hint = input<string>();

  readonly cadenceChange = output<Cadence>();

  readonly period = computed(() => cadenceToPeriod(this.cadence()));
  readonly units = computed(() => unitsForKind(this.kind()));
  readonly everyWord = computed(() => this.locales.t()('every.prefix'));

  toCadence(value: number, unit: RateUnit): Cadence {
    return periodToCadence(value, unit, this.cadence());
  }
}
