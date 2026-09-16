/**
 * The guidance report, which follows the customer through every step -- a
 * warning is worth far more while the input that caused it is still on screen.
 *
 * The findings travel as catalogue keys plus parameters rather than as
 * sentences (`Finding.titleKey`), so the panel is not the one English island on
 * a German screen. The quantified ones carry what they would cost or save per
 * month, which is the only unit this tool argues in.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { signed } from '../../../../lib/format/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

@Component({
  selector: 'c8y-mc-findings',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-panel">
      <header>
        <h2>{{ 'findings.heading' | t }}</h2>
        <span class="mc-sub-label">{{ summary() }}</span>
      </header>
      <div class="mc-body mc-tight">
        @if (rows().length === 0) {
          <div class="mc-clean">{{ 'findings.clean' | t }}</div>
        } @else {
          @for (row of rows(); track row.key) {
            <div class="mc-finding" [class]="'mc-' + row.severity">
              <span class="mc-rule">{{ row.rule }}</span>
              <div class="mc-txt">
                <b>{{ row.title }}</b>
                <p>{{ row.detail }}</p>
              </div>
              @if (row.delta) {
                <span class="mc-delta" [class]="row.deltaClass">
                  {{ row.delta }}
                  <div class="mc-per-month">{{ 'findings.perMonth' | t }}</div>
                </span>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class FindingsComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly rows = computed(() => {
    const t = this.locales.t();
    return this.store.findings().map((finding, i) => ({
      key: `${finding.rule}-${i}`,
      rule: finding.rule,
      severity: finding.severity,
      title: t(finding.titleKey, finding.titleParams),
      detail: t(finding.detailKey, finding.detailParams),
      delta:
        finding.messageDelta !== undefined && Math.abs(finding.messageDelta) >= 1
          ? signed(finding.messageDelta)
          : '',
      deltaClass: (finding.messageDelta ?? 0) < 0 ? 'mc-saves' : 'mc-costs',
    }));
  });

  readonly summary = computed(() => {
    const t = this.locales.t();
    const findings = this.store.findings();
    if (findings.length === 0) return t('findings.nothing');
    const errors = findings.filter(f => f.severity === 'error').length;
    const warnings = findings.filter(f => f.severity === 'warning').length;
    return [
      t.plural('findings.errors', errors),
      t.plural('findings.warnings', warnings),
      t.plural('findings.suggestions', findings.length - errors - warnings),
    ].join(', ');
  });
}
