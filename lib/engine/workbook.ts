/**
 * The downloadable workbook.
 *
 * Laid out to mirror the Sales Configurator's own row structure: each period
 * occupies the same rows the Configurator uses for it, with the label in column
 * C and the value in column D. That makes the transfer a column copy rather
 * than a retyping exercise -- select D21:D47 here, paste at D21 there.
 *
 * The price columns are deliberately absent. This workbook carries quantities
 * and nothing else, so it can be mailed to a customer without anyone checking
 * first (CONCEPT.md section 1).
 */

import {
  COUNTER_BASE_ROWS,
  LINE_ITEMS,
  PERIOD_ROW_STRIDE,
  cellFor,
  periodMonthsCell,
} from './configurator.js';
import { COUNTER_KEYS, COUNTER_LABELS } from './types.js';
import { formatRatePeriod } from './cadence.js';
import { formatDuration } from './duration.js';
import { formatMonth } from './calendar.js';
import { measurementView } from './diagram.js';
import { machineCountIn } from './compute.js';
import { DEFAULT_RETENTION_DAYS, peakStorageForPeriod } from './storage.js';
import { en, translate } from '../i18n/index.js';
import type { MetricKind, Period, Scenario, ScenarioResult } from './types.js';
import { colName } from '../xlsx/writer.js';
import type { Cell, Row, Sheet } from '../xlsx/writer.js';
import { MESSAGE_BILLING_UNIT, commitmentFor } from './commitment.js';
import { storageGiBForPeriod } from './storage.js';

const COL = { category: 2, label: 3, value: 4, unit: 6, note: 7 } as const;

/** Which Cumulocity element each kind writes to, for the Design sheet. */
const ELEMENT_OF: Partial<Record<MetricKind, string>> = {
  occurrence: 'an event',
  condition: 'an alarm (raise + clear)',
  inventory: 'the managed object',
  command: 'an operation (+ status updates)',
};

function row(r: number, cells: Cell[]): Row {
  return { row: r, cells };
}

function text(col: number, value: string, style?: Cell['style']): Cell {
  return { col, value, style };
}

function num(col: number, value: number, style: Cell['style'] = 'number'): Cell {
  return { col, value, style };
}

/**
 * Sheet 1: the hand-off, row-aligned with the Configurator.
 *
 * One row per line item, **one column per period**. The Configurator itself
 * stacks its periods vertically 30 rows apart, and this sheet used to mirror
 * that -- which made a five-period estimate 150 rows of near-identical blocks
 * that nobody could compare. Side by side, the ramp is the thing you see.
 *
 * The rows still sit at the Configurator's own period-1 addresses, so column D
 * pastes into period 1 cell for cell. Later periods are the same column of
 * values 30 rows further down: copy the period's column, paste at its D cell.
 * The note on the sheet says which.
 *
 * Only the peak month of each period appears. A period is quoted at one number
 * per counter and the peak is the honest one to quote -- the full month-by-month
 * spread is on its own sheet so the range stays visible.
 */
