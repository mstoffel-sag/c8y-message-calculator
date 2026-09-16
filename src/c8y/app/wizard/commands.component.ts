/**
 * Commands: the closing section of the discrete step. CONCEPT.md section 3.
 *
 * The one element that runs the other way, and the one people leave out of
 * estimates entirely. It sits with events, alarms and inventory rather than in a
 * step of its own -- the four together are "everything that is not a
 * measurement", and putting commands last is what makes the direction visible:
 * three sections of the machine talking, then one of the platform talking back.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  DEFAULT_RETENTION_DAYS,
  perMonthEquivalent,
  type Cadence,
  type MachineType,
} from '../../../../lib/engine/index.js';
import { nf1 } from '../../../../lib/format/index.js';
import { COMMANDS, TRANSITIONS, type Choice } from '../../../../lib/presets/catalog.js';
import {
  addDatapoint,
  patchCadence,
  removeMetric,
  setCadence,
  setDatapointName,
  setMetricRetentionDays,
} from '../../../../lib/scenario/edits.js';
import { ChoiceComponent } from '../controls/choice.component.js';
import { EveryComponent } from '../controls/duration.component.js';
import { RetentionComponent, TeachComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { ProseComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { MachineComponent } from '../machine.component.js';
import { ScenarioStore } from '../scenario.store.js';

const COMMAND_OPTIONS: Array<Choice<string>> = [
  { value: '', labelKey: 'commands.chooseOne' },
  ...COMMANDS.map(seed => ({ value: seed.name, label: seed.name, group: seed.group })),
];

@Component({
  selector: 'c8y-mc-command-table',
  standalone: true,
  imports: [
    CoreModule,
    ChoiceComponent,
    EveryComponent,
    MachineComponent,
    RetentionComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-machine [machineType]="machineType()" only="command">
      <div class="mc-row m-b-8">
        <button type="button" class="btn btn-default btn-sm" (click)="add()">
          {{ 'commands.add' | t }}
        </button>
      </div>

      @if (rows().length === 0) {
        <p class="mc-hint m-b-0">{{ 'commands.none' | t }}</p>
      } @else {
        <div class="mc-scroll">
          <table class="table mc-table mc-dp">
            <thead>
              <tr>
                <!-- Trimmed to make room for the retention column: the German
                     row was overflowing its wrapper and taking the delete button
                     off-screen with it. -->
                <th style="min-width:180px">{{ 'commands.col.command' | t }}</th>
                <th style="min-width:230px">{{ 'commands.col.howOften' | t }}</th>
                <th style="min-width:230px">{{ 'commands.col.transitions' | t }}</th>
                <!-- min-width, not width: the transitions dropdown is wide and
                     this was the only column that could give, so it collapsed
                     into three wrapped lines when the retention column arrived.
                     The row scrolls in its wrapper instead. -->
                <th class="text-right" style="min-width:130px">{{ 'commands.col.each' | t }}</th>
                <th style="min-width:130px">{{ 'retention.col' | t }}</th>
                <th style="width:34px"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.metric.id) {
                <tr>
                  <td>
                    <c8y-mc-choice
                      [value]="row.metric.name"
                      [options]="commandOptions"
                      [placeholder]="'commands.namePlaceholder' | t"
                      (valueChange)="rename(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-every
                      [cadence]="row.metric.cadence"
                      kind="command"
                      [hint]="row.rateHint"
                      (cadenceChange)="recadence(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-choice
                      [value]="row.transitions"
                      kind="number"
                      [options]="transitions"
                      [suffix]="'commands.transitionsSuffix' | t"
                      (valueChange)="retransition(row.metric.id, $event)"
                    />
                  </td>
                  <td class="text-right">
                    <b>{{ 1 + row.transitions }}</b>
                    <div class="mc-hint">{{ row.breakdown }}</div>
                  </td>
                  <td>
                    <!-- An operation is one document; its status transitions
                         update it as it runs rather than adding more. So the
                         rule governs one stored operation per command. -->
                    <c8y-mc-retention
                      [days]="row.metric.retentionDays"
                      [fallback]="defaultRetention()"
                      (daysChange)="keep(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <button type="button" class="btn btn-link btn-sm" (click)="drop(row.metric.id)">&times;</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </c8y-mc-machine>
  `,
})
export class CommandTableComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  protected readonly commandOptions = COMMAND_OPTIONS;
  protected readonly transitions = TRANSITIONS;

  readonly machineType = input.required<MachineType>();

  readonly defaultRetention = computed(
    () => this.store.scenario().settings.retentionDays ?? DEFAULT_RETENTION_DAYS,
  );

  readonly rows = computed(() => {
    const t = this.locales.t();
    return this.machineType()
      .metrics.filter(m => m.kind === 'command')
      .map(metric => {
        const transitions = metric.cadence.mode === 'command' ? metric.cadence.transitions : 0;
        return {
          metric,
          transitions,
          rateHint: t('commands.perMachineMonth', {
            count: nf1.format(perMonthEquivalent(metric.cadence)),
          }),
          breakdown: t('commands.breakdown', { count: transitions }),
        };
      });
  });

  add(): void {
    this.store.patch(s => addDatapoint(s, this.machineType().id, 'command'));
  }

  rename(metricId: string, name: string): void {
    this.store.patch(s => setDatapointName(s, this.machineType().id, metricId, name));
  }

  recadence(metricId: string, cadence: Cadence): void {
    this.store.patch(s => setCadence(s, this.machineType().id, metricId, cadence));
  }

  retransition(metricId: string, transitions: number): void {
    this.store.patch(s => patchCadence(s, this.machineType().id, metricId, { transitions }));
  }

  keep(metricId: string, days: number | undefined): void {
    this.store.patch(s => setMetricRetentionDays(s, this.machineType().id, metricId, days));
  }

  drop(metricId: string): void {
    this.store.patch(s => removeMetric(s, this.machineType().id, metricId));
  }
}

@Component({
  selector: 'c8y-mc-commands',
  standalone: true,
  imports: [CommandTableComponent, ProseComponent, TeachComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-panel mc-sub">
      <header>
        <h3>{{ 'commands.heading' | t }}</h3>
        <span class="mc-sub-label">
          {{ 'commands.element' | t }} &rarr; Operations Created + Operations Updated
        </span>
      </header>
      <div class="mc-body">
        <c8y-mc-teach [title]="'commands.teach.title' | t">
          <c8y-mc-prose k="commands.teach.body" />
        </c8y-mc-teach>

        @for (machineType of machineTypes(); track machineType.id) {
          <c8y-mc-command-table [machineType]="machineType" />
        }
      </div>
    </div>
  `,
})
export class CommandsComponent {
  readonly machineTypes = input.required<MachineType[]>();
}
