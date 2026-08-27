/**
 * The message calculator's data model. CONCEPT.md section 5.
 *
 * Framework-agnostic on purpose: nothing in lib/ may import a UI library, a
 * Cumulocity SDK package or the DOM. The engine is the half of this tool that
 * has to survive being ported into an Angular app, so it stays portable.
 */

/** The six kinds a customer picks from. CONCEPT.md section 5, the kind selector. */
export type MetricKind =
  | 'continuous'
  | 'state'
  | 'occurrence'
  | 'condition'
  | 'fact'
  | 'command';

/**
 * Each kind asks for the cadence that kind implies, never a generic rate.
 * Asking "how many per second" for a status flag is how customers end up
 * sampling flags on a timer.
 */
export type Cadence =
  | { mode: 'interval'; seconds: number }
  | { mode: 'onChange'; perDay: number }
  | { mode: 'perMonth'; count: number }
  /**
   * Exactly one of perMonth / perDay is set. A monthly firmware campaign
   * happens once per calendar month whatever its length, so perMonth does not
   * scale with days; a command sent most working days does, so perDay is the
   * honest form for it. Same two-rhythm choice as 'fact'.
   */
  | { mode: 'command'; transitions: number; perMonth?: number; perDay?: number };

/**
 * The cadence modes each kind may carry.
 *
 * Only 'fact' has a choice, and it needs one: a firmware version changes a
 * couple of times a year, while a config block re-sent nightly changes once a
 * day -- and a daily rate has to scale with month length to stay honest, which
 * a monthly count cannot do.
 */
export const CADENCE_FOR_KIND: Record<MetricKind, Array<Cadence['mode']>> = {
  continuous: ['interval'],
  state: ['onChange'],
  occurrence: ['onChange'],
  condition: ['onChange'],
  fact: ['perMonth', 'onChange'],
  command: ['command'],
};

export interface Metric {
  id: string;
  name: string;
  unit: string;
  kind: MetricKind;
  cadence: Cadence;
  /** Free text; drives bundle proposal and the L1 / L6 lint rules. */
  semanticGroup: string;
  /**
   * Continuous metrics only; null or absent means the metric gets its own
   * measurement. The UI only offers this field for continuous metrics, which
   * is what makes the section 4.3 hard error structurally unreachable rather
   * than merely warned about -- but the engine still checks (L3), because a
   * scenario can also arrive by JSON import.
   */
  bundleId?: string | null;
  /**
   * Set when the customer says this fact is re-sent on a timer or at every
   * boot rather than on change. Drives L10. Every successful PUT counts,
   * including the ones that change nothing.
   */
  resentOnTimer?: boolean;
  /**
   * The measurement type a series sends in when it travels alone -- an
   * on-change flag, or a timed reading pulled out of its bundle. Blank or
   * absent means the name is derived from the series name, which is what the
   * tool suggests; a bundled series takes its name from the Bundle instead, so
   * this is ignored while bundleId is set.
   */
  fragmentName?: string;
}

export interface Bundle {
  id: string;
  /** The measurement fragment these series share, e.g. `acme_Climate`. */
  fragmentName: string;
  intervalSeconds: number;
  metricIds: string[];
}

export interface MachineType {
  id: string;
  name: string;
  machineCount: number;
  /** Duty cycle / connectivity availability, 0-100. */
  onlinePct: number;
  /**
   * How this machine's data reaches Cumulocity -- OPC UA, Modbus TCP, native
   * MQTT, a custom agent. Free text, from a catalogue that can be escaped.
   *
   * Descriptive only: it is deliberately absent from every counter, because a
   * message is one request to the platform however it was produced. What it
   * changes is who builds what, and whether bundling is work or a setting --
   * which is advice, not arithmetic. Blank means "not decided yet", which is a
   * perfectly common answer at estimate time.
   */
  protocol?: string;
  metrics: Metric[];
  bundles: Bundle[];
}

/**
 * The Configurator line items the fleet cannot imply: deployments, add-ons and
 * support. Quantities only -- the tool carries these through so the quote is
 * complete, and never prices them.
 */
export type Commercial = Record<string, number | boolean>;

export interface Period {
  index: number;
  /** Length in calendar months. The Configurator allows up to five periods. */
  months: number;
  /** machineTypeId -> count for this period; absent falls back to machineCount. */
  machineCountOverrides: Record<string, number>;
  /** Keyed by LineItem.key. The Configurator repeats these per period, so we do too. */
  commercial: Commercial;
}

