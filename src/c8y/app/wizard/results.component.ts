/** Results: what the wizard produces. */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  measurementView,
  workbookFileName,
  workbookSheets,
} from '../../../../lib/engine/index.js';
import { n } from '../../../../lib/format/index.js';
import { buildXlsx } from '../../../../lib/xlsx/writer.js';
import { EmptyComponent } from '../controls/fields.component.js';
import { MeasurementDiagramComponent } from '../diagram/measurement-diagram.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { CommitmentComponent } from '../results/commitment.component.js';
import { HandoffComponent } from '../results/handoff.component.js';
import { PayloadsComponent } from '../results/payloads.component.js';
import { ResultsPanelsComponent } from '../results/results-panels.component.js';
import { ScenarioStore } from '../scenario.store.js';

@Component({
  selector: 'c8y-mc-step-results',
  standalone: true,
  imports: [
    CoreModule,
    EmptyComponent,
    CommitmentComponent,
    HandoffComponent,
    MeasurementDiagramComponent,
    PayloadsComponent,
    ResultsPanelsComponent,
    RichComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (machineTypes().length === 0) {
      <c8y-mc-empty>{{ 'results.empty' | t }}</c8y-mc-empty>
    } @else {
      <!-- The workbook download. Built in the browser: no upload, no service,
           nothing leaves the tenant. It mirrors the Configurator's own rows so
           the transfer is a column copy, and it carries quantities only --
           which is what makes it safe to send to a customer without checking
           first. -->
      <div class="mc-panel">
        <header>
          <h2>{{ 'workbook.heading' | t }}</h2>
          <span class="mc-sub-label">{{ 'workbook.sub' | t }}</span>
        </header>
        <div class="mc-body">
          <div class="mc-row mc-row-middle">
            <button type="button" class="btn btn-primary" (click)="download()">
              <i c8yIcon="download"></i>
              {{ 'workbook.download' | t }}
            </button>
            <p class="mc-hint mc-flex"><c8y-mc-rich k="workbook.sendIt" /></p>
          </div>

          <table class="table mc-table m-t-16">
            <tbody>
              @for (sheet of sheets; track sheet.name) {
                <tr>
                  <td style="width:130px"><b>{{ sheet.name | t }}</b></td>
                  <td class="mc-hint">{{ sheet.what | t }}</td>
                </tr>
              }
            </tbody>
          </table>

          <p class="mc-hint m-t-16">{{ 'workbook.builtHere' | t }}</p>
        </div>
      </div>

      <c8y-mc-handoff />

      <!-- Directly under the table: the table is one month per period and its
           D21 is the period's length; this is the same quantities across the
           term those two imply. Further down the page the two read as
           unrelated. -->
      <c8y-mc-commitment />

      <!-- The design the numbers came from, machine type by machine type.
           Somebody checking the estimate needs to see the shape that produced
           it, and the diagram says in one look what the counters only imply. -->
      @if (designs().length > 0) {
        <div class="mc-panel">
          <header>
            <h2>{{ 'design.heading' | t }}</h2>
            <span class="mc-sub-label">{{ 'design.sub' | t }}</span>
          </header>
          <div class="mc-body">
            @for (design of designs(); track design.key) {
              <div class="m-b-24">
                <div class="mc-row m-b-4">
                  <h3>{{ design.name }}</h3>
                  <span class="mc-mt-tag">{{ design.machines }}</span>
                  <span class="mc-mt-tag">{{ design.measurements }}</span>
                </div>
                <c8y-mc-measurement-diagram [view]="design.view" />
              </div>
            }
          </div>
        </div>
      }

      <c8y-mc-results-panels />

      <!-- The payloads are for whoever writes the device code, not for the
           person filling in the wizard. -->
      @if (expert()) {
        <c8y-mc-payloads />
      } @else {
        <p class="mc-hint m-t-16"><c8y-mc-rich k="payload.hidden" /></p>
      }
    }
  `,
})
export class StepResultsComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  protected readonly sheets = [
    { name: 'workbook.sheet.quote', what: 'workbook.sheet.quote.what' },
    { name: 'workbook.sheet.configurator', what: 'workbook.sheet.configurator.what' },
    { name: 'workbook.sheet.design', what: 'workbook.sheet.design.what' },
    { name: 'workbook.sheet.months', what: 'workbook.sheet.months.what' },
    { name: 'workbook.sheet.guidance', what: 'workbook.sheet.guidance.what' },
  ] as const;

  readonly machineTypes = computed(() => this.store.scenario().machineTypes);
  readonly expert = this.store.expert;

  readonly designs = computed(() => {
    const t = this.locales.t();
    const scenario = this.store.scenario();
    return scenario.machineTypes
      .map(machineType => ({
        key: machineType.id,
        name: machineType.name || t('machine.unnamed'),
        machines: t('machine.machines', { count: n(machineType.machineCount) }),
        view: measurementView(machineType, scenario.settings.fragmentPrefix),
      }))
      .filter(design => design.view.groups.length > 0)
      .map(design => ({
        ...design,
        measurements: t.plural('design.measurements', design.view.groups.length),
      }));
  });

  /**
   * The workbook, saved from the page.
   *
   * `file-saver` comes with the SDK and would do this in one line, but it
   * arrives as a transitive dependency of `@c8y/ngx-components` rather than as
   * something this app declares. Twelve lines of anchor is a smaller price than
   * a dependency nothing in this repo's manifest admits to.
   */
  download(): void {
    const scenario = this.store.scenario();
    const bytes = buildXlsx(workbookSheets(scenario, this.store.result()));
    // Copy into a fresh buffer: Blob wants an ArrayBuffer, and a typed array
    // view may sit inside a larger one.
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = workbookFileName(scenario);
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
