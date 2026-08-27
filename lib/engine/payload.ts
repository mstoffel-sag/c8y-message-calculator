/**
 * Payload examples. CONCEPT.md section 7, "Payload design".
 *
 * What turns an estimate into an implementation brief: for every bundle and
 * every on-change metric, the actual JSON the device should send. A customer
 * who can copy the payload does not have to trust the arithmetic.
 */

import { type Bundle, type Metric, type MachineType } from './types.js';
import { resolveBundles } from './compute.js';
import { fragmentNameFor } from './bundling.js';

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
  title: string;
  namespace: PayloadNamespace;
  /** The fragment or type name itself, for grouping and for the L7 check. */
  name: string;
  /** How many messages one of these is worth: always 1. That is the point. */
  seriesCount: number;
  restPath: string;
  restBody: string;
  mqttTopic: string;
  mqttBody: string;
  note: string;
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
  if (metric.kind === 'state') return index % 2;
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

const BUNDLE_NOTE =
  'One POST, one timestamp, one message -- regardless of how many series it carries. Send exactly ' +
  'this series set every time: a fragment whose shape varies from message to message is what ' +
  'degrades write and query performance.';

const STATE_NOTE =
  'Sent only when the value actually changes, so the timestamp is the transition. Do not fold this ' +
  'into an interval bundle: the bundle would have to send a different series set whenever this one ' +
  'moved, and the moment it flipped would be lost between two ticks.';

const SMARTREST_NOTE =
  'Over MQTT, the JSON above goes to the topic shown. The SmartREST static measurement template ' +
  'carries one series per row, so bundling several series into one measurement needs a custom ' +
  'SmartREST 2.0 template that renders this whole fragment in a single request.';

function bundleExample(bundle: Bundle, members: Metric[], prefix: string): PayloadExample {
  const fragment =
    bundle.fragmentName.trim() || fragmentNameFor(prefix, 'readings', bundle.intervalSeconds);
  return {
    title: `${members.length} series every ${bundle.intervalSeconds} s`,
    namespace: 'measurement fragment',
    name: fragment,
    seriesCount: members.length,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(fragment, members),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(fragment, members),
    note: `${BUNDLE_NOTE} ${SMARTREST_NOTE}`,
  };
}

function stateExample(metric: Metric, prefix: string): PayloadExample {
  const name = ownFragmentName(prefix, metric);
  return {
    title: 'on change only',
    namespace: 'measurement fragment',
    name,
    seriesCount: 1,
    restPath: 'POST /measurement/measurements',
    restBody: measurementBody(name, [metric]),
    mqttTopic: 'measurement/measurements/create',
    mqttBody: measurementBody(name, [metric]),
    note: STATE_NOTE,
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
    note: 'Events hold non-numeric data. A number buried in an event body cannot be aggregated or plotted the way a series can.',
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
    title: `${metric.name} - raise and clear`,
    namespace: 'alarm type',
    name,
    seriesCount: 1,
    restPath: 'POST /alarm/alarms   then   PUT /alarm/alarms/<id>  { "status": "CLEARED" }',
    restBody: body,
    mqttTopic: 'alarm/alarms/create',
    mqttBody: body,
    note:
      'Two messages per incident: the raise creates and the clear updates, and both count. Raising an ' +
      'alarm type that is already active updates the existing alarm rather than creating a duplicate -- ' +
      'which still counts.',
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
    note:
      'Send this when it changes, not on a timer. The platform does not diff the payload, so a ' +
      'successful PUT that changes nothing still counts.',
  };
}

export function payloadsFor(machineType: MachineType, prefix = 'acme'): PayloadExample[] {
  const out: PayloadExample[] = [];
  const { bundles, loneContinuous } = resolveBundles(machineType);

  for (const { bundle, members } of bundles) {
    if (members.length > 0) out.push(bundleExample(bundle, members, prefix));
  }
  for (const metric of loneContinuous) {
    out.push({
      ...stateExample(metric, prefix),
      title: `its own measurement, every ${
        metric.cadence.mode === 'interval' ? metric.cadence.seconds : '?'
      } s`,
      note:
        'This reading travels alone, so it costs one message per sample on its own. If anything else is ' +
        'sampled on the same tick, they belong in one measurement.',
    });
  }
  for (const metric of machineType.metrics) {
    if (metric.kind === 'state') out.push(stateExample(metric, prefix));
    if (metric.kind === 'occurrence') out.push(eventExample(metric, prefix));
    if (metric.kind === 'condition') out.push(alarmExample(metric, prefix));
    if (metric.kind === 'inventory') out.push(inventoryExample(metric, prefix));
  }
  return out;
}
