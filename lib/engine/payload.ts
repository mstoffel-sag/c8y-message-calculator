/**
 * Payload examples. CONCEPT.md section 7, "Payload design".
 *
 * What turns an estimate into an implementation brief: for every bundle and
 * every on-change metric, the actual JSON the device should send. A customer
 * who can copy the payload does not have to trust the arithmetic.
 */

import type { Key, Params } from '../i18n/index.js';
import {
  MAX_SERIES_PER_BUNDLE,
  looksLikeFlag,
  seriesCountOf,
  seriesIn,
  typesIn,
  type Bundle,
  type Metric,
  type MachineType,
} from './types.js';
import { resolveBundles } from './compute.js';
import { bundleFragmentName } from './bundling.js';

/**
 * Which namespace a name lives in. Measurement fragments, event types, alarm
 * types and inventory fragments are four separate namespaces that never
 * collide, and saying so stops a list of six names reading as six measurement
 * fragments.
 */
export type PayloadNamespace =
  | 'measurement fragment'
  | 'event type'
  | 'alarm type'
  | 'inventory fragment';

export interface PayloadExample {
  /** A name from the scenario -- data, so it is not translated. */
  title?: string;
  /** Or a phrase about the shape, which is. */
  titleKey?: Key;
  titleParams?: Params;
  namespace: PayloadNamespace;
  /** The fragment or type name itself, for grouping and for the L7 check. */
  name: string;
  /**
   * Series inside one of these. Four named readings is four; a row standing
   * for 450 PLC tags is 450.
   */
  seriesCount: number;
  /**
   * Measurement types the design actually sends, where more series were asked
   * for than the platform recommends putting in one measurement. 1 for
   * everything else, and for every element that is not a measurement.
   */
  types: number;
  restPath: string;
  restBody: string;
  mqttTopic: string;
  mqttBody: string;
  /**
   * The sentences under the example, in order. Two keys where two paragraphs of
   * advice apply -- the bundle note plus the SmartREST caveat -- rather than one
   * key holding a joined string, so a translator sees each argument whole.
   */
  noteKeys: Key[];
  /**
   * Parameters for those notes -- one bag for the whole example rather than
   * one per key, because the only note that takes any is the split note and a
   * parameter no sentence mentions costs nothing.
   */
  noteParams?: Params;
}

