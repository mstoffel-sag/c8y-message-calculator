/**
 * The small shared controls, so the step components stay about the wizard.
 *
 * The preact build draws these itself because a static bundle has no design
 * system to draw from. Here they are thin wrappers over `@c8y/style`:
 * `.form-group`, `.form-control`, `.btn` and `c8y-form-group` are the shell's,
 * so a field in this app looks like a field in Cockpit without this repo having
 * an opinion about what that looks like. What survives the port is the
 * *behaviour* -- clamping, the empty-means-default retention box, the copy
 * button that says whether it worked -- which is where the thinking was.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';

/** A number, clamped to its range on the way out. */
@Component({
  selector: 'c8y-mc-num',
  standalone: true,
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-group" [title]="title() ?? ''">
      @if (label()) {
        <label>{{ label() }}</label>
      }
      <div class="input-group">
        <input
          type="number"
          class="form-control"
          [min]="min()"
          [attr.max]="max() ?? null"
          [step]="step()"
          [value]="value()"
          (input)="emit($any($event.target).value)"
        />
        @if (suffix()) {
          <span class="input-group-addon">{{ suffix() }}</span>
        }
      </div>
    </div>
  `,
})
export class NumComponent {
  readonly label = input<string>();
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input<number | undefined>(undefined);
  readonly step = input<number | 'any'>(1);
  readonly title = input<string>();
  readonly suffix = input<string>();

  readonly valueChange = output<number>();

  emit(raw: string): void {
    const parsed = Number(raw);
    const next = Number.isFinite(parsed) ? parsed : this.min();
    this.valueChange.emit(Math.min(this.max() ?? Infinity, Math.max(this.min(), next)));
  }
}

@Component({
  selector: 'c8y-mc-txt',
  standalone: true,
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-group">
      @if (label()) {
        <label>{{ label() }}</label>
      }
      <input
        type="text"
        class="form-control"
        [value]="value()"
        [placeholder]="placeholder() ?? ''"
        (input)="valueChange.emit($any($event.target).value)"
      />
    </div>
  `,
})
export class TxtComponent {
  readonly label = input<string>();
  readonly value = input.required<string>();
  readonly placeholder = input<string>();

  readonly valueChange = output<string>();
}

/**
 * How long the tenant keeps one type of thing.
 *
 * A retention rule in Cumulocity is attached to a type -- a measurement type, an
 * event type, an alarm type -- so this control belongs to the type and not to
 * the row that happens to render it.
 *
 * Empty means the tenant's default, which is why this is a bare input with a
 * placeholder rather than a `c8y-mc-num`: a spinner cannot be empty, and
 * pre-filling every row with 30 would say the customer had decided something
 * they have not even seen. Clearing the box hands the type back to the default.
 */
@Component({
  selector: 'c8y-mc-retention',
  standalone: true,
  imports: [CoreModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-group" [title]="'retention.title' | t">
      <div class="input-group">
        <input
          type="number"
          class="form-control"
          min="0"
          step="1"
          [value]="days() === undefined ? '' : days()"
          [placeholder]="fallback()"
          (input)="emit($any($event.target).value)"
        />
        <span class="input-group-addon">{{ unit() }}</span>
      </div>
      @if (days() === undefined) {
        <p class="text-muted small m-t-4 m-b-0">{{ 'retention.inherited' | t }}</p>
      }
    </div>
  `,
})
export class RetentionComponent {
  private readonly locales = inject(LocaleService);

  readonly days = input.required<number | undefined>();
  readonly fallback = input.required<number>();

  readonly daysChange = output<number | undefined>();

  readonly unit = computed(() =>
    this.locales.t().plural('unit.day', this.days() ?? this.fallback()),
  );

  emit(raw: string): void {
    const text = raw.trim();
    if (text === '') return this.daysChange.emit(undefined);
    const parsed = Number(text);
    this.daysChange.emit(Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined);
  }
}

/** The teaching box that opens most panels. */
@Component({
  selector: 'c8y-mc-teach',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-teach">
      <b>{{ title() }}</b>
      <div><ng-content /></div>
    </div>
  `,
})
export class TeachComponent {
  readonly title = input.required<string>();
}

/** Nothing to show yet, and why. */
@Component({
  selector: 'c8y-mc-empty',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="mc-empty"><ng-content /></div>`,
})
export class EmptyComponent {}
