/**
 * The hand-off: every number this tool produces, next to the Configurator cell
 * it belongs in.
 *
 * The Configurator repeats an identical block per period offset by 30 rows, so
 * the cell references below are exact for each period rather than "row 28-ish".
 */

import {
  COUNTER_BASE_ROWS,
  PERIOD_ROW_STRIDE,
  COUNTER_KEYS,
  COUNTER_LABELS,
  LINE_ITEMS,
  cellFor,
  formatMonth,
  periodMonthsCell,
  storageGiBForPeriod,
  type PeriodResult,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { commercialBool, commercialNumber } from '../store.js';
import { CopyButton } from '../parts.js';
import { n, nf1 } from '../format.js';

interface Props {
  scenario: Scenario;
  result: ScenarioResult;
}

/** Where a number on this screen came from, which decides how it is drawn. */
type Origin = 'calculated' | 'estimated' | 'stated' | 'none';

/**
 * Value and display string for one line item in one period.
 *
 * The estimated lines matter here: storage is filled in by the tool unless
 * somebody states a figure, and this screen showed a dash for it while the
 * workbook wrote 64.82 into the same cell. A hand-off sheet that disagrees with
 * the file it hands off is worse than one that says nothing.
 */
function valueFor(
  scenario: Scenario,
  result: ScenarioResult,
  periodResult: PeriodResult,
  key: string,
): { text: string; origin: Origin } {
  const period = scenario.periods.find((p) => p.index === periodResult.index);
  if (key === 'messages') {
    return { text: n(periodResult.peak.total), origin: 'calculated' };
  }
  if (!period) return { text: '—', origin: 'none' };

  const item = LINE_ITEMS.find((i) => i.key === key);
  if (item?.source === 'choice') {
    return { text: commercialBool(period, key) ? 'Yes' : 'No', origin: 'stated' };
  }

  const value = commercialNumber(period, key);
  if (value > 0) return { text: n(value), origin: 'stated' };

  if (item?.source === 'estimated' && key === 'ods') {
    const giB = storageGiBForPeriod(result, periodResult.index);
    if (giB > 0) return { text: nf1.format(giB), origin: 'estimated' };
  }
  return { text: '—', origin: 'none' };
}

export function Handoff({ scenario, result }: Props) {
  const tsvFor = (periodResult: PeriodResult): string => {
    const period = scenario.periods.find((p) => p.index === periodResult.index);
    const lines: string[] = [
      `${periodMonthsCell(periodResult.index)}\t${period?.months ?? ''}\tPeriod ${periodResult.index} length in months`,
    ];
    for (const item of LINE_ITEMS) {
      if (item.key === 'messages') continue; // D27 is a formula in the workbook.
      const { text } = valueFor(scenario, result, periodResult, item.key);
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
                      {item.source === 'estimated' && ' · estimated, overridable'}
                    </div>
                  </td>
                  {result.periods.map((p) => {
                    const { text, origin } = valueFor(scenario, result, p, item.key);
                    return (
                      <td class="num" key={p.index}>
                        <span
                          style={
                            origin === 'none'
                              ? 'color:var(--ink-faint)'
                              : origin === 'calculated'
                                ? 'font-weight:600'
                                : origin === 'estimated'
                                  ? 'font-style:italic'
                                  : ''
                          }
                          title={origin === 'estimated' ? 'the tool\'s estimate; state a figure on the Deployment step to override it' : undefined}
                        >
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
              {/* What the two buttons do, said in the row that holds them. They
                  used to be labelled "Counters" and "All" against one run-on
                  sentence, which is not an explanation of either. */}
              <td class="hint">
                <b>Counters</b> copies the nine numbers above as a single column, in Configurator
                order. Select that period&rsquo;s counter block &mdash;{' '}
                <code>
                  {cellFor(COUNTER_BASE_ROWS[0]!, 1)}:{cellFor(COUNTER_BASE_ROWS[8]!, 1)}
                </code>{' '}
                in period 1, and {PERIOD_ROW_STRIDE} rows lower for each period after &mdash; and
                paste once.
                <div style="margin-top:5px">
                  <b>All</b> copies every row as <em>cell, value, label</em>, tab separated. Not a
                  paste target &mdash; the cells are not contiguous &mdash; but a checklist to work
                  down and tick off.
                </div>
              </td>
              {result.periods.map((p) => (
                <td class="num" key={p.index}>
                  <CopyButton
                    label="Counters"
                    title={`Nine counters for period ${p.index}, ready to paste at ${cellFor(COUNTER_BASE_ROWS[0]!, p.index)}`}
                    text={() => COUNTER_KEYS.map((k) => Math.round(p.peak.counters[k])).join('\n')}
                  />{' '}
                  <CopyButton
                    label="All"
                    title={`Every cell, value and label for period ${p.index}`}
                    text={() => tsvFor(p)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
