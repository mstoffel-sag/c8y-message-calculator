/**
 * The contract: periods, the ramp, the calendar, and what is deployed in each
 * period.
 *
 * A period used to be defined here and *used* one screen earlier, where the
 * deployment table asked for a quantity per period. Adding a fifth period meant
 * walking forward, adding it, and walking back to fill in its column. Periods
 * now exist in exactly one place, and the table that has a column per period
 * sits directly beneath the table that decides how many there are.
 */

import {
  BYTES_PER_VALUE_HIGH,
  DEFAULT_RETENTION_DAYS,
  periodMonthsCell,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { addPeriod, patchPeriod, removePeriod, setPeriodCount } from '../store.js';
import { Num, Teach, Empty } from '../parts.js';
import { Prose, useT } from '../i18n.js';
import { monthLabel } from '../format.js';
import { Deployment } from './Deployment.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

export function StepContract({ scenario, onChange, result }: Props & { result: ScenarioResult }) {
  const t = useT();
  return (
    <>
      <section class="panel sub">
        <header>
          <h3>{t('contract.ramp.heading')}</h3>
          <span class="sub">{t('contract.ramp.sub')}</span>
        </header>
        <div class="body">
          <Teach title={t('contract.teach.title')}>
            <Prose k="contract.teach.body" />
          </Teach>

          <div class="row" style="margin-bottom:18px">
            <label class="field" style="width:150px">
              <span>{t('contract.rampStarts')}</span>
              <select
                value={scenario.settings.startMonth}
                onChange={(e) =>
                  onChange({
                    ...scenario,
                    settings: { ...scenario.settings, startMonth: Number((e.target as HTMLSelectElement).value) },
                  })
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>{monthLabel(i + 1)}</option>
                ))}
              </select>
            </label>
            <Num
              label={t('contract.year')}
              width="110px"
              min={2000}
              value={scenario.settings.startYear}
              onChange={(startYear) => onChange({ ...scenario, settings: { ...scenario.settings, startYear } })}
            />
            {/* Retention changes nothing about how many messages are sent -- only
                how many of them are still on disk. It is here rather than on the
                results screen because it is a fact about the tenant, like the
                calendar start, not an output. */}
            <Num
              label={t('contract.retention')}
              width="150px"
              min={1}
              suffix={t('contract.retention.suffix')}
              title={t('contract.retention.title')}
              value={scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS}
              onChange={(retentionDays) =>
                onChange({ ...scenario, settings: { ...scenario.settings, retentionDays } })
              }
            />
            {/* The one number picked out of the 100-400 B range to quote. It starts
                at the top of it, because under-stating usage on a commit-to-consume
                contract depletes the commitment early rather than saving anything. */}
            <Num
              label={t('contract.bytesPerValue')}
              width="160px"
              min={1}
              suffix="B"
              title={t('contract.bytesPerValue.title')}
              value={scenario.settings.bytesPerValue ?? BYTES_PER_VALUE_HIGH}
              onChange={(bytesPerValue) =>
                onChange({ ...scenario, settings: { ...scenario.settings, bytesPerValue } })
              }
            />
          </div>

          {scenario.machineTypes.length === 0 ? (
            <Empty>{t('wizard.addMachineFirst')}</Empty>
          ) : (
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('contract.col.period')}</th>
                    <th class="num" style="width:120px">{t('contract.col.months')}</th>
                    {scenario.machineTypes.map((mt) => (
                      <th class="num" key={mt.id}>{mt.name || t('machine.unnamedShort')}</th>
                    ))}
                    <th style="width:80px" />
                  </tr>
                </thead>
                <tbody>
                  {scenario.periods.map((period) => (
                    <tr key={period.index}>
                      <td>
                        {t('contract.periodN', { index: period.index })}
                        <div class="cell">{periodMonthsCell(period.index)}</div>
                      </td>
                      <td class="num">
                        <Num
                          min={1}
                          max={120}
                          value={period.months}
                          onChange={(months) => onChange(patchPeriod(scenario, period.index, { months }))}
                        />
                      </td>
                      {scenario.machineTypes.map((mt) => (
                        <td class="num" key={mt.id}>
                          <Num
                            value={period.machineCountOverrides[mt.id] ?? mt.machineCount}
                            onChange={(count) => onChange(setPeriodCount(scenario, period.index, mt.id, count))}
                          />
                        </td>
                      ))}
                      <td>
                        {scenario.periods.length > 1 && (
                          <button class="ghost" onClick={() => onChange(removePeriod(scenario, period.index))}>
                            {t('contract.remove')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div class="row" style="margin-top:12px">
            <button disabled={scenario.periods.length >= 5} onClick={() => onChange(addPeriod(scenario))}>
              {t('contract.addPeriod')}
            </button>
            <span class="hint" style="margin:0">{t('contract.addPeriod.hint')}</span>
          </div>
        </div>
      </section>

      <Deployment scenario={scenario} onChange={onChange} result={result} />
    </>
  );
}
