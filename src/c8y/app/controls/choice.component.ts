/**
 * The wizard's one input control: a dropdown of sensible values that can always
 * be escaped.
 *
 * Every datapoint column uses this, so a customer is never handed a blank box
 * and two people modelling the same fleet reach the same numbers. Picking
 * "Other" reveals a free field -- a catalogue that cannot be escaped is worse
 * than no catalogue -- and a value that is not in the list arrives showing that
 * field already open, so an imported scenario never silently snaps to a preset.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import { groupKeyFor, type Choice } from '../../../../lib/presets/catalog.js';
import { LocaleService } from '../i18n/locale.service.js';

/** Not a value any catalogue uses, so it cannot collide with a real option. */
const OTHER = '\u0000other';

@Component({
  selector: 'c8y-mc-choice',
  standalone: true,
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-group" [title]="title() ?? ''">
      @if (label()) {
        <label>{{ label() }}</label>
      }
      <!-- The selected option is marked on the options, not with [value] on
           the select. Angular sets an element's property bindings before it
           fills in that element's children, so on the first pass the select
           would be told to select a value none of its options carried yet, and
           the binding is not re-run once they arrive. -->
      <select class="form-control" (change)="pick($any($event.target).value)">
        @for (group of groups(); track $index) {
          @if (group.label) {
            <optgroup [label]="group.label">
              @for (option of group.items; track option.value) {
                <option [value]="option.value" [selected]="isSelected(option.value)">
                  {{ labelOf(option) }}
                </option>
              }
            </optgroup>
          } @else {
            @for (option of group.items; track option.value) {
              <option [value]="option.value" [selected]="isSelected(option.value)">
                {{ labelOf(option) }}
              </option>
            }
          }
        }
        @if (allowOther()) {
          <option [value]="other" [selected]="custom()">{{ otherText() }}</option>
        }
      </select>

      @if (custom()) {
        <div class="input-group m-t-4">
          <input
            class="form-control"
            [type]="kind() === 'number' ? 'number' : 'text'"
            step="any"
            [attr.min]="kind() === 'number' ? 0 : null"
            [value]="value()"
            [placeholder]="placeholder() ?? ''"
            (input)="typed($any($event.target).value)"
          />
          @if (suffix()) {
            <span class="input-group-addon">{{ suffix() }}</span>
          }
        </div>
      }
    </div>
  `,
})
export class ChoiceComponent<T extends string | number> {
  private readonly locales = inject(LocaleService);
  protected readonly other = OTHER;

  readonly label = input<string>();
  readonly value = input.required<T>();
  readonly options = input.required<Array<Choice<T>>>();
  /** How to read a custom entry back. */
  readonly kind = input<'text' | 'number'>('text');
  readonly title = input<string>();
  readonly placeholder = input<string>();
  readonly suffix = input<string>();
  readonly otherLabel = input<string>();
  /** Off for closed sets -- "Other" makes no sense for "which measurement". */
  readonly allowOther = input(true);

  readonly valueChange = output<T>();

  /** Sticky: choosing "Other" keeps the field open even before anything is typed. */
  private readonly forceCustom = signal(false);

  private readonly known = computed(() => this.options().some(o => o.value === this.value()));
  readonly custom = computed(() => this.allowOther() && (this.forceCustom() || !this.known()));
  readonly otherText = computed(() => this.otherLabel() ?? this.locales.t()('choice.other'));

  /** Consecutive options sharing a group heading, in the catalogue's order. */
  readonly groups = computed(() => {
    const t = this.locales.t();
    const out: Array<{ label: string | undefined; items: Array<Choice<T>> }> = [];
    for (const option of this.options()) {
      const key = groupKeyFor(option.group);
      const label = option.group === undefined ? undefined : key ? t(key) : option.group;
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(option);
      else out.push({ label, items: [option] });
    }
    return out;
  });

  isSelected(value: T): boolean {
    return !this.custom() && value === this.value();
  }

  /** An option names itself unless it is prose, in which case it carries a key. */
  labelOf(option: Choice<T>): string {
    return option.labelKey
      ? this.locales.t()(option.labelKey)
      : (option.label ?? String(option.value));
  }

  pick(raw: string): void {
    if (raw === OTHER) {
      this.forceCustom.set(true);
      return;
    }
    this.forceCustom.set(false);
    const option = this.options().find(o => String(o.value) === raw);
    if (option) this.valueChange.emit(option.value);
  }

  typed(raw: string): void {
    this.valueChange.emit((this.kind() === 'number' ? Number(raw) : raw) as T);
  }
}
