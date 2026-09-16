/**
 * Cumulocity Message Calculator -- a guided wizard, inside the shell.
 *
 * Walks a customer from "what machines do you have" to "here are the nine
 * counters and the cells they go in", teaching the data model on the way. It
 * reports volume and nothing else: no prices, no billable units, no commitment
 * sizing. See CONCEPT.md.
 *
 * What the shell takes over from the standalone build's hand-drawn top bar: the
 * page title, the action bar, the language, the branding and the user menu. What
 * stays is what is specific to this tool -- the scenario's name, the three
 * figures that move as you type, and the step rail, which is `c8y-stepper`
 * rather than a row of buttons.
 *
 * The stepper is deliberately **not** `linear`. A linear stepper refuses to
 * advance past an invalid step, and this wizard has no invalid steps: an
 * unnamed series or a missing count is a *finding*, shown by the guidance panel
 * with what it would cost, not a barrier. The customer is describing a fleet,
 * not filling in a form.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { AlertService, CoreModule, StepperModule } from '@c8y/ngx-components';

import { compact, nf1 } from '../../../../lib/format/index.js';
import { blankScenario, conceptSection9Scenario } from '../../../../lib/presets/index.js';
import { normalise } from '../../../../lib/scenario/edits.js';
import { STEPS } from '../../../../lib/wizard/steps.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { FindingsComponent } from '../results/findings.component.js';
import { ScenarioStore } from '../scenario.store.js';
import { StepContractComponent } from './contract.component.js';
import { StepDiscreteComponent } from './discrete.component.js';
import { StepFleetComponent } from './fleet.component.js';
import { StepResultsComponent } from './results.component.js';
import { StepSeriesComponent } from './series.component.js';

@Component({
  selector: 'c8y-mc-wizard',
  standalone: true,
  imports: [
    CoreModule,
    FindingsComponent,
    StepContractComponent,
    StepDiscreteComponent,
    StepFleetComponent,
    StepResultsComponent,
    StepSeriesComponent,
    StepperModule,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-title>{{ 'app.title' | t }}</c8y-title>

    <c8y-action-bar-item placement="right">
      <label class="c8y-checkbox m-r-8" [title]="'app.expert.title' | t">
        <input type="checkbox" [checked]="expert()" (change)="expert.set($any($event.target).checked)" />
        <span></span>
        <span>{{ 'app.expert' | t }}</span>
      </label>
    </c8y-action-bar-item>

    <c8y-action-bar-item placement="right">
      <button type="button" class="btn btn-link" (click)="loadExample()">
        <i c8yIcon="flask"></i> {{ 'nav.loadExample' | t }}
      </button>
    </c8y-action-bar-item>

    <c8y-action-bar-item placement="right">
      <button type="button" class="btn btn-link" (click)="reset()">
        <i c8yIcon="trash"></i> {{ 'nav.reset' | t }}
      </button>
    </c8y-action-bar-item>

    <c8y-action-bar-item placement="right">
      <label class="btn btn-link mc-file">
        <i c8yIcon="upload"></i> {{ 'io.import' | t }}
        <input type="file" accept="application/json" (change)="importScenario($event)" hidden />
      </label>
    </c8y-action-bar-item>

    <c8y-action-bar-item placement="right">
      <button type="button" class="btn btn-link" (click)="exportScenario()">
        <i c8yIcon="download"></i> {{ 'io.export' | t }}
      </button>
    </c8y-action-bar-item>

    <div class="mc-shell" #shell>
      <div class="mc-topline">
        <div class="form-group mc-name">
          <label>{{ 'app.scenarioName' | t }}</label>
          <input
            type="text"
            class="form-control"
            [value]="scenario().name"
            (input)="rename($any($event.target).value)"
          />
          <p class="mc-hint">{{ 'app.tagline' | t }}</p>
        </div>

        <div class="mc-runner">
          @for (figure of figures(); track figure.key) {
            <div class="mc-fig" [class.mc-alt]="figure.alt">
              <b [class.mc-error]="figure.bad">{{ figure.value }}</b>
              <span>{{ figure.label }}</span>
            </div>
          }
        </div>
      </div>

      <c8y-stepper (onStepChange)="toTop()">
        @for (step of steps; track step.key) {
          <cdk-step [label]="step.titleKey | t">
            <div class="mc-step-head">
              <h1>{{ step.titleKey | t }}</h1>
              <p>{{ step.leadKey | t }}</p>
            </div>

            @switch (step.key) {
              @case ('fleet') { <c8y-mc-step-fleet /> }
              @case ('series') { <c8y-mc-step-series /> }
              @case ('discrete') { <c8y-mc-step-discrete /> }
              @case ('contract') { <c8y-mc-step-contract /> }
              @case ('results') { <c8y-mc-step-results /> }
            }

            <!-- Guidance follows the customer through every step, because a
                 warning is worth far more while the input that caused it is
                 still on screen. The results step shows the same panel in its
                 own place. -->
            @if (step.key !== 'results' && findingCount() > 0) {
              <c8y-mc-findings />
            }

            <c8y-stepper-buttons />
          </cdk-step>
        }
      </c8y-stepper>
    </div>
  `,
})
export class WizardComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);
  private readonly alerts = inject(AlertService);
  private readonly shell = viewChild<ElementRef<HTMLElement>>('shell');

  protected readonly steps = STEPS;

  readonly scenario = this.store.scenario;
  readonly expert = this.store.expert;
  readonly findingCount = computed(() => this.store.findings().length);

  readonly figures = computed(() => {
    const t = this.locales.t();
    const peak = this.store.result().peakMonth;
    const errors = this.store.errorCount();

    return [
      {
        key: 'peak',
        value: compact(peak.total),
        label: t('app.stat.peakMonth'),
        alt: false,
        bad: false,
      },
      {
        key: 'vsUnbundled',
        value: peak.total > 0 ? `${nf1.format(peak.naiveTotal / peak.total)}×` : '—',
        label: t('app.stat.vsUnbundled'),
        alt: true,
        bad: false,
      },
      {
        key: 'findings',
        value: String(this.findingCount()),
        label: errors > 0 ? t('app.stat.toFix', { count: errors }) : t('app.stat.findings'),
        alt: true,
        bad: errors > 0,
      },
    ];
  });

  rename(name: string): void {
    this.store.patch(scenario => ({ ...scenario, name }));
  }

  loadExample(): void {
    this.store.set(conceptSection9Scenario());
  }

  reset(): void {
    this.store.set(blankScenario());
  }

  exportScenario(): void {
    const scenario = this.store.scenario();
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${scenario.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'scenario'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  importScenario(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // normalise() so a file from an older build, or from the standalone one,
    // loads instead of taking the page down.
    void file.text().then(text => {
      try {
        this.store.set(normalise(JSON.parse(text)));
      } catch {
        // A file that will not parse leaves nothing on screen to explain
        // itself, so it has to say so somewhere. The standalone build uses
        // alert(); here the shell already has a place for this.
        this.alerts.addByText('danger', this.locales.t()('io.unreadable'));
      }
      // Cleared so that picking the same file twice fires a second change.
      input.value = '';
    });
  }

  /**
   * A new step starts at its own top.
   *
   * `window.scrollTo` is what the standalone build does, and it is wrong here:
   * the shell scrolls a content element, not the window, so the page would stay
   * where it was. Scrolling the wizard's own root into view works whichever
   * element is actually doing the scrolling.
   */
  toTop(): void {
    this.shell()?.nativeElement.scrollIntoView({ block: 'start' });
  }
}
