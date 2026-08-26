/**
 * Immutable edits to a Scenario. Kept out of the components so the same
 * operations can be reused by an Angular store later without being rewritten.
 */

import {
  CADENCE_FOR_KIND,
  SECONDS_PER_DAY,
  cadenceToPeriod,
  toSeconds,
  type Bundle,
  type DurationUnit,
  type Cadence,
  type MachineType,
  type Metric,
  type MetricKind,
  type Period,
  type Scenario,
} from '../../lib/engine/index.js';
import { blankScenario, newPeriod, nextId } from '../../lib/presets/index.js';
import { applyProposal, autoAssign } from '../../lib/engine/bundling.js';
import { ownFragmentName } from '../../lib/engine/payload.js';
import { seedByName } from '../../lib/presets/catalog.js';

export const STORAGE_KEY = 'c8y.message-calculator.scenario';

/** The cadence a kind starts with when the customer switches kind. */
export function defaultCadence(kind: MetricKind): Cadence {
  switch (kind) {
    case 'continuous':
      return { mode: 'interval', seconds: 60 };
    case 'state':
      return { mode: 'onChange', perDay: 10 };
    case 'occurrence':
      return { mode: 'onChange', perDay: 1 };
    case 'condition':
      return { mode: 'onChange', perDay: 0.5 };
    case 'fact':
      return { mode: 'perMonth', count: 1 };
    case 'command':
      return { mode: 'command', perMonth: 1, transitions: 3 };
  }
}

export function newMetric(): Metric {
  return {
    id: nextId('m'),
    name: '',
    unit: '',
    kind: 'continuous',
    cadence: defaultCadence('continuous'),
    semanticGroup: '',
    bundleId: null,
  };
}

export function newBundle(): Bundle {
  return { id: nextId('b'), fragmentName: 'acme_Readings', intervalSeconds: 60, metricIds: [] };
}

function mapMachineType(
  scenario: Scenario,
  machineTypeId: string,
  fn: (mt: MachineType) => MachineType,
): Scenario {
  return {
    ...scenario,
    machineTypes: scenario.machineTypes.map((mt) => (mt.id === machineTypeId ? fn(mt) : mt)),
  };
}

export function patchMachineType(
  scenario: Scenario,
  machineTypeId: string,
  patch: Partial<MachineType>,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({ ...mt, ...patch }));
}

export function addMachineType(scenario: Scenario, machineType: MachineType): Scenario {
  return { ...scenario, machineTypes: [...scenario.machineTypes, machineType] };
}

export function removeMachineType(scenario: Scenario, machineTypeId: string): Scenario {
  const periods = scenario.periods.map((p) => {
    const { [machineTypeId]: _dropped, ...rest } = p.machineCountOverrides;
    return { ...p, machineCountOverrides: rest };
  });
  return {
    ...scenario,
    periods,
    machineTypes: scenario.machineTypes.filter((mt) => mt.id !== machineTypeId),
  };
}

export function addMetric(scenario: Scenario, machineTypeId: string): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: [...mt.metrics, newMetric()],
  }));
}

export function removeMetric(scenario: Scenario, machineTypeId: string, metricId: string): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: mt.metrics.filter((m) => m.id !== metricId),
    bundles: mt.bundles.map((b) => ({ ...b, metricIds: b.metricIds.filter((id) => id !== metricId) })),
  }));
}

export function patchMetric(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  patch: Partial<Metric>,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: mt.metrics.map((m) => (m.id === metricId ? { ...m, ...patch } : m)),
  }));
}

/**
 * Changing kind resets the cadence, because the cadence a kind asks for is part
 * of the kind. It also drops the metric out of any bundle when the new kind is
 * not a continuous reading -- which is what keeps the section 4.3 violation
 * unreachable from the UI rather than merely warned about.
 */
export function setMetricKind(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  kind: MetricKind,
): Scenario {
  const next = patchMetric(scenario, machineTypeId, metricId, {
    kind,
    cadence: defaultCadence(kind),
  });
  return kind === 'continuous' ? next : assignBundle(next, machineTypeId, metricId, null);
}

