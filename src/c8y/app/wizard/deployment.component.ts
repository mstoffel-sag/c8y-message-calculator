/**
 * Deployment and add-ons: the second section of the contract step.
 *
 * These are the Configurator line items the fleet cannot imply. The tool
 * collects quantities and hands them back with their cell references so nobody
 * retypes the quote from memory. It does not price them, rank them or
 * recommend one -- CONCEPT.md section 1.
 *
 * Every column here is a contract period, which is why this is a section and not
 * a screen: the periods it is asking about are defined immediately above it.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  ASKED_LINE_ITEMS,
  cellFor,
  storageForPeriod,
  type LineItem,
} from '../../../../lib/engine/index.js';
import {
  commercialBool,
  commercialNumber,
  copyCommercialAcross,
  setCommercial,
} from '../../../../lib/scenario/edits.js';
import { TeachComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { ProseComponent, RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

const GROUPS = ['Deployment', 'Core Metrics', 'Add-Ons', 'Support'] as const;

/** One line item in one period, with everything the cell needs to draw itself. */
interface Cell {
  periodIndex: number;
  reference: string;
  checked: boolean;
  checkLabel: string;
  /** What is typed in the box. Empty where the estimate is showing through. */
  stated: number | '';
  /** The tool's own figure, shown as a placeholder rather than as a value. */
  placeholder: string;
  hint: string;
}

interface Row {
  item: LineItem;
  help: string;
  cells: Cell[];
}

@Component({
  selector: 'c8y-mc-deployment',
  standalone: true,
  imports: [CoreModule, ProseComponent, RichComponent, TeachComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-panel mc-sub">
      <header>
        <h3>{{ 'deployment.heading' | t }}</h3>
        <span class="mc-sub-label">{{ 'deployment.sub' | t }}</span>
      </header>
      <div class="mc-body">
        <c8y-mc-teach [title]="'deployment.teach.title' | t">
          <c8y-mc-prose k="deployment.teach.body" />
        </c8y-mc-teach>

        <div class="mc-scroll">
          <table class="table mc-table">
            <thead>
              <tr>
                <th style="min-width:280px">{{ 'deployment.col.item' | t }}</th>
                <th>{{ 'deployment.col.unit' | t }}</th>
                @for (period of periods(); track period.index) {
                  <th class="text-right" style="min-width:110px">{{ period.label }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (group of groups(); track group.name) {
                <tr>
                  <td [attr.colspan]="2 + periods().length" class="mc-group-row">{{ group.name }}</td>
                </tr>
                @for (row of group.rows; track row.item.key) {
                  <tr>
                    <td>
                      <div class="mc-strong">{{ row.item.label }}</div>
                      @if (row.help) {
                        <div class="mc-hint m-t-4 mc-help">{{ row.help }}</div>
                      }
                    </td>
                    <td class="mc-hint mc-nowrap">{{ row.item.unit }}</td>
                    @for (cell of row.cells; track cell.periodIndex) {
                      <td class="text-right">
                        @if (row.item.source === 'choice') {
                          <label class="c8y-checkbox mc-check-right">
                            <input
                              type="checkbox"
                              [checked]="cell.checked"
                              (change)="setChoice(cell.periodIndex, row.item.key, $any($event.target).checked)"
                            />
                            <span></span>
                            <span>{{ cell.checkLabel }}</span>
                          </label>
                        } @else {
                          <input
                            type="number"
                            class="form-control text-right"
                            min="0"
                            step="any"
                            [value]="cell.stated"
                            [placeholder]="cell.placeholder"
                            (input)="setNumber(cell.periodIndex, row.item.key, $any($event.target).value)"
                          />
                          @if (cell.hint) {
                            <div class="mc-hint m-t-4">{{ cell.hint }}</div>
                          }
                        }
                        <div class="mc-cell">{{ cell.reference }}</div>
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (periods().length > 1) {
          <div class="mc-row m-t-16">
            <button type="button" class="btn btn-default btn-sm" (click)="copyAcross()">
              {{ 'deployment.copyAcross' | t }}
            </button>
            <span class="mc-hint">{{ 'deployment.copyAcross.hint' | t }}</span>
          </div>
        }

        <p class="mc-hint m-t-16"><c8y-mc-rich k="deployment.notAsked" /></p>
      </div>
    </div>
  `,
})
export class DeploymentComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly periods = computed(() =>
    this.store.scenario().periods.map(period => ({
      index: period.index,
      label: this.locales.t()('contract.periodN', { index: period.index }),
    })),
  );

  readonly groups = computed(() => {
    const t = this.locales.t();
    const scenario = this.store.scenario();
    const result = this.store.result();

    return GROUPS.map(name => ({
      name,
      rows: ASKED_LINE_ITEMS.filter(item => item.group === name).map<Row>(item => ({
        item,
        help: item.helpKey ? t(item.helpKey) : '',
        cells: scenario.periods.map(period => {
          const stated = commercialNumber(period, item.key);
          // GiB-months: the period's month-end snapshots added up, which is the
          // quantity this cell is billed on (storage.ts).
          const storage =
            item.source === 'estimated'
              ? storageForPeriod(result.storage, period.index)
              : undefined;
          const estimate = storage === undefined ? undefined : Number(storage.giBMonths.toFixed(2));

          return {
            periodIndex: period.index,
            reference: cellFor(item.baseRow, period.index),
            checked: commercialBool(period, item.key),
            checkLabel: commercialBool(period, item.key)
              ? t('deployment.yes')
              : t('deployment.no'),
            stated: estimate !== undefined && stated === 0 ? '' : stated,
            placeholder: estimate !== undefined ? String(estimate) : '',
            hint:
              estimate === undefined || storage === undefined
                ? ''
                : stated > 0
                  ? t('deployment.estimate', { value: estimate })
                  : t('deployment.estimatedAt', {
                      bytes: storage.peak?.bytesPerValue ?? 0,
                      low: storage.lowGiBMonths.toFixed(1),
                      high: storage.highGiBMonths.toFixed(1),
                    }),
          };
        }),
      })),
    })).filter(group => group.rows.length > 0);
  });

  setChoice(periodIndex: number, key: string, on: boolean): void {
    this.store.patch(s => setCommercial(s, periodIndex, key, on));
  }

  setNumber(periodIndex: number, key: string, raw: string): void {
    this.store.patch(s => setCommercial(s, periodIndex, key, Math.max(0, Number(raw) || 0)));
  }

  copyAcross(): void {
    this.store.patch(s => copyCommercialAcross(s, 1));
  }
}
