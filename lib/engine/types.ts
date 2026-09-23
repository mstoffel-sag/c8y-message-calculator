/**
 * The message calculator's data model. CONCEPT.md section 5.
 *
 * Framework-agnostic on purpose: nothing in lib/ may import a UI library, a
 * Cumulocity SDK package or the DOM. The engine is the half of this tool that
 * has to survive being ported into an Angular app, so it stays portable.
 */

import type { Key, Params } from '../i18n/index.js';

/**
 * The five kinds a customer picks from. CONCEPT.md section 5, the kind selector.
 *
 * `'state'` was a sixth: a flag or status sent at the moment its value moved,
 * rather than on a tick. It is gone, and a series is a series -- everything in
 * the measurements table is sampled on an interval. A saved scenario carrying
 * one is converted on load (`normalise`), its change rate becoming the interval
 * that sends the same number of messages, so no figure moves.
 */
export type MetricKind =
  | 'continuous'
  | 'occurrence'
  | 'condition'
  | 'inventory'
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
   * honest form for it. Same two-rhythm choice as 'inventory'.
   */
  | { mode: 'command'; transitions: number; perMonth?: number; perDay?: number };

/**
 * The cadence modes each kind may carry.
 *
 * Only 'inventory' has a choice, and it needs one: a firmware version changes a
 * couple of times a year, while a config block re-sent nightly changes once a
 * day -- and a daily rate has to scale with month length to stay honest, which
 * a monthly count cannot do.
 */
export const CADENCE_FOR_KIND: Record<MetricKind, Array<Cadence['mode']>> = {
  continuous: ['interval'],
  occurrence: ['onChange'],
  condition: ['onChange'],
  inventory: ['perMonth', 'onChange'],
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
  /**
   * How many series this row stands for.
   *
   * Absent or 1 is the ordinary case: one row, one named series. A larger
   * number is the row a customer reaches for when they know their machine has
   * 450 PLC tags on a 60 s scan and have no intention of naming them -- a
   * count they can answer in seconds, where the alternative is 450 rows they
   * will never fill in.
   *
   * It changes no formula, only a multiplier: the messages come from how many
   * measurement types the tags travel in (`typesFor`), and the tag count is
   * what decides that, what is stored, and what the naive baseline would have
   * cost. So a counted row bundles, splits, is named and is given a retention
   * rule exactly like a row standing for one series, and the two sit in the
   * same table.
   */
  seriesCount?: number;
  /**
   * Each of this row's series travels in a measurement type of its own.
   *
   * A count says how many series there are; it does not say they share a
   * message. Plenty of agents post one datapoint per request -- a SmartREST
   * static template carries one series per row, and a tag-per-request gateway
   * is the commonest thing there is -- so a customer who says "ten tags" and
   * means "ten messages" has to be able to say so, or the tool quotes them a
   * design they have not built.
   *
   * Set, the row costs `seriesCount` measurements a tick instead of one. That
   * is its own naive baseline, so the row shows no saving against it -- which
   * is the honest answer, and the number the *Results* step then argues with.
   *
   * Mutually exclusive with sharing a measurement type, which is why the
   * wizard asks for it in the measurement-type dropdown rather than beside it:
   * a row cannot both ride in `acme_Climate` and send each series separately.
   * The engine copes with an imported scenario that claims both -- this row's
   * series each get a type and the rest of the bundle pools as usual -- rather
   * than silently picking one.
   */
  typePerSeries?: boolean;
  /**
   * Days the tenant's retention rule keeps this measurement type, when the
   * series travels alone -- an on-change flag, or a continuous series in no
   * bundle. Ignored while `bundleId` is set, for the same reason
   * `fragmentName` is: the type belongs to the bundle then, and so does its
   * rule.
   *
   * Absent means the scenario's default (`ScenarioSettings.retentionDays`).
   * Retention changes no counter -- only how much of what was written is still
   * on disk at the end of a month.
   */
  retentionDays?: number;
}

