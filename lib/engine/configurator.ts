/**
 * The Sales Configurator's line items, and where each one lives.
 *
 * The Configurator repeats an identical block for each of its five periods,
 * offset by 30 rows: period 1 occupies rows 21-49, period 2 rows 51-79, and so
 * on. Knowing that, the tool can hand back an exact cell reference for every
 * number it produces, which is the difference between "here are some figures"
 * and "type these into these cells".
 *
 * This module carries line item names and cell addresses only. It holds no
 * price, no rate and no currency, and it never reads one out of the workbook --
 * see CONCEPT.md section 1.
 */

import type { Key } from '../i18n/index.js';
import type { Scenario } from './types.js';

/** Rows between one period's block and the next. */
export const PERIOD_ROW_STRIDE = 30;
export const MAX_PERIODS = 5;

export type LineItemGroup = 'Deployment' | 'Core Metrics' | 'Add-Ons' | 'Support';

/** What the tool can say about a line item. */
export type LineItemSource =
  | 'calculated' // the tool derives it from the fleet
  | 'estimated' // the tool derives it, on assumptions worth overriding
  | 'asked' // the customer states it; the tool cannot derive it
  | 'choice'; // a yes/no the customer makes

export interface LineItem {
  key: string;
  group: LineItemGroup;
  /** Exactly as the Configurator labels it. */
  label: string;
  /** The Configurator's own unit column. */
  unit: string;
  /** Row in period 1's block. */
  baseRow: number;
  source: LineItemSource;
  /** Shown in the wizard so the customer knows what they are answering. */
  helpKey?: Key;
}

export const LINE_ITEMS: LineItem[] = [
  {
    key: 'sharedCloud', group: 'Deployment', label: 'Public/Shared Cloud',
    unit: 'per Deployment', baseRow: 23, source: 'asked',
    helpKey: 'item.sharedCloud.help',
  },
  {
    key: 'dedicatedProd', group: 'Deployment', label: 'Dedicated - Production',
    unit: 'per Deployment', baseRow: 24, source: 'asked',
    helpKey: 'item.dedicatedProd.help',
  },
  {
    key: 'dedicatedDev', group: 'Deployment', label: 'Dedicated - Development',
    unit: 'per Deployment', baseRow: 25, source: 'asked',
  },
  {
    key: 'dedicatedTest', group: 'Deployment', label: 'Dedicated - Testing',
    unit: 'per Deployment', baseRow: 26, source: 'asked',
  },

  {
    key: 'messages', group: 'Core Metrics', label: 'Messages',
    unit: 'per 100K per month', baseRow: 27, source: 'calculated',
    helpKey: 'item.messages.help',
  },
  {
    key: 'ods', group: 'Core Metrics', label: 'Operational Data Store',
    unit: 'per GiB', baseRow: 37, source: 'estimated',
    helpKey: 'item.ods.help',
  },

  {
    key: 'streamingAnalytics', group: 'Add-Ons', label: 'Streaming Analytics - Per-Tenant',
    unit: 'per Tenant', baseRow: 38, source: 'asked',
    helpKey: 'item.streamingAnalytics.help',
  },
  {
    key: 'dataHubStandard', group: 'Add-Ons', label: 'DataHub - Standard Deployment',
    unit: 'uplift on Messages', baseRow: 39, source: 'choice',
    helpKey: 'item.dataHubStandard.help',
  },
  {
    key: 'dataHubQueriedGiB', group: 'Add-Ons', label: 'DataHub - Standard: data queried',
    unit: 'per GiB of Data Queried', baseRow: 40, source: 'asked',
  },
  {
    key: 'dataHubDedicated', group: 'Add-Ons', label: 'DataHub - Dedicated Deployment',
    unit: 'per 16 GiB Memory', baseRow: 41, source: 'asked',
  },
  {
    key: 'microserviceCcu', group: 'Add-Ons', label: 'Microservice Hosting',
    unit: 'per CCU (1c-4g)', baseRow: 42, source: 'asked',
    helpKey: 'item.microserviceCcu.help',
  },
  {
    key: 'enterpriseFunctions', group: 'Add-Ons', label: 'Enterprise Functions',
    unit: 'per Account', baseRow: 43, source: 'asked',
    helpKey: 'item.enterpriseFunctions.help',
  },
  {
    key: 'tenants', group: 'Add-Ons', label: 'Tenants',
    unit: 'per Tenant', baseRow: 44, source: 'asked',
    helpKey: 'item.tenants.help',
  },
  {
    key: 'dataBroker', group: 'Add-Ons', label: 'Data Broker',
    unit: 'per Tenant', baseRow: 45, source: 'asked',
  },
  {
    key: 'vpn', group: 'Add-Ons', label: 'VPN Services',
    unit: 'per Virtual Private Connection', baseRow: 46, source: 'asked',
  },
  {
    key: 'goldSupport', group: 'Support', label: 'Gold (Public Cloud Upgrade)',
    unit: 'per Public Cloud Deployment', baseRow: 47, source: 'asked',
  },
];

export const ASKED_LINE_ITEMS = LINE_ITEMS.filter((i) => i.source !== 'calculated');

/** Column D cell for a line item in a given period, e.g. period 2 -> "D53". */
export function cellFor(baseRow: number, periodIndex: number): string {
  return `D${baseRow + (periodIndex - 1) * PERIOD_ROW_STRIDE}`;
}

/** The period's own header cell, where its length in months goes. */
export function periodMonthsCell(periodIndex: number): string {
  return `D${21 + (periodIndex - 1) * PERIOD_ROW_STRIDE}`;
}

/** Base row of each of the nine counters, in Configurator order. */
export const COUNTER_BASE_ROWS = [28, 29, 30, 31, 32, 33, 34, 35, 36] as const;

/** One deployment or add-on line, with what each period states for it. */
export interface StatedLine {
  item: LineItem;
  /** A quantity, or a yes/no for a `choice` line, keyed by period index. */
  values: { index: number; value: number | boolean }[];
}

/**
 * The deployment, add-on and support lines somebody actually stated, for the
 * results page to show beside the quote.
 *
 * Messages and storage are left out -- the quote above carries both, rounded
 * the way they are billed -- and so is every line at zero or "no" in every
 * period: on a typical estimate most of the fifteen are, and listing them buries
 * the one or two that are not. Nothing is derived here; each value is what the
 * Contract step holds, which is also what the workbook writes.
 */
export function statedLines(scenario: Scenario): StatedLine[] {
  const periods = [...scenario.periods].sort((a, b) => a.index - b.index);
  return LINE_ITEMS.filter((item) => item.source === 'asked' || item.source === 'choice')
    .map((item) => ({
      item,
      values: periods.map((p) => {
        const value = p.commercial[item.key];
        return {
          index: p.index,
          value: item.source === 'choice' ? value === true : typeof value === 'number' ? value : 0,
        };
      }),
    }))
    .filter((line) => line.values.some(({ value }) => value === true || (typeof value === 'number' && value > 0)));
}