function configuratorSheet(scenario: Scenario, result: ScenarioResult): Sheet {
  const periods = result.periods;
  /** Period p occupies this column: D for period 1, E for 2, and so on. */
  const periodCol = (index: number) => COL.value + index - 1;
  const unitCol = COL.value + periods.length;
  const noteCol = unitCol + 1;

  const rows: Row[] = [
    row(1, [text(COL.category, 'Cumulocity message estimate', 'title')]),
    row(2, [text(COL.category, scenario.name || 'Untitled scenario', 'label')]),
    row(3, [
      text(
        COL.category,
        'Quantities only. This is a volume estimate, not a quote -- no prices, no billable units, no commitment sizing.',
        'note',
      ),
    ]),
    row(4, [
      text(
        COL.category,
        `Periods run left to right. Column D is period 1 at the Configurator's own rows, so it pastes ` +
          `cell for cell; each later column pastes at its own period's D cell, ${PERIOD_ROW_STRIDE} rows further down per period. ` +
          'Prices, discounts and currency stay in the Configurator -- this file has none.',
        'note',
      ),
    ]),
  ];

  rows.push(
    row(6, [
      text(
        COL.category,
        'Rows 6 to 20 are deliberately empty. The Configurator keeps its own period summary and ' +
          'commitment formulas there, so nothing is written into them -- paste from row 21 down.',
        'note',
      ),
    ]),
  );

  // Row 21 is where the Configurator keeps period 1's length in months.
  rows.push(
    row(21, [
      text(COL.label, 'Period length', 'label'),
      ...periods.map((period) =>
        num(
          periodCol(period.index),
          scenario.periods.find((p) => p.index === period.index)?.months ?? 0,
          'numberBold',
        ),
      ),
      text(unitCol, 'months', 'note'),
      text(noteCol, 'paste each column at the cell named in its heading', 'note'),
    ]),
  );

  rows.push(
    row(22, [
      text(COL.category, 'Category', 'heading'),
      text(COL.label, 'Product Name', 'heading'),
      ...periods.map((period) =>
        text(
          periodCol(period.index),
          `Period ${period.index} -> ${periodMonthsCell(period.index)}`,
          'heading',
        ),
      ),
      text(unitCol, 'Unit', 'heading'),
      text(noteCol, 'Where this came from', 'heading'),
    ]),
  );

  let lastCategory = '';
  for (const item of LINE_ITEMS) {
    const cells: Cell[] = [];
    if (item.group !== lastCategory) {
      cells.push(text(COL.category, item.group, 'label'));
      lastCategory = item.group;
    }
    cells.push(text(COL.label, item.label, item.key === 'messages' ? 'label' : 'default'));
    cells.push(text(unitCol, item.unit, 'note'));

    if (item.key === 'messages') {
      // Left blank on purpose, in every period column. In the Configurator this
      // cell holds =SUM(D28:D36) -- the only formula in the quantity column --
      // so writing a value here would mean pasting a column that silently
      // replaced a formula with a constant. The totals go in the notes column as
      // a cross-check.
      for (const period of periods) cells.push(text(periodCol(period.index), ''));
      cells.push(
        text(
          noteCol,
          'leave these cells alone: the Configurator sums the nine counters. Should come to ' +
            periods
              .map((p) => `${Math.round(p.peak.total).toLocaleString('en-GB')} (P${p.index})`)
              .join(', '),
          'note',
        ),
      );
    } else {
      let anyEstimated = false;
      let anyStated = false;
      for (const period of periods) {
        const scenarioPeriod = scenario.periods.find((p) => p.index === period.index);
        const value = scenarioPeriod?.commercial[item.key];
        const stated = typeof value === 'number' && value > 0;
        const storage =
          item.key === 'ods' ? peakStorageForPeriod(result.storage, period.index) : undefined;

        if (stated) {
          anyStated = true;
          cells.push(num(periodCol(period.index), value as number));
        } else if (value === true) {
          anyStated = true;
          cells.push(text(periodCol(period.index), 'Yes'));
        } else if (storage !== undefined) {
          anyEstimated = true;
          cells.push(num(periodCol(period.index), Number(storage.quotedGiB.toFixed(2))));
        }
      }

      const storage = item.key === 'ods' ? peakStorageForPeriod(result.storage, 1) : undefined;
      cells.push(
        text(
          noteCol,
          storage === undefined
            ? 'stated in the wizard'
            : anyEstimated
              ? `estimated: values on disk at ${storage.bytesPerValue} B each, ` +
                `${storage.retentionDays} days retained. Unverified assumption -- the evidence spans ` +
                `${storage.lowGiB.toFixed(1)} to ${storage.highGiB.toFixed(1)} GiB in period 1. ` +
                'See the Storage sheet.'
              : anyStated
                ? 'stated in the wizard, overriding the storage estimate'
                : 'stated in the wizard',
          'note',
        ),
      );
    }

    rows.push(row(item.baseRow, cells));
  }

  // The nine counters, at the rows the Configurator keeps for them.
  COUNTER_KEYS.forEach((key, i) => {
    const r = COUNTER_BASE_ROWS[i]!;
    rows.push(
      row(r, [
        text(COL.label, `- ${COUNTER_LABELS[key]}`),
        ...periods.map((period) => num(periodCol(period.index), period.peak.counters[key])),
        text(noteCol, periods.map((p) => cellFor(r, p.index)).join(' · '), 'cellRef'),
      ]),
    );
  });

  rows.push(
    row(48, [
      text(
        COL.label,
        `Every cell in a period column is an input in the Configurator except the Messages row, ` +
          `which is left blank here so its SUM survives.`,
        'note',
      ),
    ]),
  );

  return {
    name: 'Configurator',
    columnWidths: [3, 16, 34, ...periods.map(() => 16), 9, 46],
    freezeRows: 22,
    rows,
  };
}

