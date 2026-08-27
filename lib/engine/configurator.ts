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

/** Rows between one period's block and the next. */
export const PERIOD_ROW_STRIDE = 30;
export const MAX_PERIODS = 5;

export type LineItemGroup = 'Deployment' | 'Core Metrics' | 'Add-Ons' | 'Support';

/** What the tool can say about a line item. */
export type LineItemSource =
  | 'calculated' // the tool derives it from the fleet
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
  help?: string;
}

export const LINE_ITEMS: LineItem[] = [
  {
    key: 'sharedCloud', group: 'Deployment', label: 'Public/Shared Cloud',
    unit: 'per Deployment', baseRow: 23, source: 'asked',
    help: 'One tenant on public cloud, with Device Management, Digital Twin Manager, Cockpit, smart rules, the multi-tenant Analytics Builder and the device agents. Shared Cloud customers get a Tier 2 tenant.',
  },
  {
    key: 'dedicatedProd', group: 'Deployment', label: 'Dedicated - Production',
    unit: 'per Deployment', baseRow: 24, source: 'asked',
    help: 'A dedicated environment with a management tenant plus one production tenant on a high SLA. Dedicated customers are granted access to the Management Tenant, the top of the three-level hierarchy.',
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
    help: 'The sum of the nine counters below. This is what the calculator exists to produce.',
  },
  {
    key: 'ods', group: 'Core Metrics', label: 'Operational Data Store',
    unit: 'per GiB', baseRow: 37, source: 'asked',
    help: 'Daily maximum storage, in GiB. The calculator estimates a range on the Storage sheet -- 100 to 400 bytes per stored value, over the tenant\'s retention period -- from rules of thumb that are marked "to be verified" at source. It stays an asked figure because a 4x spread is a judgement, not an answer: pick from the range and say which end you picked.',
  },

  {
    key: 'streamingAnalytics', group: 'Add-Ons', label: 'Streaming Analytics - Per-Tenant',
    unit: 'per Tenant', baseRow: 38, source: 'asked',
    help: 'The per-tenant edition. Note the multi-tenant Analytics Builder is already included with a deployment, and EPL Apps come with Dedicated.',
  },
  {
    key: 'dataHubStandard', group: 'Add-Ons', label: 'DataHub - Standard Deployment',
    unit: 'uplift on Messages', baseRow: 39, source: 'choice',
    help: 'Answering yes applies an uplift to the message rate in the Configurator. It does not change the message count, so it does not change anything the calculator computes -- it is carried through so the quote is complete.',
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
    help: 'One CCU is 1 CPU and 4 GiB of RAM. Custom microservices only -- the calculator itself runs entirely in the browser and needs none.',
  },
  {
    key: 'enterpriseFunctions', group: 'Add-Ons', label: 'Enterprise Functions',
    unit: 'per Account', baseRow: 43, source: 'asked',
    help: 'Custom branding, custom domains and the user hierarchy.',
  },
  {
    key: 'tenants', group: 'Add-Ons', label: 'Tenants',
    unit: 'per Tenant', baseRow: 44, source: 'asked',
    help: 'Additional tenants beyond the one the deployment includes. With the Multi-Tenancy add-on a customer can create these themselves. Tenants that have child tenants used to be called Enterprise Tenants; that name is no longer used for billing.',
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
