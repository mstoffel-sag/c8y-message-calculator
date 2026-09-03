/**
 * Machine archetypes, so the first screen is never empty. CONCEPT.md section 5.
 *
 * These are starting points a customer edits, not claims about their fleet. Each
 * one is deliberately built the way the tool recommends -- bundled continuous
 * readings, states on change -- so a customer who starts from a preset starts
 * from a good model.
 */

import type { Key } from '../i18n/index.js';
import type { MachineType, Metric, Period, Scenario } from '../engine/types.js';

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface MetricSeed {
  name: string;
  unit: string;
  kind: Metric['kind'];
  semanticGroup: string;
  interval?: number;
  perDay?: number;
  perMonth?: number;
  transitions?: number;
  /** Continuous only: which bundle seed this belongs to, by fragment name. */
  bundle?: string;
}

interface Seed {
  key: string;
  /**
   * Doubles as the machine type's name, which is why it is not translated: the
   * name travels into fragment names, payload examples and the workbook, and a
   * scenario should not mean different things depending on the language it was
   * built in (lib/i18n NOT_TRANSLATED).
   */
  label: string;
  /** The sentence under the button. Prose, so it lives in the catalogue. */
  blurbKey: Key;
  machineCount: number;
  onlinePct: number;
  /** What this kind of machine usually talks, so a preset arrives complete. */
  protocol: string;
  bundles: Array<{ fragmentName: string; intervalSeconds: number }>;
  metrics: MetricSeed[];
}

function cadenceFor(seed: MetricSeed): Metric['cadence'] {
  switch (seed.kind) {
    case 'continuous':
      return { mode: 'interval', seconds: seed.interval ?? 60 };
    case 'occurrence':
    case 'condition':
      return { mode: 'onChange', perDay: seed.perDay ?? 1 };
    case 'inventory':
      return seed.perDay !== undefined
        ? { mode: 'onChange', perDay: seed.perDay }
        : { mode: 'perMonth', count: seed.perMonth ?? 1 };
    case 'command':
      // A command quoted per day scales with month length; one quoted per month
      // does not. Same two rhythms as 'inventory'.
      return seed.perDay !== undefined
        ? { mode: 'command', perDay: seed.perDay, transitions: seed.transitions ?? 3 }
        : { mode: 'command', perMonth: seed.perMonth ?? 1, transitions: seed.transitions ?? 3 };
  }
}

export function instantiate(seed: Seed): MachineType {
  const machineTypeId = nextId('mt');
  const bundleIds = new Map<string, string>();
  const bundles = seed.bundles.map((b) => {
    const id = nextId('b');
    bundleIds.set(b.fragmentName, id);
    return { id, fragmentName: b.fragmentName, intervalSeconds: b.intervalSeconds, metricIds: [] as string[] };
  });

  const metrics = seed.metrics.map((m) => {
    const id = nextId('m');
    const bundleId = m.kind === 'continuous' && m.bundle ? (bundleIds.get(m.bundle) ?? null) : null;
    if (bundleId) bundles.find((b) => b.id === bundleId)!.metricIds.push(id);
    return {
      id,
      name: m.name,
      unit: m.unit,
      kind: m.kind,
      cadence: cadenceFor(m),
      semanticGroup: m.semanticGroup,
      bundleId,
    } satisfies Metric;
  });

  return {
    id: machineTypeId,
    name: seed.label,
    machineCount: seed.machineCount,
    onlinePct: seed.onlinePct,
    protocol: seed.protocol,
    metrics,
    bundles,
  };
}

