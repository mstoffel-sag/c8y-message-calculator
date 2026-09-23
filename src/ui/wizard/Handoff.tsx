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
import { useState } from 'preact/hooks';

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
/**
 * A line item nobody has filled in, in any period.
 *
 * Only the asked ones: `messages` is calculated and `ods` is estimated, so
 * neither is ever empty for want of an answer. Zero across every period is the
 * test, not zero in the one being looked at -- a row that is 0 in period 1 and
 * 3 in period 2 is in use.
 */
function isUnused(scenario: Scenario, item: (typeof LINE_ITEMS)[number]): boolean {
  if (item.source === 'calculated' || item.source === 'estimated') return false;
  return scenario.periods.every((period) =>
    item.source === 'choice'
      ? !commercialBool(period, item.key)
      : commercialNumber(period, item.key) === 0,
  );
}

/** The length the customer gave this period, for the column header. */
function monthsOf(scenario: Scenario, index: number): number {
  return scenario.periods.find((p) => p.index === index)?.months ?? 0;
}

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
  // Collapsed by default: on a typical estimate 13 of the 15 asked line items
  // are dashes, and they bury the two that are not.
  const [showUnused, setShowUnused] = useState(false);
  const unused = LINE_ITEMS.filter((item) => isUnused(scenario, item));
  // A counter is zero across every period, so it has nothing to transfer. The
  // nine are still one contiguous paste block -- which is why these collapse
  // rather than disappear, and why the Counters button below copies all nine
  // whatever is on screen. Hand-typing from a collapsed table is the one way
  // to leave a stale value in D28:D36, and Show is a click away.
  const counterRows = COUNTER_KEYS.map((key, i) => ({ key, i }));
  const zeroCounters = counterRows.filter(({ key }) =>
    result.periods.every((p) => p.peak.counters[key] === 0),
  );
  const hiddenCount = unused.length + zeroCounters.length;
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
                  {/* The period's own length, beside its number. Every figure
                      in the column is one month's worth, so a header naming
                      only the month read as though the 12 months had been
                      ignored -- they are D21, and the Configurator multiplies
                      by them. */}
                  {/* nowrap so the column sizes to this line rather than
                      breaking it as "Period 1 · 12 / months" -- German is
                      longer again, and a pixel width guessed for one language
                      is wrong in the other. The month below may still wrap. */}
                  <span style="white-space:nowrap">
                    {t.plural('handoff.periodHeading', monthsOf(scenario, p.index), {
                      label: t('contract.periodN', { index: p.index }),
                    })}
                  </span>
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

            {LINE_ITEMS.filter((item) => showUnused || !isUnused(scenario, item)).map((item) => (
              <>
                <tr key={item.key} class={item.key === 'messages' ? 'total' : ''}>
                  <td>
                    {item.label}
                    <div class="hint" style="margin:0">
                      {/* Every other row states the unit its quantity is typed
                          in. Messages cannot: the Configurator's unit for it is
                          "per 100K per month", which is how the row is priced,
                          and under a raw 46,009,000 that reads as the unit the
                          figure is in. So this row says what its number is
                          instead. The workbook keeps the Configurator's own
                          wording, where the cell is blank and cannot mislead. */}
                      {item.key === 'messages' ? t('handoff.messages.what') : item.unit}
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
                  counterRows
                    .filter(({ key }) =>
                      showUnused || !zeroCounters.some((z) => z.key === key),
                    )
                    .map(({ key, i }) => (
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

            {/* The rows nobody filled in, counted rather than listed. Never
                dropped: this table is a checklist of Configurator cells, and a
                cell that is empty because nobody has decided yet still has to
                be findable. The nine counters are never in here -- they are one
                contiguous paste block, and a zero hidden out of D28:D36 is a
                stale value left behind in the Configurator. */}
            {hiddenCount > 0 && (
              <tr>
                <td class="hint" colSpan={1 + result.periods.length}>
                  {t.plural('handoff.unused', hiddenCount)}{' '}
                  <button
                    class="ghost"
                    style="padding:0 4px;text-decoration:underline"
                    onClick={() => setShowUnused(!showUnused)}
                  >
                    {showUnused ? t('handoff.unused.hide') : t('handoff.unused.show')}
                  </button>
                </td>
              </tr>
            )}

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
