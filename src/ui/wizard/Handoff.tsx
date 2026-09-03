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
  periodMonthsCell,
  storageGiBMonthsForPeriod,
  type PeriodResult,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { commercialBool, commercialNumber } from '../store.js';
import { CopyButton } from '../parts.js';
import { monthYear, n, nf1 } from '../format.js';
import { Rich, useT } from '../i18n.js';
import type { T } from '../../../lib/i18n/index.js';

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
  t: T,
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
    return {
      text: commercialBool(period, key) ? t('deployment.yes') : t('deployment.no'),
      origin: 'stated',
    };
  }

  const value = commercialNumber(period, key);
  if (value > 0) return { text: n(value), origin: 'stated' };

  if (item?.source === 'estimated' && key === 'ods') {
    // GiB-months: what the database held at the end of each month of the
    // period, added up. See storage.ts for why that and not the fullest month.
    const giBMonths = storageGiBMonthsForPeriod(result, periodResult.index);
    if (giBMonths > 0) return { text: nf1.format(giBMonths), origin: 'estimated' };
  }
  return { text: '—', origin: 'none' };
}

export function Handoff({ scenario, result }: Props) {
  const t = useT();
  const tsvFor = (periodResult: PeriodResult): string => {
    const period = scenario.periods.find((p) => p.index === periodResult.index);
    const lines: string[] = [
      `${periodMonthsCell(periodResult.index)}	${period?.months ?? ''}	${t('handoff.lengthLabel', {
        index: periodResult.index,
      })}`,
    ];
    for (const item of LINE_ITEMS) {
      if (item.key === 'messages') continue; // D27 is a formula in the workbook.
      const { text } = valueFor(t, scenario, result, periodResult, item.key);
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
        <h2>{t('handoff.heading')}</h2>
        <span class="sub">{t('handoff.sub')}</span>
      </header>
      <div class="body tight scroll">
        <table>
          <thead>
            <tr>
              <th style="min-width:240px">{t('handoff.col.item')}</th>
              {result.periods.map((p) => (
                <th class="num" key={p.index} style="min-width:130px">
                  {t('contract.periodN', { index: p.index })}
                  <div style="font-weight:400;text-transform:none;letter-spacing:0">
                    {t('handoff.periodPeak', {
                      month: monthYear(p.peak.year, p.peak.month),
                      days: p.peak.days,
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {t('handoff.periodLength')}
                <div class="hint" style="margin:0">{t('handoff.months')}</div>
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
                      {item.source === 'calculated' && t('handoff.calculated')}
                      {item.source === 'estimated' && t('handoff.estimated')}
                    </div>
                  </td>
                  {result.periods.map((p) => {
                    const { text, origin } = valueFor(t, scenario, result, p, item.key);
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
                          title={origin === 'estimated' ? t('handoff.estimateTitle') : undefined}
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
                <Rich
                  k="handoff.counters.explain"
                  p={{
                    range: `${cellFor(COUNTER_BASE_ROWS[0]!, 1)}:${cellFor(COUNTER_BASE_ROWS[8]!, 1)}`,
                    stride: PERIOD_ROW_STRIDE,
                  }}
                />
                <div style="margin-top:5px">
                  <Rich k="handoff.all.explain" />
                </div>
              </td>
              {result.periods.map((p) => (
                <td class="num" key={p.index}>
                  <CopyButton
                    label={t('handoff.counters')}
                    title={t('handoff.counters.title', {
                      index: p.index,
                      cell: cellFor(COUNTER_BASE_ROWS[0]!, p.index),
                    })}
                    text={() => COUNTER_KEYS.map((k) => Math.round(p.peak.counters[k])).join('\n')}
                  />{' '}
                  <CopyButton
                    label={t('handoff.all')}
                    title={t('handoff.all.title', { index: p.index })}
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