/** Sheet 2: the design the numbers came from. */
function designSheet(scenario: Scenario): Sheet {
  const rows: Row[] = [
    row(1, [text(1, 'What each machine sends', 'title')]),
    row(2, [
      text(
        1,
        'One row per reading. Readings sharing a measurement share one message; anything on its own costs a message of its own.',
        'note',
      ),
    ]),
    row(4, [
      text(1, 'Machine type', 'heading'),
      text(2, 'Machines', 'heading'),
      // Descriptive: no counter reads it. It is here because the first question
      // anyone asks of a finished estimate is how the data gets in.
      text(3, 'Talks', 'heading'),
      text(4, 'Reading', 'heading'),
      text(5, 'Unit', 'heading'),
      text(6, 'Kind', 'heading'),
      text(7, 'How often', 'heading'),
      text(8, 'Travels in', 'heading'),
      text(9, 'Shared', 'heading'),
      text(10, 'Msg / machine / month', 'heading'),
    ]),
  ];

  let r = 5;
  for (const mt of scenario.machineTypes) {
    const view = measurementView(mt, scenario.settings.fragmentPrefix, {
      maxMembersPerGroup: 1000,
      maxRows: 100_000,
    });

    for (const group of view.groups) {
      group.members.forEach((m, k) => {
        const metric = mt.metrics.find((x) => x.id === m.metricId);
        rows.push(
          row(r++, [
            text(1, k === 0 ? mt.name || 'Unnamed' : ''),
            k === 0 ? num(2, mt.machineCount) : text(2, ''),
            text(3, k === 0 ? mt.protocol?.trim() || '' : ''),
            text(4, m.name),
            text(5, m.unit),
            text(6, metric?.kind ?? ''),
            text(7, group.intervalSeconds === undefined
              ? 'on change'
              : `every ${formatDuration(group.intervalSeconds)}`),
            text(8, group.fragmentName),
            text(9, group.shared ? 'shared' : 'alone'),
            // The message cost belongs to the measurement, not to each reading
            // in it -- so it is stated once, against the first row.
            k === 0 ? num(10, group.messagesPerMonth) : text(10, ''),
          ]),
        );
      });
    }

    // Everything that is not a measurement: one message each, nothing to group.
    for (const metric of mt.metrics) {
      if (metric.kind === 'continuous' || metric.kind === 'state') continue;
      rows.push(
        row(r++, [
          text(1, ''),
          text(2, ''),
          text(3, ''),
          text(4, metric.name),
          text(5, metric.unit),
          text(6, metric.kind),
          text(7, formatRatePeriod(metric.cadence)),
          text(8, ELEMENT_OF[metric.kind] ?? ''),
          text(9, 'alone'),
          text(10, ''),
        ]),
      );
    }
    r += 1;
  }

  rows.push(
    row(r + 1, [
      text(
        1,
        'Readings stored does not change with grouping -- only the number of messages does.',
        'note',
      ),
    ]),
  );

  return {
    name: 'Design',
    columnWidths: [22, 10, 22, 26, 8, 12, 18, 26, 9, 21],
    freezeRows: 4,
    rows,
  };
}

