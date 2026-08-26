/**
 * The hand-off: every number this tool produces, next to the Configurator cell
 * it belongs in.
 *
 * The Configurator repeats an identical block per period offset by 30 rows, so
 * the cell references below are exact for each period rather than "row 28-ish".
 */

import {
  COUNTER_BASE_ROWS,
  COUNTER_KEYS,
  COUNTER_LABELS,
  LINE_ITEMS,
  cellFor,
  formatMonth,
  periodMonthsCell,
  type PeriodResult,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { commercialBool, commercialNumber } from '../store.js';
import { copy, n } from '../format.js';

interface Props {
  scenario: Scenario;
  result: ScenarioResult;
}

/** Value and display string for one line item in one period. */
function valueFor(
  scenario: Scenario,
  periodResult: PeriodResult,
  key: string,
): { text: string; calculated: boolean } {
  const period = scenario.periods.find((p) => p.index === periodResult.index);
  if (key === 'messages') {
    return { text: n(periodResult.peak.total), calculated: true };
  }
  if (!period) return { text: '—', calculated: false };
  const item = LINE_ITEMS.find((i) => i.key === key);
  if (item?.source === 'choice') {
    return { text: commercialBool(period, key) ? 'Yes' : 'No', calculated: false };
  }
  const value = commercialNumber(period, key);
  return { text: value === 0 ? '—' : n(value), calculated: false };
}

export function Handoff({ scenario, result }: Props) {
  const tsvFor = (periodResult: PeriodResult): string => {
    const period = scenario.periods.find((p) => p.index === periodResult.index);
    const lines: string[] = [
      `${periodMonthsCell(periodResult.index)}\t${period?.months ?? ''}\tPeriod ${periodResult.index} length in months`,
    ];
    for (const item of LINE_ITEMS) {
      if (item.key === 'messages') continue; // D27 is a formula in the workbook.
      const { text } = valueFor(scenario, periodResult, item.key);
      if (text !== '—') lines.push(`${cellFor(item.baseRow, periodResult.index)}\t${text.replace(/,/g, '')}\t${item.label}`);
    }
    COUNTER_KEYS.forEach((key, i) => {
      lines.push(
        `${cellFor(COUNTER_BASE_ROWS[i]!, periodResult.index)}\t${Math.round(periodResult.peak.counters[key])}\t${COUNTER_LABELS[key]}`,
      );
    });
    return lines.join('\n');
  };

  return (
    <section class="panel">
      <header>
        <h2>Hand-off to the Sales Configurator</h2>
        <span class="sub">Peak calendar month of each period</span>
      </header>
      <div class="body tight scroll">
        <table>
          <thead>
            <tr>
              <th style="min-width:240px">Line item</th>
              {result.periods.map((p) => (
                <th class="num" key={p.index} style="min-width:130px">
                  Period {p.index}
                  <div style="font-weight:400;text-transform:none;letter-spacing:0">
                    {formatMonth(p.peak.year, p.peak.month)} &middot; {p.peak.days} days
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Period length
                <div class="hint" style="margin:0">months</div>
              </td>
              {result.periods.map((p) => {
                const period = scenario.periods.find((s) => s.index === p.index);
                return (
                  <td class="num" key={p.index}>
                    {period?.months ?? '—'}
                    <div class="cell">{periodMonthsCell(p.index)}</div>
                  </td>
                );
              })}
            </tr>

            {LINE_ITEMS.map((item) => (
              <>
                <tr key={item.key} class={item.key === 'messages' ? 'total' : ''}>
                  <td>
                    {item.label}
                    <div class="hint" style="margin:0">
                      {item.unit}
                      {item.source === 'calculated' && ' · calculated'}
                    </div>
                  </td>
                  {result.periods.map((p) => {
                    const { text, calculated } = valueFor(scenario, p, item.key);
                    return (
                      <td class="num" key={p.index}>
                        <span style={text === '—' ? 'color:var(--ink-faint)' : calculated ? 'font-weight:600' : ''}>
                          {text}
                        </span>
                        <div class="cell">{cellFor(item.baseRow, p.index)}</div>
                      </td>
                    );
                  })}
                </tr>

                {/* The nine counters sit directly under Messages in the workbook. */}
                {item.key === 'messages' &&
                  COUNTER_KEYS.map((key, i) => (
                    <tr key={key}>
                      <td style="padding-left:26px">{COUNTER_LABELS[key]}</td>
                      {result.periods.map((p) => (
                        <td class="num" key={p.index}>
                          <span style={p.peak.counters[key] === 0 ? 'color:var(--ink-faint)' : ''}>
                            {n(p.peak.counters[key])}
                          </span>
                          <div class="cell">{cellFor(COUNTER_BASE_ROWS[i]!, p.index)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
              </>
            ))}

            <tr>
              <td class="hint">
                Nine counters as one column, ready to paste into{' '}
                {cellFor(28, 1)}:{cellFor(36, 1).slice(1)} &mdash; or everything as cell/value pairs.
              </td>
              {result.periods.map((p) => (
                <td class="num" key={p.index}>
                  <button
                    onClick={() => copy(COUNTER_KEYS.map((k) => Math.round(p.peak.counters[k])).join('\n'))}
                  >
                    Counters
                  </button>{' '}
                  <button onClick={() => copy(tsvFor(p))}>All</button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
