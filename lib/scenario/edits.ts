/**
 * Immutable edits to a Scenario.
 *
 * These live in lib/ rather than beside a component because two apps perform
 * them: the standalone wizard in src/ui and the Web SDK wizard in src/c8y.
 * Every function here takes a Scenario and returns a new one, touching no
 * storage and no framework, so a store in either app is the same three lines --
 * hold the scenario, call one of these, keep what comes back.
 *
 * Persistence is deliberately *not* here. lib/ may not see browser storage, and
 * where a scenario is kept is the one thing the two apps genuinely disagree
 * about: a key in the browser, or a managed object in the tenant.
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
} from '../engine/index.js';
import { blankScenario, newPeriod, nextId } from '../presets/index.js';
import { applyProposal, autoAssign } from '../engine/bundling.js';
import { ownFragmentName } from '../engine/payload.js';
import { seedByName } from '../presets/catalog.js';

/** The cadence a kind starts with when the customer switches kind. */
export function defaultCadence(kind: MetricKind): Cadence {
  switch (kind) {
    case 'continuous':
      return { mode: 'interval', seconds: 60 };
    case 'occurrence':
      return { mode: 'onChange', perDay: 1 };
    case 'condition':
      return { mode: 'onChange', perDay: 0.5 };
    case 'inventory':
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

/** Inventory may be quoted per month or per day; nothing else has a choice. */
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

/**
 * Fills in anything a scenario from an older build or a hand-edited file is
 * missing. Both autosave and JSON import go through here, because a scenario
 * with no `commercial` on its periods used to be valid and would now throw on
 * first render.
 */
/**
 * The kind, with the two changes this format has had.
 *
 * 'fact' was what the wizard called an inventory write until the step was
 * renamed after the element it actually bills to. 'state' was a flag sent at
 * the moment its value moved, before the measurements table dropped to one
 * rhythm. Scenarios saved before either are still in browsers and in files on
 * disk, and a scenario that quietly loses or gains messages on load is the one
 * failure mode this tool cannot have.
 */
function metricKind(raw: unknown): MetricKind {
  if (raw === 'fact') return 'inventory';
  if (raw === 'state') return 'continuous';
  return (raw ?? 'continuous') as MetricKind;
}

/**
 * A saved flag's cadence, as the interval that sends the same messages.
 *
 * A state was quoted as a change rate -- 20 a day -- and billed one message per
 * change: 620 in a 31-day month. As a series it is quoted as an interval, and
 * 86,400 / 20 = every 4,320 s bills exactly the same 620. So the conversion is
 * arithmetic, not a judgement, and a scenario reloaded after this change costs
 * what it costed before.
 *
 * Getting this wrong is expensive in one direction in particular: leaving a
 * flag's cadence alone and letting it fall through to the 60 s default would
 * quote a fleet at seventy times the volume it had yesterday, in a tool whose
 * output goes into a contract.
 */
function migratedCadence(raw: unknown, kind: MetricKind): Cadence | undefined {
  const cadence = raw as Cadence | undefined;
  if (kind !== 'continuous' || cadence?.mode !== 'onChange') return cadence;
  const perDay = Number(cadence.perDay);
  return {
    mode: 'interval',
    seconds: Number.isFinite(perDay) && perDay > 0 ? SECONDS_PER_DAY / perDay : 60,
  };
}

/**
 * A retention override, or nothing.
 *
 * Zero is a real answer -- "this type is not kept" -- so it has to pass, while
 * a missing or nonsensical value has to stay missing: filling it in with 30
 * here would turn every measurement type the customer never touched into one
 * that overrides the tenant default, and the Contract step's field would then
 * quietly stop doing anything.
 */
function retentionDays(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

export function normalise(input: unknown): Scenario {
  const raw = (input ?? {}) as Partial<Scenario>;
  const fallback = blankScenario();
  // peakFactor was a multiplier the tool asked for and then only handed back;
  // dropping the key here stops an old save from writing it out again forever.
  const rawSettings = { ...(raw.settings ?? {}) } as Record<string, unknown>;
  delete rawSettings.peakFactor;
  const settings = { ...fallback.settings, ...rawSettings } as Scenario['settings'];

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
    protocol: typeof mt?.protocol === 'string' ? mt.protocol : undefined,
    bundles: (Array.isArray(mt?.bundles) ? mt.bundles : []).map((b) => ({
      id: b?.id ?? nextId('b'),
      // Empty means "nobody named this", which is a real state -- the tool
      // derives the name on read. A scenario saved before that was true, or by
      // hand without the field, gets the derived name rather than a literal
      // acme_Readings that was never anybody's intent.
      fragmentName: typeof b?.fragmentName === 'string' ? b.fragmentName : '',
      intervalSeconds: typeof b?.intervalSeconds === 'number' ? b.intervalSeconds : 60,
      metricIds: Array.isArray(b?.metricIds) ? b.metricIds : [],
      // Absent means "the tenant default", which is a different scenario from
      // one that says zero days -- so undefined has to survive the round trip
      // rather than being filled in with a number here.
      retentionDays: retentionDays(b?.retentionDays),
    })),
    metrics: (Array.isArray(mt?.metrics) ? mt.metrics : []).map((m) => {
      const kind = metricKind(m?.kind);
      return {
        id: m?.id ?? nextId('m'),
        name: m?.name ?? '',
        unit: m?.unit ?? '',
        kind,
        cadence: migratedCadence(m?.cadence, kind) ?? defaultCadence(kind),
        semanticGroup: m?.semanticGroup ?? '',
        fragmentName: typeof m?.fragmentName === 'string' ? m.fragmentName : undefined,
        retentionDays: retentionDays(m?.retentionDays),
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
 * StepTimeSeries offers timed readings and on-change flags in one list, because
 * they are one kind of thing; a door open/closed left on a one-minute timer is
 * then the single mistake the whole step exists to prevent, so a name that comes
 * from the other catalogue brings its rhythm with it.
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

  // One catalogue per kind now, and one rhythm: picking a name used to be able
  // to move a row from the timed table to the on-change one and back, which is
  // what the cross-catalogue lookup was for.
  const seed = seedByName(metric.kind, name);

  const patch: Partial<Metric> = { name };
  if (seed && !metric.unit.trim() && seed.unit) patch.unit = seed.unit;
  if (seed?.group && !metric.semanticGroup.trim()) patch.semanticGroup = seed.group.toLowerCase();
  return patchMetric(scenario, machineTypeId, metricId, patch);
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

/**
 * How long the tenant keeps the type this metric is its own copy of.
 *
 * Every kind but `continuous` is its own type -- an event type, an alarm type,
 * one operation, the measurement type a lone flag sends in -- so the rule lives
 * on the metric. A bundled continuous series takes its type, and therefore its
 * rule, from the bundle: `setBundleRetentionDays` is that case.
 *
 * Clearing the box drops the override rather than storing a number, because an
 * empty field means "the tenant default", which is what the placeholder says.
 */
export function setMetricRetentionDays(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  days: number | undefined,
): Scenario {
  return patchMetric(scenario, machineTypeId, metricId, {
    retentionDays: typeof days === 'number' && Number.isFinite(days) && days >= 0 ? days : undefined,
  });
}

/** The same, for a measurement type that is a bundle. */
export function setBundleRetentionDays(
  scenario: Scenario,
  machineTypeId: string,
  bundleId: string,
  days: number | undefined,
): Scenario {
  return patchBundle(scenario, machineTypeId, bundleId, {
    retentionDays: typeof days === 'number' && Number.isFinite(days) && days >= 0 ? days : undefined,
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
