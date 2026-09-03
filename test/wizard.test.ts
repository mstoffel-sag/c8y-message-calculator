/**
 * The two modules the wizard added: the bundle proposal, and the map from
 * numbers to Configurator cells.
 */

import { en } from '../lib/i18n/index.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASKED_LINE_ITEMS,
  LINE_ITEMS,
  PERIOD_ROW_STRIDE,
  applyProposal,
  autoAssign,
  cellFor,
  computeMachineTypeMonth,
  computeScenario,
  fragmentNameFor,
  intervalSlug,
  commitmentFor,
  intervalsOf,
  lintScenario,
  measurementView,
  payloadsFor,
  periodMonthsCell,
  proposalIsApplied,
  proposeBundles,
  resolveBundles,
  type MachineType,
  machineTypeSummary,
  REFERENCE_DAYS,
} from '../lib/engine/index.js';
import { blankScenario, conceptSection9Scenario, presetByKey } from '../lib/presets/index.js';

function unbundled(): MachineType {
  const hvac = presetByKey('hvac')!;
  return {
    ...hvac,
    metrics: hvac.metrics.map((m) => (m.kind === 'continuous' ? { ...m, bundleId: null } : m)),
    bundles: [],
  };
}

describe('bundle proposal', () => {
  test('groups continuous datapoints by interval, one measurement each', () => {
    const gateway = presetByKey('gateway')!;
    const proposals = proposeBundles(gateway, 'acme');
    assert.deepEqual(proposals.map((p) => p.intervalSeconds), [60, 300], 'fastest first');
    assert.deepEqual(proposals.map((p) => p.metrics.length), [3, 2]);
  });

  test('quantifies what the grouping is worth', () => {
    const [climate] = proposeBundles(unbundled(), 'acme');
    assert.ok(climate);
    assert.equal(climate.metrics.length, 4);
    // 31 days at 60 s is 44,640 sends per machine.
    assert.equal(climate.messagesTogether, 44_640);
    assert.equal(climate.messagesApart, 44_640 * 4);
  });

  test('applying it cuts the message count without touching stored values', () => {
    const loose = unbundled();
    const tight = applyProposal(loose, 'acme');

    const before = computeMachineTypeMonth(loose, 1, 31);
    const after = computeMachineTypeMonth(tight, 1, 31);

    assert.equal(before.counters.measurementsCreated - after.counters.measurementsCreated, 3 * 44_640);
    assert.equal(before.storedValues, after.storedValues, 'identical information either way');
  });

  test('it is idempotent, and says so', () => {
    const once = applyProposal(unbundled(), 'acme');
    assert.equal(proposalIsApplied(once), true);
    const twice = applyProposal(once, 'acme');
    assert.deepEqual(
      computeMachineTypeMonth(twice, 1, 31).counters,
      computeMachineTypeMonth(once, 1, 31).counters,
    );
    assert.equal(twice.bundles.length, once.bundles.length);
  });

  test('the untouched preset is already the proposal', () => {
    assert.equal(proposalIsApplied(presetByKey('hvac')!), true);
    assert.equal(proposalIsApplied(unbundled()), false);
  });

  test('a renamed fragment survives re-applying', () => {
    const named = { ...presetByKey('hvac')! };
    named.bundles = named.bundles.map((b) => ({ ...b, fragmentName: 'customer_TheirOwnName' }));
    const applied = applyProposal(named, 'acme');
    assert.equal(applied.bundles[0]?.fragmentName, 'customer_TheirOwnName');
  });

  test('empty bundles are dropped rather than left behind', () => {
    const hvac = presetByKey('hvac')!;
    const withGhost: MachineType = {
      ...hvac,
      bundles: [...hvac.bundles, { id: 'ghost', fragmentName: 'acme_Ghost', intervalSeconds: 5, metricIds: [] }],
    };
    assert.equal(applyProposal(withGhost, 'acme').bundles.some((b) => b.id === 'ghost'), false);
  });

  test('readings on different intervals never share a measurement', () => {
    const gateway = applyProposal(presetByKey('gateway')!, 'acme');
    const { bundles } = resolveBundles(gateway);
    for (const { bundle, members } of bundles) {
      for (const member of members) {
        assert.equal(
          member.cadence.mode === 'interval' ? member.cadence.seconds : -1,
          bundle.intervalSeconds,
          `${member.name} is in a ${bundle.intervalSeconds} s measurement`,
        );
      }
    }
  });

  test('adding a datapoint drops it into the measurement for its interval', () => {
    const hvac = presetByKey('hvac')!;
    const added: MachineType = {
      ...hvac,
      metrics: [
        ...hvac.metrics,
        {
          id: 'new', name: 'Fan speed', unit: 'rpm', kind: 'continuous',
          cadence: { mode: 'interval', seconds: 60 }, semanticGroup: '', bundleId: null,
        },
      ],
    };
    const assigned = autoAssign(added, 'new', 'acme');
    assert.equal(assigned.metrics.find((m) => m.id === 'new')?.bundleId, hvac.bundles[0]!.id);
    assert.equal(assigned.bundles.length, 1, 'joined the existing 60 s measurement, did not make a second');
  });

  test('a datapoint on a new interval gets a new measurement', () => {
    const hvac = presetByKey('hvac')!;
    const added: MachineType = {
      ...hvac,
      metrics: [
        ...hvac.metrics,
        {
          id: 'new', name: 'Vibration', unit: 'mm/s', kind: 'continuous',
          cadence: { mode: 'interval', seconds: 5 }, semanticGroup: '', bundleId: null,
        },
      ],
    };
    const assigned = autoAssign(added, 'new', 'acme');
    assert.equal(assigned.bundles.length, 2);
    assert.equal(assigned.bundles[1]?.intervalSeconds, 5);
  });

  test('fragment names are legible', () => {
    assert.equal(fragmentNameFor('acme', 'Rooftop HVAC unit', 60), 'acme_RooftopHvacUnit60s');
    assert.equal(fragmentNameFor('acme', 'Meter', 900), 'acme_Meter15min');
    assert.equal(intervalSlug(0.1), '100ms');
    assert.equal(intervalSlug(120), '2min');
    assert.equal(intervalSlug(3600), '1h');
  });

  test('intervalsOf reports what the customer actually chose', () => {
    assert.deepEqual(intervalsOf(presetByKey('gateway')!), [60, 300]);
  });
});