/** A plausible series name from a human metric name: "Supply air temp" -> "supplyAirTemp". */
export function seriesNameOf(metricName: string): string {
  const words = metricName
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'value';
  return words
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

const SAMPLE_TIME = '2026-03-17T09:30:00.000Z';

/**
 * Names a fragment or type in the customer's own namespace.
 *
 * Never `c8y_`: that prefix is Cumulocity's reserved namespace, and a payload
 * example that writes into it is telling the customer to collide with the
 * platform's own fragments. The prefix comes from the scenario so every name
 * the tool emits is consistent with the bundles the customer named themselves.
 */
/**
 * The name the tool derives for something that travels on its own: the prefix
 * plus the series name, e.g. `acme_CompressorOnOff`. A measurement fragment for
 * a lone series, an event type, an alarm type -- the shape is the same.
 */
export function derivedTypeName(prefix: string, metricName: string): string {
  const clean = prefix.replace(/[^\p{L}\p{N}]+/gu, '') || 'acme';
  const series = seriesNameOf(metricName);
  return `${clean}_${series.charAt(0).toUpperCase()}${series.slice(1)}`;
}

/**
 * The measurement type a series sends in when it travels alone.
 *
 * The customer's own name if they gave one in the wizard's table, else the
 * derived one. One definition, used by the diagram, the payload examples, the
 * workbook and the table itself, so a name typed in a row is the name that
 * appears everywhere else.
 */
export function ownFragmentName(prefix: string, metric: Metric): string {
  return metric.fragmentName?.trim() || derivedTypeName(prefix, metric.name);
}

function exampleValue(metric: Metric, index: number): number {
  // A flag or status reads as 0/1 in a payload, which is worth showing even
  // though the tool no longer has a kind for it.
  if (looksLikeFlag(metric)) return index % 2;
  const unit = metric.unit.toLowerCase();
  if (unit.includes('c') || unit.includes('°')) return 21.4;
  if (unit === '%') return 63;
  if (unit.includes('ppm')) return 812;
  if (unit.includes('pa') || unit.includes('bar')) return 101_325;
  return Number((10 + index * 3.5).toFixed(1));
}

/**
 * Series drawn out of a counted row before the example gives up naming them.
 *
 * The example has to stay valid JSON a developer can paste, so the tail cannot
 * be an ellipsis inside the object. Three is enough to show the shape -- the
 * numbering, the unit, that they all sit under one type -- and the note under
 * the example says how many more there are and how they are split.
 */
const NAMED_FROM_COUNT = 3;

function measurementBody(fragment: string, metrics: Metric[]): string {
  const series: Record<string, { value: number; unit?: string }> = {};
  metrics.forEach((metric, i) => {
    const entry: { value: number; unit?: string } = { value: exampleValue(metric, i) };
    if (metric.unit.trim()) entry.unit = metric.unit.trim();
    // A row sending each of its series separately puts exactly one in the
    // message, because that is the whole point of it -- the other 449 are
    // other messages, and the note says how many.
    const count = metric.typePerSeries ? 1 : seriesCountOf(metric);
    const base = seriesNameOf(metric.name);
    if (count === 1) {
      series[metric.typePerSeries ? `${base}1` : base] = entry;
      return;
    }
    // A counted row has no names to show, so the example invents the only
    // thing it can defend: the same name, numbered. A customer whose tags are
    // called something else replaces them; what they came for is the shape.
    for (let k = 1; k <= Math.min(count, NAMED_FROM_COUNT); k += 1) {
      series[`${base}${k}`] = { ...entry, value: exampleValue(metric, i + k) };
    }
  });

  return JSON.stringify(
    {
      source: { id: '<deviceId>' },
      time: SAMPLE_TIME,
      type: fragment,
      [fragment]: series,
    },
    null,
    2,
  );
}


function bundleExample(
  bundle: Bundle,
  members: Metric[],
  prefix: string,
  machineTypeName: string,
): PayloadExample {
  // The machine type's name, not the literal 'readings' this used to pass: an
  // unnamed bundle would otherwise be acme_Readings60s in the payload example
  // and acme_RooftopHvacUnit60s in the diagram, for the same measurement type.
  const fragment = bundleFragmentName(prefix, machineTypeName, bundle);
  const series = seriesIn(members);
  const types = typesIn(members);
  return {
    titleKey: 'payload.title.bundle',
    titleParams: { count: series, seconds: bundle.intervalSeconds },
    namespace: 'measurement fragment',
    name: fragment,
    seriesCount: series,
    types,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(fragment, members),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(fragment, members),
    // The split note comes first where there is one: it changes what the
    // developer builds, and the bundling note underneath still applies to each
    // of the types it names.
    noteKeys: series > MAX_SERIES_PER_BUNDLE
      ? ['payload.note.overRecommended', 'payload.note.bundle', 'payload.note.smartrest']
      : ['payload.note.bundle', 'payload.note.smartrest'],
    noteParams: { count: series, types, max: MAX_SERIES_PER_BUNDLE },
  };
}

/**
 * One series travelling in a measurement type of its own.
 *
 * The title and note used to be overridden at the one call site, back when this
 * also served on-change flags and needed a second pair for them.
 */
function soloExample(metric: Metric, prefix: string): PayloadExample {
  const name = ownFragmentName(prefix, metric);
  const series = seriesCountOf(metric);
  const types = typesIn([metric]);
  const perSeries = Boolean(metric.typePerSeries) && series > 1;
  // One type per series means N types, so the example is one of them and the
  // name it shows has to be one of theirs -- acme_PlcTags1, not acme_PlcTags,
  // which is a type this design never sends.
  const shown = perSeries ? `${name}1` : name;
  return {
    titleKey: perSeries
      ? 'payload.title.perSeries'
      : series > 1
        ? 'payload.title.counted'
        : 'payload.title.alone',
    titleParams: {
      count: series,
      seconds: metric.cadence.mode === 'interval' ? metric.cadence.seconds : '?',
    },
    namespace: 'measurement fragment',
    name: shown,
    seriesCount: series,
    types,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(shown, [metric]),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(shown, [metric]),
    noteKeys: perSeries
      ? ['payload.note.perSeries']
      : series > MAX_SERIES_PER_BUNDLE
        ? ['payload.note.overRecommended', 'payload.note.bundle']
        : ['payload.note.alone'],
    noteParams: { count: series, types, max: MAX_SERIES_PER_BUNDLE, name },
  };
}

function eventExample(metric: Metric, prefix: string): PayloadExample {
  const name = derivedTypeName(prefix, metric.name);
  const body = JSON.stringify(
    { source: { id: '<deviceId>' }, time: SAMPLE_TIME, type: name, text: metric.name },
    null,
    2,
  );
  return {
    title: metric.name,
    namespace: 'event type',
    name,
    seriesCount: 1,
    types: 1,
    restPath: 'POST /event/events',
    restBody: body,
    mqttTopic: 'event/events/create',
    mqttBody: body,
    noteKeys: ['payload.note.event'],
  };
}

function alarmExample(metric: Metric, prefix: string): PayloadExample {
  const name = derivedTypeName(prefix, metric.name);
  const body = JSON.stringify(
    {
      source: { id: '<deviceId>' },
      time: SAMPLE_TIME,
      type: name,
      text: metric.name,
      severity: 'MAJOR',
      status: 'ACTIVE',
    },
    null,
    2,
  );
  return {
    titleKey: 'payload.title.raiseAndClear',
    titleParams: { name: metric.name },
    namespace: 'alarm type',
    name,
    seriesCount: 1,
    types: 1,
    restPath: 'POST /alarm/alarms   then   PUT /alarm/alarms/<id>  { "status": "CLEARED" }',
    restBody: body,
    mqttTopic: 'alarm/alarms/create',
    mqttBody: body,
    noteKeys: ['payload.note.alarm'],
  };
}

function inventoryExample(metric: Metric, prefix: string): PayloadExample {
  const name = derivedTypeName(prefix, metric.name);
  const body = JSON.stringify({ [name]: '<value>' }, null, 2);
  return {
    title: metric.name,
    namespace: 'inventory fragment',
    name,
    seriesCount: 1,
    types: 1,
    restPath: 'PUT /inventory/managedObjects/<deviceId>',
    restBody: body,
    mqttTopic: 'inventory/managedObjects/update',
    mqttBody: body,
    noteKeys: ['payload.note.inventory'],
  };
}

export function payloadsFor(machineType: MachineType, prefix = 'acme'): PayloadExample[] {
  const out: PayloadExample[] = [];
  const { bundles, loneContinuous } = resolveBundles(machineType);

  for (const { bundle, members } of bundles) {
    if (members.length > 0) out.push(bundleExample(bundle, members, prefix, machineType.name));
  }
  for (const metric of loneContinuous) {
    out.push({
      ...soloExample(metric, prefix),
    });
  }
  for (const metric of machineType.metrics) {
    if (metric.kind === 'occurrence') out.push(eventExample(metric, prefix));
    if (metric.kind === 'condition') out.push(alarmExample(metric, prefix));
    if (metric.kind === 'inventory') out.push(inventoryExample(metric, prefix));
  }
  return out;
}
