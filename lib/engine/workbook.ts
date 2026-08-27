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
import { formatMonth } from './calendar.js';
import { measurementView } from './diagram.js';
import { machineCountIn } from './compute.js';
import { DEFAULT_RETENTION_DAYS, STORAGE_SOURCE_NOTE } from './storage.js';
import type { MetricKind, Period, Scenario, ScenarioResult } from './types.js';
import type { Cell, Row, Sheet } from '../xlsx/writer.js';

const COL = { category: 2, label: 3, value: 4, unit: 6, note: 7 } as const;

/** Which Cumulocity element each kind writes to, for the Design sheet. */
const ELEMENT_OF: Partial<Record<MetricKind, string>> = {
  occurrence: 'an event',
  condition: 'an alarm (raise + clear)',
  fact: 'the managed object',
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
 * Only the peak month of each period appears. A period is quoted at one number
 * per counter and the peak is the honest one to quote -- the full month-by-month
 * spread is on its own sheet so the range stays visible.
 */
function configuratorSheet(scenario: Scenario, result: ScenarioResult): Sheet {
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
        'Rows align with the Sales Configurator: copy column D for a period and paste it at the same cell there. Prices, discounts and currency stay in the Configurator -- this file has none.',
        'note',
      ),
    ]),
  ];

  for (const period of result.periods) {
    const base = 21 + (period.index - 1) * PERIOD_ROW_STRIDE;
    const scenarioPeriod = scenario.periods.find((p) => p.index === period.index);
    const peak = period.peak;

    rows.push(
      row(base, [
        text(COL.label, `Period ${period.index}:`, 'label'),
        num(COL.value, scenarioPeriod?.months ?? 0, 'numberBold'),
        text(5, 'months', 'note'),
        text(
          COL.note,
          `peak month ${formatMonth(peak.year, peak.month)}, ${peak.days} days`,
          'note',
        ),
      ]),
    );

    rows.push(
      row(base + 1, [
        text(COL.category, 'Category', 'heading'),
        text(COL.label, 'Product Name', 'heading'),
        text(COL.value, 'Quantity per Month', 'heading'),
        text(5, '', 'heading'),
        text(COL.unit, 'Unit', 'heading'),
        text(COL.note, 'Where this came from', 'heading'),
      ]),
    );

    let lastCategory = '';
    for (const item of LINE_ITEMS) {
      const r = item.baseRow + (period.index - 1) * PERIOD_ROW_STRIDE;
      const cells: Cell[] = [];

      if (item.group !== lastCategory) {
        cells.push(text(COL.category, item.group, 'label'));
        lastCategory = item.group;
      }
      cells.push(text(COL.label, item.label, item.key === 'messages' ? 'label' : 'default'));
      cells.push(text(COL.unit, item.unit, 'note'));

      if (item.key === 'messages') {
        // Left blank on purpose. In the Configurator this cell holds
        // =SUM(D28:D36) -- the only formula in column D -- so writing a value
        // here would mean pasting a column that silently replaces it with a
        // constant. The total goes in the notes column as a cross-check.
        cells.push(text(COL.value, ''));
        cells.push(
          text(
            COL.note,
            `leave this cell alone: the Configurator sums it. Should come to ${Math.round(peak.total).toLocaleString('en-GB')}`,
            'note',
          ),
        );
      } else {
        const value = scenarioPeriod?.commercial[item.key];
        if (typeof value === 'number' && value > 0) cells.push(num(COL.value, value));
        else if (value === true) cells.push(text(COL.value, 'Yes'));
        cells.push(text(COL.note, 'stated in the wizard', 'note'));
      }

      rows.push(row(r, cells));
    }

    // The nine counters, at the rows the Configurator keeps for them.
    COUNTER_KEYS.forEach((key, i) => {
      const r = COUNTER_BASE_ROWS[i]! + (period.index - 1) * PERIOD_ROW_STRIDE;
      rows.push(
        row(r, [
          text(COL.label, `- ${COUNTER_LABELS[key]}`),
          num(COL.value, peak.counters[key]),
          text(COL.note, cellFor(COUNTER_BASE_ROWS[i]!, period.index), 'cellRef'),
        ]),
      );
    });

    rows.push(
      row(base + 27, [
        text(
          COL.label,
          `Column D here is safe to paste wholesale at ${periodMonthsCell(period.index)} -- ` +
            `every cell in it is an input in the Configurator except ${cellFor(27, period.index)}, ` +
            `which is left blank here so its formula survives.`,
          'note',
        ),
      ]),
    );
  }

  return {
    name: 'Configurator',
    columnWidths: [3, 16, 34, 20, 9, 30, 42],
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
            text(7, group.cadence),
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
          .join(', ')}. Peak factor ${scenario.settings.peakFactor}x applies to the throughput check only.`,
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
    row(2, [text(1, STORAGE_SOURCE_NOTE, 'note')]),
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
          text(3, finding.title),
          text(4, finding.detail),
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
 * Sheet 2: the quote.
 *
 * Ships with **price columns and no prices**. The customer fills in the wizard
 * and sends the file on; the salesperson opens this sheet, types their own unit
 * prices into the shaded column, and the totals compute themselves.
 *
 * That is what lets the constraint hold (CONCEPT.md section 1). The tool
 * contains no price list, the file the customer sends contains no price list,
 * and the numbers arrive from the person doing the quoting. Nothing
 * confidential is ever in the bundle.
 *
 * Quantities are referenced from the Configurator sheet rather than copied, so
 * there is one source of truth for every figure.
 */
function quoteSheet(scenario: Scenario, result: ScenarioResult): Sheet {
  const rows: Row[] = [
    row(1, [text(QUOTE_COL.category, 'Quote', 'title')]),
    row(2, [text(QUOTE_COL.category, scenario.name || 'Untitled scenario', 'label')]),
    row(3, [
      text(
        QUOTE_COL.category,
        'Quantities come from the estimate. Type your own unit prices into the shaded column and the totals follow. This file ships with no prices in it.',
        'note',
      ),
    ]),
    row(4, [
      text(
        QUOTE_COL.category,
        'Messages are sold per 100,000 per month, so the Billable Quantity column rounds the message count up for you.',
        'note',
      ),
    ]),
    row(6, [
      text(QUOTE_COL.label, 'Catalog discount', 'label'),
      { col: QUOTE_COL.quantity, value: null, style: 'percentInput' },
      text(
        QUOTE_COL.unit,
        'applies to every line except Messages, as the Configurator does',
        'note',
      ),
    ]),
    row(8, [
      text(QUOTE_COL.label, 'Quote total, all periods', 'label'),
      {
        col: QUOTE_COL.total,
        value: null,
        style: 'moneyBold',
        formula: result.periods
          .map((p) => `H${49 + (p.index - 1) * PERIOD_ROW_STRIDE}`)
          .join('+'),
        cached: 0,
      },
    ]),
    row(9, [
      text(
        QUOTE_COL.label,
        'Discounts, approval thresholds and currency conversion stay in the Sales Configurator. This sheet is a working total, not an approved quote.',
        'note',
      ),
    ]),
  ];

  for (const period of result.periods) {
    const offset = (period.index - 1) * PERIOD_ROW_STRIDE;
    const base = 21 + offset;
    const scenarioPeriod = scenario.periods.find((p) => p.index === period.index);
    const monthsCell = `D${base}`;
    const peak = period.peak;

    rows.push(
      row(base, [
        text(QUOTE_COL.label, `Period ${period.index}:`, 'label'),
        num(QUOTE_COL.quantity, scenarioPeriod?.months ?? 0, 'numberBold'),
        text(5, 'months', 'note'),
      ]),
    );

    rows.push(
      row(base + 1, [
        text(QUOTE_COL.category, 'Category', 'heading'),
        text(QUOTE_COL.label, 'Product Name', 'heading'),
        text(QUOTE_COL.quantity, 'Quantity per Month', 'heading'),
        text(QUOTE_COL.billable, 'Billable Quantity', 'heading'),
        text(QUOTE_COL.unit, 'Unit', 'heading'),
        text(QUOTE_COL.price, 'Unit Price', 'heading'),
        text(QUOTE_COL.total, 'Total Price', 'heading'),
      ]),
    );

    let lastCategory = '';
    for (const item of LINE_ITEMS) {
      const r = item.baseRow + offset;
      const cells: Cell[] = [];

      if (item.group !== lastCategory) {
        cells.push(text(QUOTE_COL.category, item.group, 'label'));
        lastCategory = item.group;
      }
      cells.push(text(QUOTE_COL.label, item.label, item.key === 'messages' ? 'label' : 'default'));
      cells.push(text(QUOTE_COL.unit, item.unit, 'note'));

      if (item.key === 'messages') {
        // The Configurator sums the nine counters; so does this.
        const first = COUNTER_BASE_ROWS[0]! + offset;
        const last = COUNTER_BASE_ROWS[COUNTER_BASE_ROWS.length - 1]! + offset;
        cells.push({
          col: QUOTE_COL.quantity,
          value: null,
          style: 'numberBold',
          formula: `SUM(Configurator!D${first}:D${last})`,
          cached: peak.total,
        });
        cells.push({
          col: QUOTE_COL.billable,
          value: null,
          style: 'number',
          formula: `ROUNDUP(D${r}/100000,0)`,
          cached: Math.ceil(peak.total / 100_000),
        });
        cells.push({ col: QUOTE_COL.price, value: null, style: 'priceInput' });
        // Messages carry their own negotiated rate, so no catalog discount.
        cells.push({
          col: QUOTE_COL.total,
          value: null,
          style: 'money',
          formula: `E${r}*G${r}`,
          cached: 0,
        });
      } else if (item.source === 'choice') {
        cells.push({ col: QUOTE_COL.quantity, value: null, formula: `Configurator!D${r}` });
      } else {
        const quantity = commercialQuantity(scenarioPeriod, item.key);
        cells.push({
          col: QUOTE_COL.quantity,
          value: null,
          style: 'number',
          formula: `Configurator!D${r}`,
          cached: quantity,
        });
        cells.push({
          col: QUOTE_COL.billable,
          value: null,
          style: 'number',
          formula: `D${r}`,
          cached: quantity,
        });
        cells.push({ col: QUOTE_COL.price, value: null, style: 'priceInput' });
        cells.push({
          col: QUOTE_COL.total,
          value: null,
          style: 'money',
          formula: `E${r}*G${r}*(1-${DISCOUNT_CELL})`,
          cached: 0,
        });
      }

      rows.push(row(r, cells));
    }

    // The nine counters as sub-lines: they make up the message figure, so they
    // are shown, but they are not priced separately.
    COUNTER_KEYS.forEach((key, i) => {
      const r = COUNTER_BASE_ROWS[i]! + offset;
      rows.push(
        row(r, [
          text(QUOTE_COL.label, `- ${COUNTER_LABELS[key]}`),
          {
            col: QUOTE_COL.quantity,
            value: null,
            style: 'number',
            formula: `Configurator!D${r}`,
            cached: peak.counters[key],
          },
        ]),
      );
    });

    const itemFirst = 23 + offset;
    const itemLast = 47 + offset;
    rows.push(
      row(base + 27, [
        text(QUOTE_COL.price, 'Total (Monthly)', 'label'),
        {
          col: QUOTE_COL.total,
          value: null,
          style: 'moneyBold',
          formula: `SUM(H${itemFirst}:H${itemLast})`,
          cached: 0,
        },
      ]),
      row(base + 28, [
        text(QUOTE_COL.price, 'Total (Period)', 'label'),
        {
          col: QUOTE_COL.total,
          value: null,
          style: 'moneyBold',
          formula: `H${base + 27}*${monthsCell}`,
          cached: 0,
        },
      ]),
    );
  }

  return {
    name: 'Quote',
    columnWidths: [3, 16, 34, 20, 18, 30, 14, 16],
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