/** Sheet 3: every calendar month, so the range is evidence rather than a claim. */
function monthsSheet(result: ScenarioResult, scenario: Scenario): Sheet {
  const rows: Row[] = [
    row(1, [text(1, 'Month by month', 'title')]),
    row(2, [
      text(
        1,
        'Billing runs on calendar months, so a 28-day February and a 31-day January differ by 11 % on identical behaviour. The peak month of each period is what the Configurator sheet quotes.',
        'note',
      ),
    ]),
    row(4, [
      text(1, 'Month', 'heading'),
      text(2, 'Days', 'heading'),
      text(3, 'Period', 'heading'),
      ...COUNTER_KEYS.map((key, i) => text(4 + i, COUNTER_LABELS[key], 'heading')),
      text(13, 'Total messages', 'heading'),
      text(14, 'Machines online', 'heading'),
      text(15, 'Avg msg / second', 'heading'),
    ]),
  ];

  result.months.forEach((month, i) => {
    const isPeak = result.periods.some(
      (p) => p.peak.year === month.year && p.peak.month === month.month,
    );
    rows.push(
      row(5 + i, [
        text(1, formatMonth(month.year, month.month), isPeak ? 'label' : 'default'),
        num(2, month.days),
        num(3, month.periodIndex),
        ...COUNTER_KEYS.map((key, c) => num(4 + c, month.counters[key])),
        num(13, month.total, isPeak ? 'numberBold' : 'number'),
        num(14, month.machinesOnline),
        { col: 15, value: Number(month.avgMessagesPerSec.toFixed(2)) },
      ]),
    );
  });

  const after = 6 + result.months.length;
  rows.push(
    row(after, [
      text(
        1,
        `Fleet: ${scenario.machineTypes
          .map((mt) => `${machineCountIn(mt, scenario.periods[0])} x ${mt.name || 'unnamed'}`)
          .join(', ')}.`,
        'note',
      ),
    ]),
  );

  return {
    name: 'Months',
    columnWidths: [16, 6, 7, 14, 12, 12, 12, 12, 14, 14, 13, 13, 16, 14, 14],
    freezeRows: 4,
    rows,
  };
}

/**
 * Sheet 5: operational storage, as a range with its assumptions attached.
 *
 * Two columns for one quantity, because the source figure spans 4x and says
 * "to be verified" twice. Whoever fills in the ODS line picks a number from
 * this; the file will not pick one for them.
 */
function storageSheet(result: ScenarioResult, scenario: Scenario): Sheet {
  const peak = result.peakStorage;
  const retention = scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS;

  const rows: Row[] = [
    row(1, [text(1, 'Operational storage', 'title')]),
    row(2, [text(1, en['engine.storageSourceNote'], 'note')]),
    row(3, [
      text(
        1,
        `Retention: ${retention} days, from the scenario. The platform bills the daily maximum, so ` +
          'the quantity is what is still on disk on the fullest day of the month -- not what the ' +
          'month wrote. Measurements only: events, alarms, inventory writes and operations are ' +
          'stored too, but the source figure was measured on datapoints.',
        'note',
      ),
    ]),
    row(5, [
      text(1, 'Month', 'heading'),
      text(2, 'Values written', 'heading'),
      text(3, 'Values on disk', 'heading'),
      text(4, 'Days of history', 'heading'),
      text(5, 'GiB at 100 B', 'heading'),
      text(6, 'GiB at 400 B', 'heading'),
      text(7, 'DataHub GiB, low', 'heading'),
      text(8, 'DataHub GiB, high', 'heading'),
    ]),
  ];

  result.storage.forEach((month, i) => {
    const isPeak = peak !== undefined && month.year === peak.year && month.month === peak.month;
    rows.push(
      row(6 + i, [
        text(1, `${formatMonth(month.year, month.month)}${isPeak ? ' (fullest)' : ''}`),
        num(2, Math.round(month.written)),
        num(3, Math.round(month.retained), isPeak ? 'numberBold' : 'number'),
        num(4, Math.round(month.daysCovered)),
        { col: 5, value: Number(month.lowGiB.toFixed(2)) },
        { col: 6, value: Number(month.highGiB.toFixed(2)) },
        { col: 7, value: Number(month.dataHubLowGiB.toFixed(2)) },
        { col: 8, value: Number(month.dataHubHighGiB.toFixed(2)) },
      ]),
    );
  });

  const after = 7 + result.storage.length;
  if (peak !== undefined) {
    rows.push(
      row(after, [
        text(
          1,
          `Fullest month ${formatMonth(peak.year, peak.month)}: ` +
            `${peak.lowGiB.toFixed(1)} to ${peak.highGiB.toFixed(1)} GiB. ` +
            `Each measurement carried ${peak.valuesPerMeasurement.toFixed(1)} values on average, ` +
            'and the envelope is paid once per measurement rather than once per value -- so a ' +
            'bundled fleet sits nearer the bottom of the range than the top.',
          'note',
        ),
      ]),
    );
  }

  return {
    name: 'Storage',
    columnWidths: [20, 16, 16, 15, 14, 14, 17, 18],
    freezeRows: 5,
    rows,
  };
}