/**
 * Switches a measurement series between its two rhythms: sampled on a timer, or
 * sent when the value moves.
 *
 * Both are measurements -- one timestamp, one series or several -- and the wizard
 * therefore asks this as a rhythm rather than as two kinds of thing. The kind
 * still moves underneath, because the arithmetic genuinely differs: a timed
 * reading can share a measurement with everything else on its tick, and an
 * on-change reading can share one with nothing (CONCEPT.md 4.4).
 *
 * The period carries across, so "every 5 min" on a timer becomes "about every
 * 5 min when it changes" rather than snapping back to a default.
 */
export function setRhythm(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  rhythm: 'interval' | 'onChange',
): Scenario {
  const metric = scenario.machineTypes
    .find((mt) => mt.id === machineTypeId)
    ?.metrics.find((m) => m.id === metricId);
  if (!metric || (metric.kind !== 'continuous' && metric.kind !== 'state')) return scenario;
  if (rhythm === (metric.kind === 'continuous' ? 'interval' : 'onChange')) return scenario;

  const period = cadenceToPeriod(metric.cadence);
  const seconds = toSeconds(period.value, period.unit as DurationUnit);

  if (rhythm === 'onChange') {
    const next = patchMetric(scenario, machineTypeId, metricId, {
      kind: 'state',
      cadence: { mode: 'onChange', perDay: SECONDS_PER_DAY / seconds },
    });
    // Its timestamps are its own, so it leaves whatever tick it was sharing.
    return assignBundle(next, machineTypeId, metricId, null);
  }

  const next = patchMetric(scenario, machineTypeId, metricId, {
    kind: 'continuous',
    cadence: { mode: 'interval', seconds },
  });
  return mapMachineType(next, machineTypeId, (mt) =>
    autoAssign(mt, metricId, scenario.settings.fragmentPrefix),
  );
}

/** Facts may be quoted per month or per day; nothing else has a choice. */
export function setCadenceMode(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  mode: Cadence['mode'],
): Scenario {
  const metric = scenario.machineTypes
    .find((mt) => mt.id === machineTypeId)
    ?.metrics.find((m) => m.id === metricId);
  if (!metric || !CADENCE_FOR_KIND[metric.kind].includes(mode)) return scenario;
  const cadence: Cadence =
    mode === 'perMonth'
      ? { mode: 'perMonth', count: 1 }
      : mode === 'onChange'
        ? { mode: 'onChange', perDay: 1 }
        : mode === 'interval'
          ? { mode: 'interval', seconds: 60 }
          : { mode: 'command', perMonth: 1, transitions: 3 };
  return patchMetric(scenario, machineTypeId, metricId, { cadence });
}

export function patchCadence(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  patch: Record<string, number>,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: mt.metrics.map((m) =>
      m.id === metricId ? ({ ...m, cadence: { ...m.cadence, ...patch } as Cadence }) : m,
    ),
  }));
}

/**
 * Moves a continuous metric into a bundle, or out of every bundle when null.
 *
 * A measurement type is its members, so one left with none is dropped rather
 * than kept around: it has no name worth remembering, it cannot be named any
 * more now that the wizard names types in the rows that use them, and it would
 * otherwise sit in every other row's dropdown offering to be joined.
 */
export function assignBundle(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  bundleId: string | null,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: mt.metrics.map((m) => (m.id === metricId ? { ...m, bundleId } : m)),
    bundles: mt.bundles
      .map((b) => {
        const without = b.metricIds.filter((id) => id !== metricId);
        return b.id === bundleId ? { ...b, metricIds: [...without, metricId] } : { ...b, metricIds: without };
      })
      .filter((b) => b.metricIds.length > 0),
  }));
}

/**
 * Gives one series a measurement type all to itself, there and then.
 *
 * Choosing "a measurement type of its own" used to only clear the bundle, which
 * left the series travelling under a name derived from its own -- visible, but
 * not editable, and no measurement type existed until some later interval change
 * happened to mint one. The choice now creates the type immediately, named after
 * the series, so the row that made the choice can rename it on the spot.
 */