export const SEEDS: Seed[] = [
  {
    key: 'hvac',
    label: 'Rooftop HVAC unit',
    blurbKey: 'preset.hvac.blurb',
    machineCount: 1000,
    onlinePct: 100,
    protocol: 'BACnet/IP',
    bundles: [{ fragmentName: 'acme_Climate', intervalSeconds: 60 }],
    metrics: [
      { name: 'Supply air temp', unit: 'C', kind: 'continuous', semanticGroup: 'climate', interval: 60, bundle: 'acme_Climate' },
      { name: 'Humidity', unit: '%', kind: 'continuous', semanticGroup: 'climate', interval: 60, bundle: 'acme_Climate' },
      { name: 'CO2', unit: 'ppm', kind: 'continuous', semanticGroup: 'climate', interval: 60, bundle: 'acme_Climate' },
      { name: 'Pressure', unit: 'Pa', kind: 'continuous', semanticGroup: 'climate', interval: 60, bundle: 'acme_Climate' },
      { name: 'Compressor on/off', unit: '', kind: 'continuous', semanticGroup: 'status', interval: 4320 },
      { name: 'Filter status', unit: '', kind: 'continuous', semanticGroup: 'status', interval: 4320 },
      { name: 'Service event', unit: '', kind: 'occurrence', semanticGroup: 'service', perDay: 1 },
      { name: 'Fault condition', unit: '', kind: 'condition', semanticGroup: 'fault', perDay: 0.5 },
      { name: 'Firmware and config', unit: '', kind: 'inventory', semanticGroup: 'identity', perDay: 1 },
      { name: 'Setpoint change', unit: '', kind: 'command', semanticGroup: 'control', perMonth: 1, transitions: 3 },
    ],
  },
  {
    key: 'meter',
    label: 'Electricity meter',
    blurbKey: 'preset.meter.blurb',
    machineCount: 50_000,
    onlinePct: 98,
    protocol: 'DLMS/COSEM',
    bundles: [{ fragmentName: 'acme_Energy', intervalSeconds: 900 }],
    metrics: [
      { name: 'Active energy import', unit: 'kWh', kind: 'continuous', semanticGroup: 'energy', interval: 900, bundle: 'acme_Energy' },
      { name: 'Active energy export', unit: 'kWh', kind: 'continuous', semanticGroup: 'energy', interval: 900, bundle: 'acme_Energy' },
      { name: 'Voltage L1', unit: 'V', kind: 'continuous', semanticGroup: 'energy', interval: 900, bundle: 'acme_Energy' },
      { name: 'Tamper detected', unit: '', kind: 'condition', semanticGroup: 'fault', perDay: 0.01 },
      { name: 'Firmware version', unit: '', kind: 'inventory', semanticGroup: 'identity', perMonth: 1 },
    ],
  },
  {
    key: 'tracker',
    label: 'Asset tracker',
    blurbKey: 'preset.tracker.blurb',
    machineCount: 5000,
    onlinePct: 85,
    protocol: 'NB-IoT / LTE-M',
    bundles: [{ fragmentName: 'acme_Position', intervalSeconds: 300 }],
    metrics: [
      { name: 'Latitude', unit: 'deg', kind: 'continuous', semanticGroup: 'position', interval: 300, bundle: 'acme_Position' },
      { name: 'Longitude', unit: 'deg', kind: 'continuous', semanticGroup: 'position', interval: 300, bundle: 'acme_Position' },
      { name: 'Speed', unit: 'km/h', kind: 'continuous', semanticGroup: 'position', interval: 300, bundle: 'acme_Position' },
      { name: 'Battery', unit: '%', kind: 'continuous', semanticGroup: 'position', interval: 300, bundle: 'acme_Position' },
      { name: 'Trip start and stop', unit: '', kind: 'occurrence', semanticGroup: 'movement', perDay: 6 },
      { name: 'Geofence breach', unit: '', kind: 'condition', semanticGroup: 'fault', perDay: 0.2 },
    ],
  },
  {
    key: 'gateway',
    label: 'Edge gateway',
    blurbKey: 'preset.gateway.blurb',
    machineCount: 200,
    onlinePct: 99,
    protocol: 'OPC UA',
    bundles: [
      { fragmentName: 'acme_LineSummary', intervalSeconds: 60 },
      { fragmentName: 'acme_GatewayHealth', intervalSeconds: 300 },
    ],
    metrics: [
      { name: 'Throughput', unit: 'units/min', kind: 'continuous', semanticGroup: 'production', interval: 60, bundle: 'acme_LineSummary' },
      { name: 'Reject rate', unit: '%', kind: 'continuous', semanticGroup: 'production', interval: 60, bundle: 'acme_LineSummary' },
      { name: 'Cycle time', unit: 's', kind: 'continuous', semanticGroup: 'production', interval: 60, bundle: 'acme_LineSummary' },
      { name: 'CPU load', unit: '%', kind: 'continuous', semanticGroup: 'gateway health', interval: 300, bundle: 'acme_GatewayHealth' },
      { name: 'Memory used', unit: '%', kind: 'continuous', semanticGroup: 'gateway health', interval: 300, bundle: 'acme_GatewayHealth' },
      { name: 'Uplink state', unit: '', kind: 'continuous', semanticGroup: 'status', interval: 21600 },
      { name: 'Firmware update', unit: '', kind: 'command', semanticGroup: 'control', perMonth: 0.5, transitions: 3 },
      { name: 'Inventory sync', unit: '', kind: 'inventory', semanticGroup: 'identity', perMonth: 1 },
    ],
  },
  {
    key: 'machine',
    label: 'Production machine',
    blurbKey: 'preset.machine.blurb',
    machineCount: 400,
    onlinePct: 90,
    protocol: 'OPC UA',
    bundles: [{ fragmentName: 'acme_Process', intervalSeconds: 10 }],
    metrics: [
      { name: 'Spindle speed', unit: 'rpm', kind: 'continuous', semanticGroup: 'process', interval: 10, bundle: 'acme_Process' },
      { name: 'Motor current', unit: 'A', kind: 'continuous', semanticGroup: 'process', interval: 10, bundle: 'acme_Process' },
      { name: 'Coolant temp', unit: 'C', kind: 'continuous', semanticGroup: 'process', interval: 10, bundle: 'acme_Process' },
      { name: 'Vibration', unit: 'mm/s', kind: 'continuous', semanticGroup: 'process', interval: 10, bundle: 'acme_Process' },
      { name: 'Machine mode', unit: '', kind: 'continuous', semanticGroup: 'status', interval: 7200 },
      { name: 'Part completed', unit: '', kind: 'occurrence', semanticGroup: 'production', perDay: 480 },
      { name: 'Tool wear alarm', unit: '', kind: 'condition', semanticGroup: 'fault', perDay: 2 },
      { name: 'Recipe change', unit: '', kind: 'command', semanticGroup: 'control', perDay: 1, transitions: 3 },
    ],
  },
];

