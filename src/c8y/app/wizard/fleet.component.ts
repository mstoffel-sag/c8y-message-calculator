/** Machines: types, counts, online share, and the protocol each one talks. */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import { machineTypeSummary } from '../../../../lib/engine/index.js';
import { n } from '../../../../lib/format/index.js';
import { PRESETS, blankMachineType } from '../../../../lib/presets/index.js';
import { PROTOCOLS } from '../../../../lib/presets/catalog.js';
import {
  addMachineType,
  patchMachineType,
  removeMachineType,
} from '../../../../lib/scenario/edits.js';
import { ChoiceComponent } from '../controls/choice.component.js';
import { EmptyComponent, NumComponent, TeachComponent, TxtComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { ProseComponent } from '../i18n/rich.component.js';
import { TPipe, TPluralPipe } from '../i18n/t.pipe.js';
import { machineStructure } from '../machine.component.js';
import { ScenarioStore } from '../scenario.store.js';

@Component({
  selector: 'c8y-mc-step-fleet',
  standalone: true,
  imports: [
    CoreModule,
    ChoiceComponent,
    EmptyComponent,
    NumComponent,
    ProseComponent,
    TeachComponent,
    TPipe,
    TPluralPipe,
    TxtComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-teach [title]="'fleet.teach.title' | t">
      <c8y-mc-prose k="fleet.teach.body" />
    </c8y-mc-teach>

    @if (machineTypes().length === 0) {
      <c8y-mc-empty>{{ 'fleet.empty' | t }}</c8y-mc-empty>
    } @else {
      <div class="mc-scroll">
        <table class="table mc-table">
          <thead>
            <tr>
              <th>{{ 'fleet.col.type' | t }}</th>
              <th style="width:230px">{{ 'fleet.col.talks' | t }}</th>
              <th class="text-right" style="width:150px">{{ 'fleet.col.count' | t }}</th>
              <th class="text-right" style="width:150px">{{ 'fleet.col.online' | t }}</th>
              <th style="width:90px"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.machineType.id) {
              <tr>
                <td>
                  <c8y-mc-txt
                    [value]="row.machineType.name"
                    [placeholder]="'fleet.namePlaceholder' | t"
                    (valueChange)="patch(row.machineType.id, { name: $event })"
                  />
                  <!-- The same sentence the series step's collapsed header
                       shows, from the same helper, so the two never disagree
                       about how many measurements a machine actually sends. -->
                  <div class="mc-hint m-t-4">{{ row.structure }}</div>
                </td>
                <td>
                  <!-- Descriptive, and the dropdown says so: no counter reads
                       this field. It is here because it is the first thing the
                       person who receives the finished workbook asks. -->
                  <c8y-mc-choice
                    [value]="row.machineType.protocol ?? ''"
                    [options]="protocols"
                    [placeholder]="'fleet.protocolPlaceholder' | t"
                    [otherLabel]="'fleet.protocolOther' | t"
                    (valueChange)="patch(row.machineType.id, { protocol: $event })"
                  />
                </td>
                <td class="text-right">
                  <c8y-mc-num
                    [value]="row.machineType.machineCount"
                    (valueChange)="patch(row.machineType.id, { machineCount: $event })"
                  />
                </td>
                <td class="text-right">
                  <c8y-mc-num
                    [value]="row.machineType.onlinePct"
                    [max]="100"
                    suffix="%"
                    [title]="'fleet.online.title' | t"
                    (valueChange)="patch(row.machineType.id, { onlinePct: $event })"
                  />
                </td>
                <td>
                  <button type="button" class="btn btn-link btn-sm" (click)="remove(row.machineType.id)">
                    {{ 'fleet.remove' | t }}
                  </button>
                </td>
              </tr>
            }
            <tr class="mc-total">
              <td>{{ 'fleet.total' | tPlural: machineTypes().length }}</td>
              <td></td>
              <td class="text-right">{{ total() }}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>
    }

    <div class="mc-row m-t-16">
      <span class="mc-lbl">{{ 'fleet.add' | t }}</span>
      @for (preset of presets; track preset.key) {
        <button type="button" class="btn btn-default btn-sm" [title]="preset.blurbKey | t" (click)="add(preset)">
          {{ preset.label }}
        </button>
      }
      <button type="button" class="btn btn-primary btn-sm" (click)="addBlank()">
        {{ 'fleet.addBlank' | t }}
      </button>
    </div>
    <p class="mc-hint">{{ 'fleet.presetNote' | t }}</p>
  `,
})
export class StepFleetComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  protected readonly presets = PRESETS;
  protected readonly protocols = PROTOCOLS;

  readonly machineTypes = computed(() => this.store.scenario().machineTypes);

  readonly rows = computed(() => {
    const t = this.locales.t();
    return this.machineTypes().map(machineType => ({
      machineType,
      structure:
        machineType.metrics.length === 0
          ? t('fleet.nothingModelled')
          : machineStructure(t, machineTypeSummary(machineType)),
    }));
  });

  readonly total = computed(() => {
    // Grouping separators are the locale's; see contract.component.ts.
    this.locales.locale();
    return n(this.machineTypes().reduce((sum, mt) => sum + mt.machineCount, 0));
  });

  patch(id: string, patch: Parameters<typeof patchMachineType>[2]): void {
    this.store.patch(scenario => patchMachineType(scenario, id, patch));
  }

  remove(id: string): void {
    this.store.patch(scenario => removeMachineType(scenario, id));
  }

  add(preset: (typeof PRESETS)[number]): void {
    this.store.patch(scenario => addMachineType(scenario, preset.create()));
  }

  addBlank(): void {
    this.store.patch(scenario => addMachineType(scenario, blankMachineType()));
  }
}