export function assignOwnBundle(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => {
    const metric = mt.metrics.find((m) => m.id === metricId);
    if (!metric || metric.kind !== 'continuous') return mt;

    // Already alone in one: nothing to do, and minting a second would leave the
    // first behind with nothing in it.
    const current = mt.bundles.find((b) => b.id === metric.bundleId);
    if (current && current.metricIds.length === 1) return mt;

    const bundle: Bundle = {
      id: nextId('b'),
      fragmentName: unusedFragmentName(mt, ownFragmentName(scenario.settings.fragmentPrefix, metric)),
      intervalSeconds: metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60,
      metricIds: [metricId],
    };
    return {
      ...mt,
      metrics: mt.metrics.map((m) => (m.id === metricId ? { ...m, bundleId: bundle.id } : m)),
      bundles: [
        ...mt.bundles
          .map((b) => ({ ...b, metricIds: b.metricIds.filter((id) => id !== metricId) }))
          .filter((b) => b.metricIds.length > 0),
        bundle,
      ],
    };
  });
}

/**
 * Two series called the same thing would otherwise mint two measurement types
 * with one name, which the diagram then draws twice and no device can send.
 */
function unusedFragmentName(machineType: MachineType, base: string): string {
  const taken = new Set(machineType.bundles.map((b) => b.fragmentName.trim()));
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}${n}`;
  return name;
}

export function addBundle(scenario: Scenario, machineTypeId: string): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => {
    const bundle = newBundle();
    bundle.fragmentName = `acme_Readings${mt.bundles.length + 1}`;
    return { ...mt, bundles: [...mt.bundles, bundle] };
  });
}

export function patchBundle(
  scenario: Scenario,
  machineTypeId: string,
  bundleId: string,
  patch: Partial<Bundle>,
): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    bundles: mt.bundles.map((b) => (b.id === bundleId ? { ...b, ...patch } : b)),
  }));
}

/** Removing a bundle returns its members to their own measurements. */
export function removeBundle(scenario: Scenario, machineTypeId: string, bundleId: string): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    bundles: mt.bundles.filter((b) => b.id !== bundleId),
    metrics: mt.metrics.map((m) => (m.bundleId === bundleId ? { ...m, bundleId: null } : m)),
  }));
}

/* ------------------------------------------------------------------ periods */

export function addPeriod(scenario: Scenario): Scenario {
  if (scenario.periods.length >= 5) return scenario;
  const index = Math.max(0, ...scenario.periods.map((p) => p.index)) + 1;
  const previous = scenario.periods[scenario.periods.length - 1];
  return {
    ...scenario,
    periods: [
      ...scenario.periods,
      {
        ...newPeriod(index),
        // Carry the previous period forward: a new period usually means more
        // machines and the same deployment, not a fresh start.
        machineCountOverrides: { ...(previous?.machineCountOverrides ?? {}) },
        commercial: { ...(previous?.commercial ?? {}) },
      },
    ],
  };
}

export function removePeriod(scenario: Scenario, index: number): Scenario {
  if (scenario.periods.length <= 1) return scenario;
  return {
    ...scenario,
    periods: scenario.periods
      .filter((p) => p.index !== index)
      .map((p, i) => ({ ...p, index: i + 1 })),
  };
}

export function patchPeriod(
  scenario: Scenario,
  index: number,
  patch: { months?: number },
): Scenario {
  return {
    ...scenario,
    periods: scenario.periods.map((p) => (p.index === index ? { ...p, ...patch } : p)),
  };
}

export function setPeriodCount(
  scenario: Scenario,
  index: number,
  machineTypeId: string,
  count: number | null,
): Scenario {
  return {
    ...scenario,
    periods: scenario.periods.map((p) => {
      if (p.index !== index) return p;
      const overrides = { ...p.machineCountOverrides };
      if (count === null) delete overrides[machineTypeId];
      else overrides[machineTypeId] = count;
      return { ...p, machineCountOverrides: overrides };
    }),
  };
}

/* --------------------------------------------------------------- persistence */

export function save(scenario: Scenario): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
  } catch {
    // Private windows and blocked site data both throw; losing autosave is not
    // worth interrupting the session for.
  }
}

export function load(): Scenario | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Fills in anything a scenario from an older build or a hand-edited file is
 * missing. Both autosave and JSON import go through here, because a scenario
 * with no `commercial` on its periods used to be valid and would now throw on
 * first render.
 */
export function normalise(input: unknown): Scenario {
  const raw = (input ?? {}) as Partial<Scenario>;
  const fallback = blankScenario();
  const settings = { ...fallback.settings, ...(raw.settings ?? {}) };

  const periods = (Array.isArray(raw.periods) && raw.periods.length > 0 ? raw.periods : fallback.periods)
    .map((period, i) => ({
      index: typeof period?.index === 'number' ? period.index : i + 1,
      months: typeof period?.months === 'number' ? period.months : 12,
      machineCountOverrides: period?.machineCountOverrides ?? {},
      commercial: period?.commercial ?? {},
    }));

  const machineTypes = (Array.isArray(raw.machineTypes) ? raw.machineTypes : []).map((mt) => ({
    id: mt?.id ?? nextId('mt'),
    name: mt?.name ?? '',
    machineCount: typeof mt?.machineCount === 'number' ? mt.machineCount : 0,
    onlinePct: typeof mt?.onlinePct === 'number' ? mt.onlinePct : 100,
    bundles: (Array.isArray(mt?.bundles) ? mt.bundles : []).map((b) => ({
      id: b?.id ?? nextId('b'),
      fragmentName: b?.fragmentName ?? 'acme_Readings',
      intervalSeconds: typeof b?.intervalSeconds === 'number' ? b.intervalSeconds : 60,
      metricIds: Array.isArray(b?.metricIds) ? b.metricIds : [],
    })),
    metrics: (Array.isArray(mt?.metrics) ? mt.metrics : []).map((m) => {
      const kind: MetricKind = m?.kind ?? 'continuous';
      return {
        id: m?.id ?? nextId('m'),
        name: m?.name ?? '',
        unit: m?.unit ?? '',
        kind,
        cadence: m?.cadence ?? defaultCadence(kind),
        semanticGroup: m?.semanticGroup ?? '',
        fragmentName: typeof m?.fragmentName === 'string' ? m.fragmentName : undefined,
        bundleId: m?.bundleId ?? null,
        resentOnTimer: Boolean(m?.resentOnTimer),
      };
    }),
  }));

  return {
    name: raw.name ?? fallback.name,
    notes: raw.notes ?? '',
    settings,
    periods,
    machineTypes,
  };
}

/* ---------------------------------------------------------------- wizard ops */

/**
 * Adds a datapoint of a given kind. A time-series datapoint lands straight in
 * the measurement for its interval -- the recommended design is the default,
 * and splitting is the deliberate act.
 */
export function addDatapoint(
  scenario: Scenario,
  machineTypeId: string,
  kind: MetricKind,
  seed: Partial<Metric> = {},
): Scenario {
  const metric: Metric = { ...newMetric(), kind, cadence: defaultCadence(kind), ...seed };
  const next = mapMachineType(scenario, machineTypeId, (mt) => ({
    ...mt,
    metrics: [...mt.metrics, metric],
  }));
  return kind === 'continuous'
    ? mapMachineType(next, machineTypeId, (mt) =>
        autoAssign(mt, metric.id, scenario.settings.fragmentPrefix),
      )
    : next;
}

/**
 * Changing a time series' interval moves it to the measurement for the new
 * interval, because a measurement carries one timestamp: readings on different
 * ticks cannot share one however related they are.
 */
export function setInterval(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  seconds: number,
): Scenario {
  const next = patchCadence(scenario, machineTypeId, metricId, { seconds });
  return mapMachineType(next, machineTypeId, (mt) =>
    autoAssign(mt, metricId, scenario.settings.fragmentPrefix),
  );
}

/** One measurement per distinct interval. */
export function applyBundleProposal(scenario: Scenario, machineTypeId: string): Scenario {
  return mapMachineType(scenario, machineTypeId, (mt) =>
    applyProposal(mt, scenario.settings.fragmentPrefix),
  );
}

export function applyBundleProposalEverywhere(scenario: Scenario): Scenario {
  return {
    ...scenario,
    machineTypes: scenario.machineTypes.map((mt) => applyProposal(mt, scenario.settings.fragmentPrefix)),
  };
}

/* ------------------------------------------------------------- commercial */

export function setCommercial(
  scenario: Scenario,
  periodIndex: number,
  key: string,
  value: number | boolean | undefined,
): Scenario {
  return {
    ...scenario,
    periods: scenario.periods.map((p) => {
      if (p.index !== periodIndex) return p;
      const commercial = { ...p.commercial };
      if (value === undefined || value === 0 || value === false) delete commercial[key];
      else commercial[key] = value;
      return { ...p, commercial };
    }),
  };
}

/** Most quotes repeat the same deployment in every period. */
export function copyCommercialAcross(scenario: Scenario, fromIndex: number): Scenario {
  const source = scenario.periods.find((p) => p.index === fromIndex);
  if (!source) return scenario;
  return {
    ...scenario,
    periods: scenario.periods.map((p) =>
      p.index === fromIndex ? p : { ...p, commercial: { ...source.commercial } },
    ),
  };
}

export function commercialNumber(period: Period, key: string): number {
  const value = period.commercial[key];
  return typeof value === 'number' ? value : 0;
}

export function commercialBool(period: Period, key: string): boolean {
  return period.commercial[key] === true;
}

/**
 * Setting a datapoint's name from the catalogue also fills its unit, when the
 * unit is still empty. The unit is the field customers skip and the field L6
 * reads, so a name that can supply one should.
 *
 * The interval is deliberately left alone: changing it would move the datapoint
 * to a different measurement, and a dropdown that silently reshapes the payload
 * is worse than one that fills in a unit.
 *
 * The *rhythm* is the exception, and only across the two measurement catalogues.
 * Step 2 offers timed readings and on-change flags in one list, because they are
 * one kind of thing; a door open/closed left on a one-minute timer is then the
 * single mistake the whole step exists to prevent, so a name that comes from the
 * other catalogue brings its rhythm with it.
 */
export function setDatapointName(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  name: string,
): Scenario {
  const metric = scenario.machineTypes
    .find((mt) => mt.id === machineTypeId)
    ?.metrics.find((m) => m.id === metricId);
  if (!metric) return scenario;

  const own = seedByName(metric.kind, name);
  const other: MetricKind | null =
    metric.kind === 'continuous' ? 'state' : metric.kind === 'state' ? 'continuous' : null;
  const crossed = own || !other ? undefined : seedByName(other, name);
  const seed = own ?? crossed;

  const patch: Partial<Metric> = { name };
  if (seed && !metric.unit.trim() && seed.unit) patch.unit = seed.unit;
  if (seed?.group && !metric.semanticGroup.trim()) patch.semanticGroup = seed.group.toLowerCase();
  const named = patchMetric(scenario, machineTypeId, metricId, patch);

  return crossed
    ? setRhythm(named, machineTypeId, metricId, other === 'state' ? 'onChange' : 'interval')
    : named;
}

/**
 * Names the measurement type a lone series sends in -- an on-change flag, or a
 * timed reading pulled out of its bundle.
 *
 * A bundled series takes its name from the bundle, so this is for the ones that
 * travel alone. Clearing the box drops the override rather than storing an empty
 * string: an empty field means "use the name the tool derives", which is what the
 * placeholder in it says.
 */
export function setSeriesFragmentName(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  fragmentName: string,
): Scenario {
  return patchMetric(scenario, machineTypeId, metricId, {
    fragmentName: fragmentName.trim() ? fragmentName : undefined,
  });
}

/** Unit only, without the catalogue's name-driven side effects. */
export function patchUnit(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  unit: string,
): Scenario {
  return patchMetric(scenario, machineTypeId, metricId, { unit });
}

export function setResentOnTimer(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  resentOnTimer: boolean,
): Scenario {
  return patchMetric(scenario, machineTypeId, metricId, { resentOnTimer });
}

/** Replaces a metric's cadence wholesale -- the unit can change its mode. */
export function setCadence(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  cadence: Cadence,
): Scenario {
  return patchMetric(scenario, machineTypeId, metricId, { cadence });
}