export interface ScenarioSettings {
  /** Multiplier applied to the average rate to report a peak throughput. */
  peakFactor: number;
  /**
   * Where the ramp starts on the calendar. Billing is per calendar month, so
   * real month lengths matter and the engine needs to know which months these
   * are. Not in CONCEPT.md's model -- added because 'daysInMonth(year, month)'
   * cannot be evaluated without it.
   */
  startYear: number;
  /** 1-12. */
  startMonth: number;
  /**
   * Vendor prefix for generated fragment names, e.g. 'acme' -> 'acme_Climate'.
   * Customer-visible in every payload example, so it is worth getting right.
   */
  fragmentPrefix: string;
}

export interface Scenario {
  name: string;
  notes: string;
  settings: ScenarioSettings;
  periods: Period[];
  machineTypes: MachineType[];
}

/* ------------------------------------------------------------------ counters */

/**
 * The nine counters, in Configurator row order. This array is the contract:
 * index 0 is D28 and index 8 is D36, so a results table can be pasted into the
 * quote without anybody reordering rows by hand.
 */
export const COUNTER_KEYS = [
  'measurementsCreated',
  'eventsCreated',
  'eventsUpdated',
  'alarmsCreated',
  'alarmsUpdated',
  'inventoriesCreated',
  'inventoriesUpdated',
  'operationsCreated',
  'operationsUpdated',
] as const;

export type CounterKey = (typeof COUNTER_KEYS)[number];

export type Counters = Record<CounterKey, number>;

/** Labels exactly as they read in the Configurator, C28:C36. */
export const COUNTER_LABELS: Record<CounterKey, string> = {
  measurementsCreated: 'Measurements Created',
  eventsCreated: 'Events Created',
  eventsUpdated: 'Events Updated',
  alarmsCreated: 'Alarms Created',
  alarmsUpdated: 'Alarms Updated',
  inventoriesCreated: 'Inventories Created',
  inventoriesUpdated: 'Inventories Updated',
  operationsCreated: 'Operations Created',
  operationsUpdated: 'Operations Updated',
};

/** The Configurator cell each counter belongs in, for period 1. */
export const COUNTER_CELLS: Record<CounterKey, string> = {
  measurementsCreated: 'D28',
  eventsCreated: 'D29',
  eventsUpdated: 'D30',
  alarmsCreated: 'D31',
  alarmsUpdated: 'D32',
  inventoriesCreated: 'D33',
  inventoriesUpdated: 'D34',
  operationsCreated: 'D35',
  operationsUpdated: 'D36',
};

export function zeroCounters(): Counters {
  return {
    measurementsCreated: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    alarmsCreated: 0,
    alarmsUpdated: 0,
    inventoriesCreated: 0,
    inventoriesUpdated: 0,
    operationsCreated: 0,
    operationsUpdated: 0,
  };
}

export function addCounters(into: Counters, from: Counters): Counters {
  for (const key of COUNTER_KEYS) into[key] += from[key];
  return into;
}

export function totalOf(counters: Counters): number {
  let total = 0;
  for (const key of COUNTER_KEYS) total += counters[key];
  return total;
}

/* ------------------------------------------------------------------- results */

export interface MonthResult {
  year: number;
  /** 1-12. */
  month: number;
  days: number;
  periodIndex: number;
  /** Position of this month inside its period, from 1. */
  monthOfPeriod: number;
  counters: Counters;
  total: number;
  /**
   * Measurement series written, as a count. Deliberately not bytes: there is
   * no fixed relation between payload and stored size (section 4.4), so the
   * tool does not invent one.
   */
  storedValues: number;
  /** Every series its own measurement, every state interval-sampled. */
  naiveTotal: number;
  /** One-off registration volume landing in this month. */
  onboardingCreates: number;
  byMachineType: Array<{ machineTypeId: string; name: string; total: number }>;
  avgMessagesPerSec: number;
  peakMessagesPerSec: number;
  perMachinePerMonth: number;
  machinesOnline: number;
}

export interface PeriodResult {
  index: number;
  months: MonthResult[];
  /** Counters at this period's peak month -- the figure that belongs in the quote. */
  peak: MonthResult;
  lean: MonthResult;
  /** Total messages across the whole period, for the ramp view. */
  periodTotal: number;
}

export interface ScenarioResult {
  scenarioName: string;
  periods: PeriodResult[];
  months: MonthResult[];
  peakMonth: MonthResult;
  leanMonth: MonthResult;
  findings: Finding[];
}

/* ------------------------------------------------------------------- linting */

export type Severity = 'error' | 'warning' | 'suggestion';

export interface Finding {
  /** L1 .. L10, matching CONCEPT.md section 7. */
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  machineTypeId?: string;
  metricIds?: string[];
  bundleId?: string;
  /**
   * Messages per 31-day month this finding is worth, where the rule can put a
   * number on it. Advice is quantified rather than asserted.
   */
  messageDelta?: number;
}