describe('Configurator cells', () => {
  test('period blocks are 30 rows apart', () => {
    assert.equal(PERIOD_ROW_STRIDE, 30);
    assert.equal(cellFor(28, 1), 'D28', 'Measurements Created, period 1');
    assert.equal(cellFor(28, 2), 'D58');
    assert.equal(cellFor(23, 1), 'D23', 'Public/Shared Cloud');
    assert.equal(cellFor(23, 5), 'D143');
    assert.equal(periodMonthsCell(1), 'D21');
    assert.equal(periodMonthsCell(3), 'D81');
  });

  test('every line item has a distinct row', () => {
    const rows = LINE_ITEMS.map((i) => i.baseRow);
    assert.equal(new Set(rows).size, rows.length);
    assert.deepEqual([...rows].sort((a, b) => a - b), rows, 'declared in workbook order');
  });

  test('messages are calculated; everything else is asked', () => {
    assert.deepEqual(
      LINE_ITEMS.filter((i) => i.source === 'calculated').map((i) => i.key),
      ['messages'],
    );
    assert.equal(ASKED_LINE_ITEMS.length, LINE_ITEMS.length - 1);
  });

  test('storage is filled in, and stays overridable', () => {
    const ods = LINE_ITEMS.find((i) => i.key === 'ods');
    assert.ok(ods);
    // 'estimated' rather than 'calculated': the tool has a figure, but it rests
    // on an unverified rule of thumb, so it is offered and not imposed.
    assert.equal(ods.source, 'estimated');
    // The sentence itself lives in the catalogue now; the item points at it.
    const help = ods.helpKey ? en[ods.helpKey] : '';
    assert.match(help, /overridable/);
    assert.match(help, /to be verified/);
    // Still asked-for in the wizard, so a customer with real numbers can say so.
    assert.ok(ASKED_LINE_ITEMS.some((i) => i.key === 'ods'));
  });

  test('no line item carries a price, rate or currency', () => {
    const text = JSON.stringify(LINE_ITEMS);
    assert.doesNotMatch(text, /€|EUR|USD|\$\d/);
    assert.doesNotMatch(text, /\bprice\b/i);
    // The DataHub uplift percentage is confidential; the tool records the
    // yes/no and stays out of the arithmetic.
    assert.doesNotMatch(text, /1\.33|33 ?%/);
  });
});