export const PRESETS = SEEDS.map((seed) => ({
  key: seed.key,
  label: seed.label,
  blurbKey: seed.blurbKey,
  create: () => instantiate(seed),
}));

export function presetByKey(key: string): MachineType | undefined {
  const seed = SEEDS.find((s) => s.key === key);
  return seed ? instantiate(seed) : undefined;
}

/** An empty machine type, for customers who would rather start from nothing. */
export function blankMachineType(name = 'New machine type'): MachineType {
  return { id: nextId('mt'), name, machineCount: 100, onlinePct: 100, metrics: [], bundles: [] };
}

export function blankScenario(): Scenario {
  const now = new Date();
  return {
    name: 'Untitled scenario',
    notes: '',
    settings: {
      startYear: now.getUTCFullYear(),
      startMonth: now.getUTCMonth() + 1,
      fragmentPrefix: 'acme',
    },
    periods: [newPeriod(1)],
    machineTypes: [],
  };
}

/** A period with nothing committed to it yet. */
export function newPeriod(index: number, months = 12): Period {
  return { index, months, machineCountOverrides: {}, commercial: {} };
}

/** CONCEPT.md section 9 -- the fleet the engine's acceptance test is written against. */
export function conceptSection9Scenario(): Scenario {
  const hvac = presetByKey('hvac')!;
  return {
    name: 'CONCEPT.md section 9 - 1,000 rooftop HVAC units',
    notes: 'The worked example. Steady state, 100 % online, one period.',
    settings: { startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
    periods: [{ index: 1, months: 12, machineCountOverrides: {}, commercial: { sharedCloud: 1 } }],
    machineTypes: [hvac],
  };
}
