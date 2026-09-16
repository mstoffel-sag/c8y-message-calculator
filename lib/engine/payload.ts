/**
 * Payload examples. CONCEPT.md section 7, "Payload design".
 *
 * What turns an estimate into an implementation brief: for every bundle and
 * every on-change metric, the actual JSON the device should send. A customer
 * who can copy the payload does not have to trust the arithmetic.
 */

import type { Key, Params } from '../i18n/index.js';
import { looksLikeFlag, type Bundle, type Metric, type MachineType } from './types.js';
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
  /** How many messages one of these is worth: always 1. That is the point. */
  seriesCount: number;
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

function measurementBody(fragment: string, metrics: Metric[]): string {
  const series: Record<string, { value: number; unit?: string }> = {};
  metrics.forEach((metric, i) => {
    const entry: { value: number; unit?: string } = { value: exampleValue(metric, i) };
    if (metric.unit.trim()) entry.unit = metric.unit.trim();
    series[seriesNameOf(metric.name)] = entry;
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
  return {
    titleKey: 'payload.title.bundle',
    titleParams: { count: members.length, seconds: bundle.intervalSeconds },
    namespace: 'measurement fragment',
    name: fragment,
    seriesCount: members.length,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(fragment, members),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(fragment, members),
    noteKeys: ['payload.note.bundle', 'payload.note.smartrest'],
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
  return {
    titleKey: 'payload.title.alone',
    titleParams: {
      seconds: metric.cadence.mode === 'interval' ? metric.cadence.seconds : '?',
    },
    namespace: 'measurement fragment',
    name,
    seriesCount: 1,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(name, [metric]),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(name, [metric]),
    noteKeys: ['payload.note.alone'],
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
