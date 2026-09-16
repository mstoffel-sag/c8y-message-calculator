/**
 * Everything that is not a measurement: events, alarms, inventory, commands.
 * CONCEPT.md section 3.
 *
 * Events, alarms and inventory get confused with each other constantly, and each
 * confusion has a cost: alarms used as events produce noise, events used for
 * numbers produce data nobody can chart, and inventory used as a time series
 * bills every write while overwriting the value it just stored.
 *
 * Commands close the step. They are the same subject seen from the other end --
 * the platform talking to the machine rather than the machine talking to the
 * platform -- and that contrast is easier to teach on one screen than across two.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DEFAULT_RETENTION_DAYS } from '../../../../lib/engine/index.js';
import { EmptyComponent, TeachComponent } from '../controls/fields.component.js';
import { ProseComponent, RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';
import { CommandsComponent } from './commands.component.js';
import { DiscreteTableComponent, type KindSpec } from './discrete-table.component.js';

const SPECS: KindSpec[] = [
  {
    kind: 'occurrence',
    headingKey: 'discrete.occurrence.heading',
    elementKey: 'discrete.occurrence.element',
    counters: 'Events Created',
    questionKey: 'discrete.occurrence.question',
    teachKey: 'discrete.occurrence.teach',
    rateKey: 'discrete.occurrence.rate',
    placeholderKey: 'discrete.occurrence.placeholder',
    addKey: 'discrete.occurrence.add',
    retention: true,
  },
  {
    kind: 'condition',
    headingKey: 'discrete.condition.heading',
    elementKey: 'discrete.condition.element',
    counters: 'Alarms Created + Alarms Updated',
    questionKey: 'discrete.condition.question',
    teachKey: 'discrete.condition.teach',
    rateKey: 'discrete.condition.rate',
    placeholderKey: 'discrete.condition.placeholder',
    addKey: 'discrete.condition.add',
    retention: true,
  },
  {
    kind: 'inventory',
    headingKey: 'discrete.inventory.heading',
    elementKey: 'discrete.inventory.element',
    counters: 'Inventories Updated',
    questionKey: 'discrete.inventory.question',
    teachKey: 'discrete.inventory.teach',
    rateKey: 'discrete.inventory.rate',
    placeholderKey: 'discrete.inventory.placeholder',
    addKey: 'discrete.inventory.add',
    retention: false,
  },
];

@Component({
  selector: 'c8y-mc-step-discrete',
  standalone: true,
  imports: [
    CommandsComponent,
    DiscreteTableComponent,
    EmptyComponent,
    ProseComponent,
    RichComponent,
    TeachComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (machineTypes().length === 0) {
      <c8y-mc-empty>{{ 'wizard.addMachineFirst' | t }}</c8y-mc-empty>
    } @else {
      <c8y-mc-teach [title]="'discrete.teach.title' | t">
        <c8y-mc-prose k="discrete.teach.body" />
        <p class="mc-hint"><c8y-mc-rich k="discrete.retentionNote" [p]="retentionParams()" /></p>
      </c8y-mc-teach>

      @for (spec of specs; track spec.kind) {
        <div class="mc-panel mc-sub">
          <header>
            <h3>{{ spec.headingKey | t }}</h3>
            <span class="mc-sub-label">{{ spec.elementKey | t }} &rarr; {{ spec.counters }}</span>
          </header>
          <div class="mc-body">
            <c8y-mc-teach [title]="spec.questionKey | t">
              <c8y-mc-prose [k]="spec.teachKey" />
              @if (spec.kind === 'inventory') {
                <p class="mc-hint"><c8y-mc-rich k="discrete.inventory.registrationNote" /></p>
                <p class="mc-hint"><c8y-mc-rich k="discrete.inventory.retentionNote" /></p>
              }
            </c8y-mc-teach>

            @for (machineType of machineTypes(); track machineType.id) {
              <c8y-mc-discrete-table [spec]="spec" [machineType]="machineType" />
            }
          </div>
        </div>
      }

      <c8y-mc-commands [machineTypes]="machineTypes()" />
    }
  `,
})
export class StepDiscreteComponent {
  private readonly store = inject(ScenarioStore);

  protected readonly specs = SPECS;

  readonly machineTypes = computed(() => this.store.scenario().machineTypes);

  readonly retentionParams = computed(() => ({
    days: String(this.store.scenario().settings.retentionDays ?? DEFAULT_RETENTION_DAYS),
  }));
}
