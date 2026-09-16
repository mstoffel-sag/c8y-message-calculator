/**
 * Measurements. The core lesson of the wizard lives here (CONCEPT.md section 4).
 *
 * The vocabulary is the platform's, because a customer who leaves with the wrong
 * words models the wrong thing: a *series* is one named value over time -- what
 * the rest of the industry calls a datapoint -- and a *measurement type* is the
 * fragment that carries a set of series under one timestamp.
 *
 * The customer says what is measured and how often. The tool groups by interval
 * and puts each group in one measurement type, because a measurement carries one
 * timestamp -- so readings on the same tick can share one message, and readings
 * on different ticks never can.
 *
 * There is one table, not one per rhythm. A flag sent when it changes is a
 * measurement with one series in it; giving it a section and a name of its own
 * said it was a different kind of thing, which it is not.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { EmptyComponent, TeachComponent } from '../controls/fields.component.js';
import { ExplainerComponent } from '../diagram/explainer.component.js';
import { ProseComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';
import { SeriesMachineComponent } from './series-machine.component.js';

@Component({
  selector: 'c8y-mc-step-series',
  standalone: true,
  imports: [
    EmptyComponent,
    ExplainerComponent,
    ProseComponent,
    SeriesMachineComponent,
    TeachComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (machineTypes().length === 0) {
      <c8y-mc-empty>{{ 'series.empty' | t }}</c8y-mc-empty>
    } @else {
      <c8y-mc-teach [title]="'series.teach.title' | t">
        <c8y-mc-prose k="series.teach.body" />
      </c8y-mc-teach>

      <c8y-mc-explainer />

      @for (machineType of machineTypes(); track machineType.id) {
        <c8y-mc-series-machine [machineType]="machineType" />
      }
    }
  `,
})
export class StepSeriesComponent {
  private readonly store = inject(ScenarioStore);

  readonly machineTypes = computed(() => this.store.scenario().machineTypes);
}