/** Sheet 4: the guidance, so a reviewer sees what the tool flagged. */
function guidanceSheet(result: ScenarioResult): Sheet {
  const rows: Row[] = [
    row(1, [text(1, 'Guidance', 'title')]),
    row(3, [
      text(1, 'Rule', 'heading'),
      text(2, 'Severity', 'heading'),
      text(3, 'Finding', 'heading'),
      text(4, 'Detail', 'heading'),
      text(5, 'Msg / month', 'heading'),
    ]),
  ];

  if (result.findings.length === 0) {
    rows.push(row(4, [text(1, 'Nothing to flag.', 'note')]));
  } else {
    result.findings.forEach((finding, i) => {
      rows.push(
        row(4 + i, [
          text(1, finding.rule),
          text(2, finding.severity),
          text(3, translate('en', finding.titleKey, finding.titleParams)),
          text(4, translate('en', finding.detailKey, finding.detailParams)),
          finding.messageDelta === undefined
            ? text(5, '')
            : num(5, Math.round(finding.messageDelta)),
        ]),
      );
    });
  }

  return {
    name: 'Guidance',
    columnWidths: [7, 12, 62, 96, 14],
    freezeRows: 3,
    rows,
  };
}


/* ----------------------------------------------------------------- the quote */

const QUOTE_COL = {
  category: 2,
  label: 3,
  quantity: 4,
  billable: 5,
  unit: 6,
  price: 7,
  total: 8,
} as const;

/** Where the catalog discount is typed, referenced absolutely by every line. */
const DISCOUNT_CELL = '$D$6';

