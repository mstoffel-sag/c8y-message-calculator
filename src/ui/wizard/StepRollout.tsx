/** Rollout: periods, the ramp, and the calendar. */

import {
  BYTES_PER_VALUE_HIGH,
  DEFAULT_RETENTION_DAYS,
  monthName,
  periodMonthsCell,
  type Scenario,
} from '../../../lib/engine/index.js';
import { addPeriod, patchPeriod, removePeriod, setPeriodCount } from '../store.js';
import { Num, Teach, Empty } from '../parts.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

export function StepRollout({ scenario, onChange }: Props) {
  return (
    <>
      <Teach title="Billing runs on real calendar months">
        <p>
          February is 28 days and January is 31 &mdash; an <b>11 % swing</b> in messages for a fleet
          doing exactly the same thing. The tool works in real month lengths rather than averaging
          them away, and reports a range with the peak month named. A single number would be wrong
          eleven months out of twelve.
        </p>
        <p>
          <b>Registration is derived from the ramp.</b> Each period contributes{' '}
          <em>Inventories Created</em> only for the machines it <em>adds</em>, once, in its first
          month. A period that adds nobody registers nobody &mdash; putting onboarding into the
          monthly rate overstates every later period.
        </p>
      </Teach>

      <div class="row" style="margin-bottom:18px">
        <label class="field" style="width:150px">
          <span>Ramp starts</span>
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
              <option key={i} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </select>
        </label>
        <Num
          label="Year"
          width="110px"
          min={2000}
          value={scenario.settings.startYear}
          onChange={(startYear) => onChange({ ...scenario, settings: { ...scenario.settings, startYear } })}
        />
        <Num
          label="Peak factor"
          width="130px"
          min={1}
          step="any"
          suffix="&times;"
          title="Multiplier on the average rate, for the throughput sanity check only. It does not change the message count."
          value={scenario.settings.peakFactor}
          onChange={(peakFactor) => onChange({ ...scenario, settings: { ...scenario.settings, peakFactor } })}
        />
        {/* Retention changes nothing about how many messages are sent -- only
            how many of them are still on disk. It is here rather than on the
            results screen because it is a fact about the tenant, like the
            calendar start, not an output. */}
        <Num
          label="Data kept"
          width="150px"
          min={1}
          suffix="days"
          title="Days of data the tenant's retention rules keep. Decides the operational storage estimate on the Results step; it does not change the message count."
          value={scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS}
          onChange={(retentionDays) =>
            onChange({ ...scenario, settings: { ...scenario.settings, retentionDays } })
          }
        />
        {/* The one number picked out of the 100-400 B range to quote. It starts
            at the top of it, because under-stating usage on a commit-to-consume
            contract depletes the commitment early rather than saving anything. */}
        <Num
          label="Bytes / value"
          width="160px"
          min={1}
          suffix="B"
          title="Bytes per stored value, for the storage figure that goes in the Configurator's ODS cell. The evidence is 100-400 B and unverified, so the Results step and the workbook always show the whole range beside whatever this is set to."
          value={scenario.settings.bytesPerValue ?? BYTES_PER_VALUE_HIGH}
          onChange={(bytesPerValue) =>
            onChange({ ...scenario, settings: { ...scenario.settings, bytesPerValue } })
          }
        />
      </div>

      {scenario.machineTypes.length === 0 ? (
        <Empty>Add a machine type first.</Empty>
      ) : (
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th class="num" style="width:120px">Months</th>
                {scenario.machineTypes.map((mt) => (
                  <th class="num" key={mt.id}>{mt.name || 'Unnamed'}</th>
                ))}
                <th style="width:80px" />
              </tr>
            </thead>
            <tbody>
              {scenario.periods.map((period) => (
                <tr key={period.index}>
                  <td>
                    Period {period.index}
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
                        Remove
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
          Add period
        </button>
        <span class="hint" style="margin:0">
          The Configurator allows five. A contract auto-renews on a 12-month term if it ends without
          a new agreement, and unused commitment is forfeited rather than carried forward.
        </span>
      </div>
    </>
  );
}