export interface Bundle {
  id: string;
  /** The measurement fragment these series share, e.g. `acme_Climate`. */
  fragmentName: string;
  intervalSeconds: number;
  metricIds: string[];
  /**
   * Days the tenant's retention rule keeps this measurement type. Absent means
   * the scenario's default.
   *
   * Retention rules in Cumulocity match on the measurement type, so this is
   * where one belongs -- not on the series inside it. A tenant that keeps
   * `acme_Climate` for 90 days and `acme_Vibration` for 7 is the normal case,
   * and a single scenario-wide number cannot express it.
   */
  retentionDays?: number;
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
  /**
   * Days of data the tenant keeps, from its retention rules. Decides the
   * operational storage estimate and nothing else -- retention does not change
   * how many messages are sent, only how many of them are still on disk.
   * Absent means DEFAULT_RETENTION_DAYS.
   */
  retentionDays?: number;
  /**
   * Bytes per stored value, for the single figure the Configurator's ODS cell
   * needs. The evidence is a range (100-400 B, unverified) and the Storage sheet
   * always reports both ends; this is the one number picked out of it to quote.
   *
   * Absent means BYTES_PER_VALUE_HIGH, the top of the range -- because under-
   * stating usage on a commit-to-consume contract does not save the customer
   * anything, it just depletes the commitment early and triggers a top-up.
   */
  bytesPerValue?: number;
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

/**
 * Whether a series reads as a flag or a status rather than a reading.
 *
 * There used to be a kind for this and there is not one any more, so the only
 * evidence left is the name and the absence of a unit. That is enough for the
 * two things it is used for -- showing 0/1 in a payload example, and warning
 * when a status is being sampled on a fast tick (L2) -- and both of those are
 * advice, so a false negative costs a missed hint rather than a wrong figure.
 *
 * Deliberately not a catalogue lookup: a customer types their own names, and
 * "Valve open/closed" should be recognised whether or not it is in the list.
 */
const FLAG_NAME = /\bon\s*\/\s*off\b|\bopen\s*\/\s*closed\b|status|\bstate\b|\bmode\b|occupancy|\benabled\b|\bpresent\b/i;

export function looksLikeFlag(metric: Metric): boolean {
  return metric.unit.trim() === '' && FLAG_NAME.test(metric.name);
}

/**
 * The platform's recommended ceiling on series in one measurement type.
 * CONCEPT.md section 11.
 *
 * It lives here rather than in lint.ts because it stopped being only a lint
 * threshold: the engine models the split it implies, so compute, the diagram
 * and the guidance report all have to agree on the same number.
 */
export const MAX_SERIES_PER_BUNDLE = 100;

/** How many series one row stands for. Absent, 0 and rubbish all mean one. */
export function seriesCountOf(metric: Metric): number {
  const raw = metric.seriesCount;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

/** The series a set of rows stands for -- what a measurement type carries. */
export function seriesIn(metrics: Metric[]): number {
  let total = 0;
  for (const metric of metrics) total += seriesCountOf(metric);
  return total;
}

/**
 * Measurement types the platform's recommendation would imply for this many
 * series -- `lint.ts` only, to price what following it would cost.
 *
 * It is NOT what the engine counts. A customer who says 450 series share a
 * measurement is describing an agent they have built, and the tool quotes the
 * design it is given: 100 is a recommendation about document shape and query
 * performance, not a limit the platform enforces, and a 450-series measurement
 * is accepted and billed as one message. The tool used to spread them anyway
 * and quote 5x, which over-stated every fleet whose agent really does post one
 * fat measurement. L6 says so instead.
 */
export function typesFor(series: number): number {
  return Math.max(1, Math.ceil(series / MAX_SERIES_PER_BUNDLE));
}

/**
 * Measurement types a set of rows really travels in.
 *
 * Two kinds of row, added up rather than chosen between: one that sends each
 * of its series separately contributes one type per series, and everything
 * else pools into a single type however many series that is. A measurement
 * type with nothing in it is no types at all, which is what makes this safe to
 * call on an empty list.
 */
export function typesIn(metrics: Metric[]): number {
  let pooled = 0;
  let own = 0;
  for (const metric of metrics) {
    if (metric.typePerSeries) own += seriesCountOf(metric);
    else pooled += seriesCountOf(metric);
  }
  return own + (pooled > 0 ? 1 : 0);
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

/**
 * Stored units written in one month under one retention rule.
 *
 * A unit is one measurement series value or one document -- an event, an alarm,
 * an operation. The engine groups by the number of days rather than by type:
 * two types kept for the same 30 days age out identically, and carrying their
 * names this far would only invite a per-type storage table nobody asked for.
 */
export interface RetentionBucket {
  retentionDays: number;
  values: number;
}

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
  /**
   * The same values, split by the retention rule that governs them.
   *
   * Retention is a property of the measurement type, so a month does not write
   * one heap of values that all age out together -- it writes one heap per
   * rule. Storage has to walk each heap back through its own window, which it
   * cannot do from a single total. Buckets sum to `storedValues`.
   */
  storedByRetention: RetentionBucket[];
  /**
   * Documents this month created outside the Measurement API -- one per event,
   * one per alarm raised, one per operation -- split by the retention rule
   * governing each type.
   *
   * Counted from the *creates* only. An alarm clear and an operation's status
   * transitions bill as messages and update the document they belong to; they
   * do not add a second one. An inventory write is the same: a PUT overwrites
   * the managed object in place, so it stores nothing new -- which is why an
   * inventory metric has no retention to speak of.
   */
  documentsByRetention: RetentionBucket[];
  /**
   * Managed objects registered this month.
   *
   * Kept apart from the buckets because they never age out: a retention rule
   * covers alarms, audit logs, events, measurements and operations -- a device
   * stays in the inventory until somebody deletes it. So these accumulate over
   * the whole run, and a long term is where they finally become visible.
   */
  permanentDocuments: number;
  /** Every series its own measurement, every state interval-sampled. */
  naiveTotal: number;
  /** One-off registration volume landing in this month. */
  onboardingCreates: number;
  byMachineType: Array<{ machineTypeId: string; name: string; total: number }>;
  /**
   * Messages per second averaged across the month. A sanity check on the
   * architecture, not a billing figure -- and deliberately not multiplied by a
   * burst factor: the tool has no way to know a fleet's burstiness, and asking
   * for a multiplier only to hand it back is an invented number wearing the
   * clothes of a measurement.
   */
  avgMessagesPerSec: number;
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

/**
 * Operational storage for one calendar month. Derived in storage.ts, which
 * carries the assumptions and their provenance.
 */
export interface StorageMonth {
  year: number;
  /** 1-12. */
  month: number;
  /** Which contract period this month belongs to; the Configurator is per period. */
  periodIndex: number;
  /** Measurement values written during this month. */
  written: number;
  /** Documents and managed objects created during this month. */
  writtenOther: number;
  /**
   * Values still inside their retention windows at the end of the month.
   *
   * The end of the month is the measuring point, not the fullest day: the
   * platform snapshots what the database holds when the month closes, and the
   * year's quantity is those snapshots added up. So this is a month-end
   * figure, and `PeriodStorage.giBMonths` is the sum that gets quoted.
   */
  retained: number;
  /** The measurement series values inside that total. */
  retainedMeasurements: number;
  /**
   * Everything else inside it: event, alarm and operation documents still
   * inside their windows, plus every managed object registered so far.
   *
   * Broken out because the byte figure behind the GiB columns was measured on
   * datapoints, so this is the part of the estimate resting on the weaker
   * assumption -- and because retention is what decides whether it matters. A
   * tenant keeping measurements for a week and alarms for five years has an
   * ODS bill this share dominates, which no fleet-wide ratio would predict.
   */
  retainedOther: number;
  /**
   * The longest retention window in play, in days -- the one that decides how
   * long storage keeps climbing. Equal to `retentionDaysShortest` when every
   * measurement type is kept for the same time, which is the common case.
   */
  retentionDays: number;
  /** The shortest window in play. Differs from `retentionDays` on a mixed tenant. */
  retentionDaysShortest: number;
  /**
   * Days of history behind the longest window; short while the fleet ramps.
   * A fleet two months into a rollout cannot have 90 days of anything.
   */
  daysCovered: number;
  lowGiB: number;
  highGiB: number;
  /**
   * The figure that goes in the quote, at the scenario's assumed bytes per
   * value. Somewhere in [lowGiB, highGiB]; the range stays reported beside it.
   */
  quotedGiB: number;
  /** The assumption behind quotedGiB, so it can be stated wherever it appears. */
  bytesPerValue: number;
  dataHubLowGiB: number;
  dataHubHighGiB: number;
  /**
   * Values per measurement document written this month. The source notes that
   * putting several datapoints in one measurement "can reduce required
   * diskspace significantly", because the envelope is paid once instead of
   * once per value -- so a fleet with fat measurements sits nearer the bottom
   * of the range than the top.
   */
  valuesPerMeasurement: number;
}

/**
 * Operational storage for one contract period -- the quantity the Configurator
 * actually asks for.
 *
 * Storage is billed on what the database holds at the end of each month,
 * captured every month and added up over the period. So the quantity is a sum
 * of month-end snapshots, in GiB-months, and not the fullest month: a period
 * that ends full has paid for every month it took to fill up.
 */
export interface PeriodStorage {
  periodIndex: number;
  /** Calendar months summed -- the period's length, and the divisor for `averageGiB`. */
  monthsCounted: number;
  /** The quantity: month-end GiB added up, at the scenario's assumed bytes per value. */
  giBMonths: number;
  /** The same sum at each end of the unverified byte range. */
  lowGiBMonths: number;
  highGiBMonths: number;
  dataHubLowGiBMonths: number;
  dataHubHighGiBMonths: number;
  /** `giBMonths / monthsCounted` -- what a month of the period holds on average. */
  averageGiB: number;
  /** The fullest month in the period. Not the quantity, but worth naming. */
  peak?: StorageMonth;
}

export interface ScenarioResult {
  scenarioName: string;
  periods: PeriodResult[];
  months: MonthResult[];
  peakMonth: MonthResult;
  leanMonth: MonthResult;
  findings: Finding[];
  /** One entry per month, aligned with `months`. */
  storage: StorageMonth[];
  /**
   * The fullest month. Storage accumulates, so this is not always the peak
   * message month -- it keeps climbing while the fleet grows.
   */
  peakStorage?: StorageMonth;
  /** One entry per contract period: the month-end snapshots, added up. */
  storageByPeriod: PeriodStorage[];
}

/* ------------------------------------------------------------------- linting */

export type Severity = 'error' | 'warning' | 'suggestion';

export interface Finding {
  /** L1 .. L10, matching CONCEPT.md section 7. */
  rule: string;
  severity: Severity;
  /**
   * The sentence and the paragraph, as catalogue keys and their parameters.
   *
   * The engine decides which rule fires and what the numbers are; it does not
   * decide what language they are read in. Strings here would have made the
   * guidance panel the one English island in a German session.
   */
  titleKey: Key;
  titleParams?: Params;
  detailKey: Key;
  detailParams?: Params;
  machineTypeId?: string;
  metricIds?: string[];
  bundleId?: string;
  /**
   * Messages per 31-day month this finding is worth, where the rule can put a
   * number on it. Advice is quantified rather than asserted.
   */
  messageDelta?: number;
}