/** A commercial quantity as a number, for caching a cross-sheet reference. */
function commercialQuantity(period: Period | undefined, key: string): number {
  const value = period?.commercial[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * Sheet 2: the quote, and the commit-to-consume commitment.
 *
 * Ships with **price columns and no prices**. The customer fills in the wizard
 * and sends the file on; the salesperson opens this sheet, types their own unit
 * prices into the shaded column, and every total computes itself -- including
 * the commitment, which is the number a CTC contract is actually signed on.
 *
 * That is what lets the constraint hold (CONCEPT.md §1). The tool supplies every
 * factor except the rate, so the commitment exists in the file without a price
 * ever existing in the tool.
 *
 * Periods run left to right, one column each, and the arithmetic reads across a
 * row: quantity per month per period, billable units over the whole term, unit
 * price, total. The Configurator computes a period as monthly total x months and
 * sums the periods at E18; this is the same expression rearranged so a reader
 * can see every period at once.
 */
function quoteSheet(scenario: Scenario, result: ScenarioResult): Sheet {
  const periods = result.periods;
  const commitment = commitmentFor(scenario, result);

  const CAT = 2;
  const LABEL = 3;
  const periodCol = (index: number) => 3 + index;
  const UNIT = 4 + periods.length;
  const TERM = UNIT + 1;
  const PRICE = TERM + 1;
  const TOTAL = PRICE + 1;

  const MONTHS_ROW = 11;
  const HEAD_ROW = 12;
  const FIRST_ITEM = 13;

  /** "D13*D$11+E13*E$11": a quantity per month, over the term. */
  const overTerm = (r: number, wrap: (cell: string) => string) =>
    periods
      .map((p) => `${wrap(`${colName(periodCol(p.index))}${r}`)}*${colName(periodCol(p.index))}$${MONTHS_ROW}`)
      .join('+');

  const itemRows = LINE_ITEMS.map((item, i) => ({ item, r: FIRST_ITEM + i }));
  const lastItemRow = FIRST_ITEM + LINE_ITEMS.length - 1;
  const totalRow = lastItemRow + 2;

  const rows: Row[] = [
    row(1, [text(CAT, 'Quote', 'title')]),
    row(2, [text(CAT, scenario.name || 'Untitled scenario', 'label')]),
    row(3, [
      text(
        CAT,
        'Quantities come from the estimate. Type your own unit prices into the shaded column and every total follows, including the commitment. This file ships with no prices in it.',
        'note',
      ),
    ]),
    row(4, [
      text(
        CAT,
        `Messages are sold per ${MESSAGE_BILLING_UNIT.toLocaleString('en-GB')} per month, so the term column rounds each period's monthly count up before multiplying by its length.`,
        'note',
      ),
    ]),
    row(6, [
      text(LABEL, 'Catalog discount', 'label'),
      { col: 4, value: null, style: 'percentInput' },
      text(UNIT, 'applies to every line except Messages, as the Configurator does', 'note'),
    ]),
    row(8, [
      text(LABEL, 'CTC commitment, whole term', 'label'),
      {
        col: TOTAL,
        value: null,
        style: 'moneyBold',
        // The table's own total, referenced rather than summed twice.
        formula: `${colName(TOTAL)}${totalRow}`,
        cached: 0,
      },
      text(
        UNIT,
        `${commitment.termMonths} months across ${periods.length} period${periods.length === 1 ? '' : 's'}`,
        'note',
      ),
    ]),
    row(9, [
      text(
        LABEL,
        'A commit-to-consume contract is signed on that one number. Discounts, approval thresholds, minimum commitments and currency conversion stay in the Sales Configurator -- this sheet is a working total, not an approved quote.',
        'note',
      ),
    ]),
    row(MONTHS_ROW, [
      text(LABEL, 'Months in period', 'label'),
      ...periods.map((p, i) =>
        num(periodCol(p.index), commitment.months[i] ?? 0, 'numberBold'),
      ),
      text(UNIT, 'months', 'note'),
      num(TERM, commitment.termMonths, 'numberBold'),
      text(TOTAL, 'term', 'note'),
    ]),
    row(HEAD_ROW, [
      text(CAT, 'Category', 'heading'),
      text(LABEL, 'Product Name', 'heading'),
      ...periods.map((p) => text(periodCol(p.index), `Period ${p.index} / month`, 'heading')),
      text(UNIT, 'Unit', 'heading'),
      text(TERM, 'Billable units, whole term', 'heading'),
      text(PRICE, 'Unit Price', 'heading'),
      text(TOTAL, 'Total, whole term', 'heading'),
    ]),
  ];

  let lastCategory = '';
  for (const { item, r } of itemRows) {
    const cells: Cell[] = [];
    if (item.group !== lastCategory) {
      cells.push(text(CAT, item.group, 'label'));
      lastCategory = item.group;
    }
    cells.push(text(LABEL, item.label, item.key === 'messages' ? 'label' : 'default'));
    cells.push(text(UNIT, item.unit, 'note'));

    if (item.key === 'messages') {
      // The nine counters live on the Configurator sheet; this reads them there
      // rather than restating them, so one edit moves both sheets.
      for (const period of periods) {
        const c = colName(periodCol(period.index));
        cells.push({
          col: periodCol(period.index),
          value: null,
          style: 'numberBold',
          formula: `SUM(Configurator!${c}${COUNTER_BASE_ROWS[0]}:${c}${COUNTER_BASE_ROWS[COUNTER_BASE_ROWS.length - 1]})`,
          cached: period.peak.total,
        });
      }
      cells.push({
        col: TERM,
        value: null,
        style: 'numberBold',
        // Rounded up per month, then multiplied by the months -- the order the
        // Configurator bills in, and not the same as rounding up at the end.
        formula: overTerm(r, (cell) => `ROUNDUP(${cell}/${MESSAGE_BILLING_UNIT},0)`),
        cached: commitment.termUnitsQuoted,
      });
      cells.push({ col: PRICE, value: null, style: 'priceInput' });
      // Messages carry their own negotiated rate, so no catalog discount.
      cells.push({
        col: TOTAL,
        value: null,
        style: 'money',
        formula: `${colName(TERM)}${r}*${colName(PRICE)}${r}`,
        cached: 0,
      });
    } else {
      const quantities = periods.map((period) =>
        item.key === 'ods'
          ? storageGiBForPeriod(result, period.index)
          : commercialQuantity(scenario.periods.find((p) => p.index === period.index), item.key),
      );

      for (const [i, period] of periods.entries()) {
        const c = colName(periodCol(period.index));
        cells.push({
          col: periodCol(period.index),
          value: null,
          style: item.source === 'choice' ? 'default' : 'number',
          formula: `Configurator!${c}${item.baseRow}`,
          cached: item.source === 'choice' ? undefined : quantities[i],
        });
      }

      if (item.source === 'choice') {
        // A yes/no is not a quantity. The Configurator applies it to the message
        // rate rather than charging for it, so there is nothing to multiply --
        // and multiplying "Yes" by a month count would put #VALUE! in the total.
        cells.push(text(TOTAL, 'applied to the message rate, not charged as a quantity', 'note'));
      } else {
        cells.push({
          col: TERM,
          value: null,
          style: 'number',
          formula: overTerm(r, (cell) => cell),
          cached: Number(
            quantities
              .reduce((sum, q, i) => sum + q * (commitment.months[i] ?? 0), 0)
              .toFixed(2),
          ),
        });
        cells.push({ col: PRICE, value: null, style: 'priceInput' });
        cells.push({
          col: TOTAL,
          value: null,
          style: 'money',
          formula: `${colName(TERM)}${r}*${colName(PRICE)}${r}*(1-${DISCOUNT_CELL})`,
          cached: 0,
        });
      }
    }

    rows.push(row(r, cells));
  }

  rows.push(
    row(totalRow, [
      text(PRICE, 'CTC commitment, whole term', 'label'),
      {
        col: TOTAL,
        value: null,
        style: 'moneyBold',
        formula: `SUM(${colName(TOTAL)}${FIRST_ITEM}:${colName(TOTAL)}${lastItemRow})`,
        cached: 0,
      },
    ]),
    row(totalRow + 2, [
      text(LABEL, 'Messages over the term', 'label'),
      num(TERM, Math.round(commitment.termMessages), 'numberBold'),
      text(TOTAL, 'every month at its own volume', 'note'),
    ]),
    row(totalRow + 3, [
      text(LABEL, 'Billable units if billed month by month', 'label'),
      num(TERM, commitment.termUnitsActual, 'number'),
      text(TOTAL, 'lower than the quoted commitment whenever the fleet ramps', 'note'),
    ]),
    row(totalRow + 4, [
      text(LABEL, 'Units quoted but not expected to be consumed', 'label'),
      num(TERM, Math.max(0, commitment.termUnitsQuoted - commitment.termUnitsActual), 'number'),
    ]),
    row(totalRow + 6, [
      text(
        LABEL,
        'The commitment above quotes each period at its peak month, as the Configurator does. Real ' +
          'consumption is the months added up, which is lower whenever the fleet ramps or February ' +
          'is in the term. Unused commitment is forfeited at expiry, so the gap is worth settling ' +
          'before signature.',
        'note',
      ),
    ]),
  );

  return {
    name: 'Quote',
    columnWidths: [3, 16, 40, ...periods.map(() => 17), 22, 24, 14, 18],
    freezeRows: HEAD_ROW,
    rows,
  };
}

export function workbookSheets(scenario: Scenario, result: ScenarioResult): Sheet[] {
  return [
    configuratorSheet(scenario, result),
    quoteSheet(scenario, result),
    designSheet(scenario),
    monthsSheet(result, scenario),
    storageSheet(result, scenario),
    guidanceSheet(result),
  ];
}

export function workbookFileName(scenario: Scenario): string {
  const stem = (scenario.name || 'message-estimate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'message-estimate'}-messages.xlsx`;
}