describe('scenario normalisation', () => {
  test('a scenario from the pre-wizard build loads instead of throwing', async () => {
    const { normalise } = await import('../src/ui/store.js');
    // What the earlier build wrote: no commercial, no fragmentPrefix.
    const old = {
      name: 'Old save',
      settings: { peakFactor: 3, startYear: 2027, startMonth: 1 },
      periods: [{ index: 1, months: 12, machineCountOverrides: {} }],
      machineTypes: [
        {
          id: 'mt', name: 'Pump', machineCount: 10, onlinePct: 100, bundles: [],
          metrics: [{ id: 'm', name: 'Flow', unit: 'l/s', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'flow' }],
        },
      ],
    };
    const fixed = normalise(old);
    assert.equal(fixed.settings.fragmentPrefix, 'acme');
    // peakFactor is gone from the model; an old save must not carry it back out.
    assert.equal('peakFactor' in fixed.settings, false);
    assert.deepEqual(fixed.periods[0]?.commercial, {});
    assert.equal(fixed.machineTypes[0]?.metrics[0]?.bundleId, null);
    assert.doesNotThrow(() => computeScenario(fixed));
  });

  test("a metric saved as a 'fact' loads as inventory, and still bills", async () => {
    const { normalise } = await import('../src/ui/store.js');
    // The kind was renamed with the step. A saved scenario that quietly lost its
    // managed-object writes would under-count, which is the one failure this
    // tool cannot have.
    const saved = {
      name: 'Before the rename',
      settings: { peakFactor: 3, startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
      periods: [{ index: 1, months: 12, machineCountOverrides: {}, commercial: {} }],
      machineTypes: [
        {
          id: 'mt', name: 'Pump', machineCount: 100, onlinePct: 100, bundles: [],
          metrics: [{
            id: 'm', name: 'Firmware version', unit: '', kind: 'fact',
            cadence: { mode: 'perMonth', count: 1 }, semanticGroup: 'identity', bundleId: null,
          }],
        },
      ],
    };
    const fixed = normalise(saved);
    assert.equal(fixed.machineTypes[0]?.metrics[0]?.kind, 'inventory');
    assert.equal(computeScenario(fixed).peakMonth.counters.inventoriesUpdated, 100);
  });

  test('a per-type retention rule survives a save and reload', async () => {
    const { normalise } = await import('../src/ui/store.js');
    // normalise rebuilds every bundle and metric field by field, so a new field
    // that is not listed there is silently dropped -- and a dropped retention
    // rule reverts to the default, which over-states storage without saying so.
    const saved = {
      name: 'Kept differently',
      settings: { startYear: 2027, startMonth: 1, fragmentPrefix: 'acme', retentionDays: 30 },
      periods: [{ index: 1, months: 12, machineCountOverrides: {}, commercial: {} }],
      machineTypes: [
        {
          id: 'mt', name: 'Pump', machineCount: 1, onlinePct: 100,
          bundles: [{
            id: 'b', fragmentName: 'acme_Flow', intervalSeconds: 60,
            metricIds: ['m'], retentionDays: 90,
          }],
          metrics: [
            {
              id: 'm', name: 'Flow', unit: 'l/s', kind: 'continuous',
              cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'flow', bundleId: 'b',
            },
            {
              id: 'f', name: 'Running', unit: '', kind: 'state',
              cadence: { mode: 'onChange', perDay: 2 }, semanticGroup: 'status',
              retentionDays: 0,
            },
          ],
        },
      ],
    };
    const fixed = normalise(saved);
    assert.equal(fixed.machineTypes[0]?.bundles[0]?.retentionDays, 90);
    // Zero is an answer -- "we do not keep this" -- so it must not be read as
    // absent and refilled with the default.
    assert.equal(fixed.machineTypes[0]?.metrics[1]?.retentionDays, 0);
    assert.deepEqual(
      computeScenario(fixed).months[0]?.storedByRetention.map((b) => b.retentionDays),
      [0, 90],
    );
  });

  test('a scenario with no rules anywhere keeps the field absent, not defaulted', async () => {
    const { normalise } = await import('../src/ui/store.js');
    // Filling in 30 here would make every untouched measurement type look like
    // one the customer had decided about, and the Contract step's default would
    // then quietly stop doing anything.
    const fixed = normalise({
      name: 'No rules',
      settings: { startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
      periods: [{ index: 1, months: 12, machineCountOverrides: {}, commercial: {} }],
      machineTypes: [
        {
          id: 'mt', name: 'Pump', machineCount: 1, onlinePct: 100,
          bundles: [{ id: 'b', fragmentName: 'acme_Flow', intervalSeconds: 60, metricIds: ['m'] }],
          metrics: [{
            id: 'm', name: 'Flow', unit: 'l/s', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'flow', bundleId: 'b',
            // Nonsense from a hand-edited file: neither of these is a duration.
            retentionDays: -5,
          }],
        },
      ],
    });
    assert.equal(fixed.machineTypes[0]?.bundles[0]?.retentionDays, undefined);
    assert.equal(fixed.machineTypes[0]?.metrics[0]?.retentionDays, undefined);
  });

  test('garbage in does not take the page down', async () => {
    const { normalise } = await import('../src/ui/store.js');
    for (const junk of [null, undefined, {}, { periods: 'nope' }, { machineTypes: [null] }]) {
      const fixed = normalise(junk);
      assert.equal(fixed.periods.length >= 1, true);
      assert.doesNotThrow(() => computeScenario(fixed));
    }
  });
});

describe('the catalogue behind the dropdowns', () => {
  test('every kind offers options, and names are unique within a kind', async () => {
    const { catalogFor } = await import('../lib/presets/catalog.js');
    for (const kind of ['continuous', 'state', 'occurrence', 'condition', 'inventory', 'command']) {
      const seeds = catalogFor(kind);
      assert.ok(seeds.length >= 8, `${kind} offers only ${seeds.length}`);
      const names = seeds.map((s) => s.name);
      assert.equal(new Set(names).size, names.length, `${kind} has duplicate names`);
      for (const seed of seeds) {
        assert.ok(seed.group, `${kind}/${seed.name} has no group heading`);
      }
    }
  });

  test('a continuous seed always carries a unit and a starting interval', async () => {
    const { DATAPOINTS } = await import('../lib/presets/catalog.js');
    for (const seed of DATAPOINTS) {
      assert.ok(seed.seconds && seed.seconds > 0, `${seed.name} has no interval`);
      // Power factor is genuinely dimensionless; everything else needs a unit.
      if (seed.name !== 'Power factor') assert.ok(seed.unit, `${seed.name} has no unit`);
    }
  });

  test('transitions may legitimately be zero -- and L9 warns when they are', async () => {
    const { TRANSITIONS } = await import('../lib/presets/catalog.js');
    assert.equal(TRANSITIONS[0]?.value, 0);
    assert.ok(TRANSITIONS.every((t) => t.value >= 0));
    // Every option says something: these are prose, so they say it from the
    // catalogue rather than from the seed.
    assert.ok(TRANSITIONS.every((option) => option.labelKey !== undefined));
  });

  test('picking a catalogue name fills the unit but never the interval', async () => {
    const { setDatapointName } = await import('../src/ui/store.js');
    const { blankMachineType, blankScenario } = await import('../lib/presets/index.js');

    const mt = blankMachineType('Pump');
    const withMetric = {
      ...blankScenario(),
      machineTypes: [
        {
          ...mt,
          metrics: [
            {
              id: 'm', name: '', unit: '', kind: 'continuous' as const,
              cadence: { mode: 'interval' as const, seconds: 300 },
              semanticGroup: '', bundleId: null,
            },
          ],
        },
      ],
    };

    const named = setDatapointName(withMetric, mt.id, 'm', 'CO2');
    const metric = named.machineTypes[0]?.metrics[0];
    assert.equal(metric?.unit, 'ppm', 'the unit came from the catalogue');
    assert.equal(metric?.semanticGroup, 'climate');
    assert.equal(
      metric?.cadence.mode === 'interval' ? metric.cadence.seconds : 0,
      300,
      'the interval was left alone -- changing it would silently move the measurement',
    );
  });

  test('a unit the customer already set is not overwritten', async () => {
    const { setDatapointName } = await import('../src/ui/store.js');
    const { blankMachineType, blankScenario } = await import('../lib/presets/index.js');
    const mt = blankMachineType('Pump');
    const scenario = {
      ...blankScenario(),
      machineTypes: [
        {
          ...mt,
          metrics: [
            {
              id: 'm', name: '', unit: 'K', kind: 'continuous' as const,
              cadence: { mode: 'interval' as const, seconds: 60 },
              semanticGroup: '', bundleId: null,
            },
          ],
        },
      ],
    };
    assert.equal(setDatapointName(scenario, mt.id, 'm', 'Temperature').machineTypes[0]?.metrics[0]?.unit, 'K');
  });
});

describe('a machine type in one line', () => {
  const hvac = presetByKey('hvac')!;

  test('the summary total is the same arithmetic the estimate uses', () => {
    // CONCEPT.md section 9: 1,000 HVAC units in a 31-day month. The January
    // figure is 1,000 higher because onboarding is counted at scenario level,
    // not per machine type -- so this pins the summary to the acceptance number
    // rather than to a second implementation of it.
    const s = machineTypeSummary(hvac);
    assert.equal(s.days, REFERENCE_DAYS);
    assert.equal(s.total, 45_977_000);
    assert.equal(s.machines, 1_000);
    assert.equal(s.perMachine, 45_977);
  });

  test('a state is its own measurement, so it counts as one', () => {
    // Four series on one 60 s tick share a bundle; the two flags cannot join it
    // without making its series set vary, so the machine sends three.
    const s = machineTypeSummary(hvac);
    assert.deepEqual(s.intervals, [60]);
    assert.equal(s.measurementTypes, 3);
    assert.equal(s.datapoints, 10);
  });

  test('the parts read in the order the wizard asks for them', () => {
    const s = machineTypeSummary(hvac);
    assert.deepEqual(
      s.parts.map((p) => `${p.count} ${p.kind}`),
      ['4 continuous', '2 state', '1 occurrence', '1 condition', '1 inventory', '1 command'],
    );
  });

  test('elements group created with updated, biggest first', () => {
    const s = machineTypeSummary(hvac);
    assert.deepEqual(s.elements.map((e) => e.element), [
      'Measurements',
      'Events',
      'Alarms',
      'Inventory',
      'Operations',
    ]);
    // An alarm raise creates and its clear updates: one incident, two messages,
    // one line in the summary.
    const alarms = s.elements.find((e) => e.element === 'Alarms')!;
    const month = computeMachineTypeMonth(hvac, hvac.machineCount, REFERENCE_DAYS);
    assert.equal(alarms.messages, month.counters.alarmsCreated + month.counters.alarmsUpdated);
    assert.equal(
      s.elements.reduce((sum, e) => sum + e.messages, 0),
      s.total,
      'every message lands in exactly one element',
    );
  });

  test('an empty machine type says so instead of showing zeros', () => {
    const s = machineTypeSummary({ ...hvac, metrics: [], bundles: [] });
    assert.equal(s.hasContent, false);
    assert.equal(s.total, 0);
    assert.deepEqual(s.parts, []);
    assert.deepEqual(s.elements, []);
    assert.equal(s.measurementTypes, 0);
  });

  test('machines that are offline do not send', () => {
    const half = machineTypeSummary({ ...hvac, onlinePct: 50 });
    const full = machineTypeSummary(hvac);
    assert.equal(half.online, 500);
    assert.equal(half.total, full.total / 2);
    // Per machine is per *online* machine, so it does not move with duty cycle.
    assert.equal(half.perMachine, full.perMachine);
  });
});

describe('a measurement type of its own', () => {
  /** The store touches localStorage, so it is loaded the way this file's other
   *  store tests load it. */
  const store = () => import('../src/ui/store.js');
  const fresh = async () => {
    const { blankScenario } = await import('../lib/presets/index.js');
    const scenario = { ...blankScenario(), machineTypes: [presetByKey('hvac')!] };
    return { scenario, hvac: scenario.machineTypes[0]! };
  };

  test('is created the moment it is chosen, not on the next interval change', async () => {
    const { assignOwnBundle } = await store();
    const { scenario, hvac } = await fresh();
    const pressure = hvac.metrics.find((m) => m.name === 'Pressure')!;
    assert.equal(hvac.bundles.length, 1, 'the preset ships one shared type');

    const after = assignOwnBundle(scenario, hvac.id, pressure.id).machineTypes[0]!;
    assert.equal(after.bundles.length, 2, 'the choice minted the type itself');

    const mine = after.bundles.find((b) => b.metricIds.length === 1)!;
    assert.deepEqual(mine.metricIds, [pressure.id]);
    assert.equal(after.metrics.find((m) => m.id === pressure.id)?.bundleId, mine.id);
    // Named after the series -- the name the diagram already showed for it --
    // and stored rather than derived, so the row can rename it.
    assert.equal(mine.fragmentName, 'acme_Pressure');
    assert.equal(mine.intervalSeconds, 60, 'at the interval the series is sampled on');

    const left = after.bundles.find((b) => b.id !== mine.id)!;
    assert.equal(left.metricIds.length, 3, 'the other three stayed together');
  });

  test('choosing it twice does not leave an empty type behind', async () => {
    const { assignOwnBundle } = await store();
    const { scenario, hvac } = await fresh();
    const pressure = hvac.metrics.find((m) => m.name === 'Pressure')!;
    const once = assignOwnBundle(scenario, hvac.id, pressure.id);
    const twice = assignOwnBundle(once, hvac.id, pressure.id);
    assert.deepEqual(
      twice.machineTypes[0]?.bundles.map((b) => b.id),
      once.machineTypes[0]?.bundles.map((b) => b.id),
      'already alone in one, so the second choice is a no-op',
    );
  });

  test('two series with the same name get two names', async () => {
    const { assignOwnBundle } = await store();
    const { scenario, hvac } = await fresh();
    const [first, second] = hvac.metrics.filter((m) => m.kind === 'continuous');
    const renamed = {
      ...scenario,
      machineTypes: [
        {
          ...hvac,
          metrics: hvac.metrics.map((m) =>
            m.id === first!.id || m.id === second!.id ? { ...m, name: 'Pressure' } : m,
          ),
        },
      ],
    };
    let after = assignOwnBundle(renamed, hvac.id, first!.id);
    after = assignOwnBundle(after, hvac.id, second!.id);
    const names = after.machineTypes[0]!.bundles.map((b) => b.fragmentName);
    assert.ok(names.includes('acme_Pressure'));
    assert.ok(names.includes('acme_Pressure2'), `no second name in ${names.join(', ')}`);
    assert.equal(new Set(names).size, names.length, 'no measurement type is named twice');
  });

  test('the type a series leaves is dropped once nothing is in it', async () => {
    const { assignOwnBundle } = await store();
    const { scenario, hvac } = await fresh();
    let after = scenario;
    for (const metric of hvac.metrics.filter((m) => m.kind === 'continuous')) {
      after = assignOwnBundle(after, hvac.id, metric.id);
    }
    const bundles = after.machineTypes[0]!.bundles;
    assert.equal(bundles.length, 4, 'four series, four types, and no husk of the shared one');
    assert.ok(bundles.every((b) => b.metricIds.length === 1));
  });

  test('moving the last series out of a shared type drops it too', async () => {
    const { assignBundle } = await store();
    const { scenario, hvac } = await fresh();
    let after = scenario;
    for (const id of hvac.bundles[0]!.metricIds) after = assignBundle(after, hvac.id, id, null);
    assert.deepEqual(after.machineTypes[0]?.bundles, [], 'a type is its members');
  });
});

describe('the two rhythms are one kind of thing', () => {
  const store = () => import('../src/ui/store.js');
  const fresh = async () => {
    const { blankScenario } = await import('../lib/presets/index.js');
    const scenario = { ...blankScenario(), machineTypes: [presetByKey('hvac')!] };
    return { scenario, hvac: scenario.machineTypes[0]! };
  };

  test('switching a timed reading to on-change keeps its period and drops its type', async () => {
    const { setRhythm } = await store();
    const { scenario, hvac } = await fresh();
    const temp = hvac.metrics.find((m) => m.name === 'Supply air temp')!;

    const after = setRhythm(scenario, hvac.id, temp.id, 'onChange').machineTypes[0]!;
    const moved = after.metrics.find((m) => m.id === temp.id)!;
    assert.equal(moved.kind, 'state');
    assert.equal(moved.cadence.mode, 'onChange');
    // Sampled every 60 s, so "about every 60 s when it changes" -- 1,440 a day,
    // not a default plucked out of the air.
    assert.equal(moved.cadence.mode === 'onChange' ? moved.cadence.perDay : 0, 1440);
    assert.equal(moved.bundleId, null, 'an on-change timestamp cannot share a tick');
    assert.equal(after.bundles[0]?.metricIds.length, 3, 'it left acme_Climate');
  });

  test('and back again, into the measurement type for its interval', async () => {
    const { setRhythm } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;
    const perDay = flag.cadence.mode === 'onChange' ? flag.cadence.perDay : 0;

    const after = setRhythm(scenario, hvac.id, flag.id, 'interval').machineTypes[0]!;
    const moved = after.metrics.find((m) => m.id === flag.id)!;
    assert.equal(moved.kind, 'continuous');
    assert.equal(
      moved.cadence.mode === 'interval' ? moved.cadence.seconds : 0,
      86_400 / perDay,
      'the period it was changing at becomes the period it is sampled at',
    );
    // 86400/perDay is not 60 s for the preset's flag, so it gets its own type
    // rather than joining acme_Climate.
    assert.equal(after.bundles.length, 2);
    assert.equal(after.metrics.find((m) => m.id === flag.id)?.bundleId, after.bundles[1]?.id);
  });

  test('asking for the rhythm a series already has changes nothing', async () => {
    const { setRhythm } = await store();
    const { scenario, hvac } = await fresh();
    const temp = hvac.metrics.find((m) => m.name === 'Supply air temp')!;
    assert.equal(setRhythm(scenario, hvac.id, temp.id, 'interval'), scenario);
  });

  test('a name from the on-change catalogue brings its rhythm with it', async () => {
    const { setDatapointName } = await store();
    const { scenario, hvac } = await fresh();
    const temp = hvac.metrics.find((m) => m.name === 'Supply air temp')!;

    // One list on the page, so this pick is one click away from a flag sampled
    // 44,640 times a month -- the mistake the step exists to prevent.
    const after = setDatapointName(scenario, hvac.id, temp.id, 'Door open/closed').machineTypes[0]!;
    const moved = after.metrics.find((m) => m.id === temp.id)!;
    assert.equal(moved.name, 'Door open/closed');
    assert.equal(moved.kind, 'state', 'the catalogue knew the rhythm');
    assert.equal(moved.bundleId, null);
  });

  test('a timed name pulls an on-change series back onto a timer', async () => {
    const { setDatapointName } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;

    const after = setDatapointName(scenario, hvac.id, flag.id, 'Temperature').machineTypes[0]!;
    const moved = after.metrics.find((m) => m.id === flag.id)!;
    assert.equal(moved.kind, 'continuous');
    assert.equal(moved.unit, 'C', 'and filled the unit on the way, as it always did');
  });

  test('a name in neither catalogue leaves the rhythm alone', async () => {
    const { setDatapointName } = await store();
    const { scenario, hvac } = await fresh();
    const temp = hvac.metrics.find((m) => m.name === 'Supply air temp')!;
    const after = setDatapointName(scenario, hvac.id, temp.id, 'Widget count').machineTypes[0]!;
    assert.equal(after.metrics.find((m) => m.id === temp.id)?.kind, 'continuous');
  });
});

describe('naming the measurement type a lone series sends in', () => {
  const store = () => import('../src/ui/store.js');
  const fresh = async () => {
    const { blankScenario } = await import('../lib/presets/index.js');
    const scenario = { ...blankScenario(), machineTypes: [presetByKey('hvac')!] };
    return { scenario, hvac: scenario.machineTypes[0]! };
  };

  test('an on-change flag can be named, and the name reaches the diagram', async () => {
    const { setSeriesFragmentName } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;
    assert.equal(
      measurementView(hvac, 'acme').groups.find((g) => g.id === flag.id)?.fragmentName,
      'acme_CompressorOnOff',
      'derived until the customer says otherwise',
    );

    const named = setSeriesFragmentName(scenario, hvac.id, flag.id, 'plant_CompressorState');
    const mt = named.machineTypes[0]!;
    assert.equal(mt.metrics.find((m) => m.id === flag.id)?.fragmentName, 'plant_CompressorState');
    assert.equal(
      measurementView(mt, 'acme').groups.find((g) => g.id === flag.id)?.fragmentName,
      'plant_CompressorState',
      'one derivation, so the table and the diagram cannot disagree',
    );
    // And the payload example a customer copies to their device team.
    const example = payloadsFor(mt, 'acme').find((e) => e.name === 'plant_CompressorState');
    assert.ok(example, 'the payload example carries it too');
  });

  test('clearing the box goes back to the derived name, not to nothing', async () => {
    const { setSeriesFragmentName } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Filter status')!;
    const named = setSeriesFragmentName(scenario, hvac.id, flag.id, 'acme_Filter');
    const cleared = setSeriesFragmentName(named, hvac.id, flag.id, '   ');
    const mt = cleared.machineTypes[0]!;
    assert.equal(mt.metrics.find((m) => m.id === flag.id)?.fragmentName, undefined);
    assert.equal(
      measurementView(mt, 'acme').groups.find((g) => g.id === flag.id)?.fragmentName,
      'acme_FilterStatus',
    );
  });

  test('naming one the same as a bundle elsewhere is the L7 error it always was', async () => {
    const { setSeriesFragmentName } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;
    // acme_Climate carries four series on this machine type; the flag carries
    // one. Same fragment name, two series sets.
    const clash = setSeriesFragmentName(scenario, hvac.id, flag.id, 'acme_Climate');
    const findings = lintScenario(clash).filter((f) => f.rule === 'L7');
    assert.equal(findings.length, 1, 'a solo measurement type is a fragment name like any other');
    assert.equal(findings[0]!.titleParams?.name, 'acme_Climate');
    assert.deepEqual(findings[0]!.metricIds, [flag.id]);
    // And a clean scenario still says nothing.
    assert.deepEqual(lintScenario(scenario).filter((f) => f.rule === 'L7'), []);
  });
});


describe('the commit-to-consume commitment', () => {
  const twoPeriods = () => {
    const base = conceptSection9Scenario();
    const hvac = base.machineTypes[0]!;
    return {
      ...base,
      periods: [
        { index: 1, months: 12, machineCountOverrides: {}, commercial: {} },
        { index: 2, months: 24, machineCountOverrides: { [hvac.id]: 4000 }, commercial: {} },
      ],
    };
  };

  test('the term is every period added up', () => {
    const scenario = twoPeriods();
    const c = commitmentFor(scenario, computeScenario(scenario));
    assert.deepEqual(c.months, [12, 24]);
    assert.equal(c.termMonths, 36);
  });

  test('messages are rounded up per month, then multiplied by the months', () => {
    const scenario = twoPeriods();
    const result = computeScenario(scenario);
    const c = commitmentFor(scenario, result);

    // Not ROUNDUP(total_over_term / 100000): the platform bills a month at a
    // time, so each month's part-block is paid for. Rounding once at the end
    // would under-count by up to one block per month.
    const expected = result.periods.reduce(
      (sum, p, i) => sum + Math.ceil(p.peak.total / 100_000) * (c.months[i] ?? 0),
      0,
    );
    assert.equal(c.termUnitsQuoted, expected);
    assert.equal(c.unitsPerMonth.length, 2);
  });

  test('a commitment quoted on peak months is bigger than the fleet will use', () => {
    const scenario = twoPeriods();
    const c = commitmentFor(scenario, computeScenario(scenario));
    // Every period is quoted at its fullest month, but February is short and the
    // fleet steps up mid-contract, so real consumption is lower.
    assert.ok(c.termUnitsActual < c.termUnitsQuoted, `${c.termUnitsActual} vs ${c.termUnitsQuoted}`);
    assert.ok(c.headroom > 0 && c.headroom < 0.5);
    assert.equal(
      c.headroom,
      1 - c.termUnitsActual / c.termUnitsQuoted,
      'the headroom is that gap, as a share',
    );
  });

  test('a flat fleet on 31-day months has almost no headroom', () => {
    const base = conceptSection9Scenario();
    const scenario = {
      ...base,
      settings: { ...base.settings, startYear: 2027, startMonth: 1 },
      periods: [{ index: 1, months: 1, machineCountOverrides: {}, commercial: {} }],
    };
    const c = commitmentFor(scenario, computeScenario(scenario));
    // One month, quoted at itself: nothing to over-state.
    assert.equal(c.termUnitsActual, c.termUnitsQuoted);
    assert.equal(c.headroom, 0);
  });

  test('it holds no price and cannot produce one', () => {
    const scenario = twoPeriods();
    const c = commitmentFor(scenario, computeScenario(scenario));
    // Every field is a count, a month or a ratio. The multiplication by a rate
    // happens in the workbook, over a column the tool leaves empty.
    for (const [key, value] of Object.entries(c)) {
      const numbers = Array.isArray(value) ? value : [value];
      for (const n of numbers) {
        assert.equal(typeof n, 'number', key);
        assert.ok(Number.isFinite(n), key);
      }
    }
    assert.equal(Object.keys(c).includes('price'), false);
  });

  test('an empty scenario commits to nothing', () => {
    const empty = blankScenario();
    const c = commitmentFor(empty, computeScenario(empty));
    assert.equal(c.termMessages, 0);
    assert.equal(c.termUnitsQuoted, 0);
    assert.equal(c.headroom, 0, 'not NaN');
  });
});
