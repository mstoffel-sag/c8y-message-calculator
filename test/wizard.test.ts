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
  proposalApplied,
  proposalIsApplied,
  proposeBundles,
  resolveBundles,
  type MachineType,
  type Scenario,
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

    // Three of the four climate readings stop being their own message, and one
    // of the two 72-minute statuses joins the other: 3 x 44,640 + 620.
    assert.equal(
      before.counters.measurementsCreated - after.counters.measurementsCreated,
      3 * 44_640 + 620,
    );
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

  test('the untouched preset has one grouping left to offer', () => {
    // It used to be exactly the proposal. It no longer is, and the reason is
    // worth stating: its two statuses are both read every 72 minutes, and two
    // series on one tick can share a message -- which was impossible while a
    // flag was its own kind that could not join a bundle. So the tool now
    // offers to merge them, worth 620 messages a machine a month.
    //
    // The preset is deliberately left alone: §9's figures are the engine's
    // acceptance baseline and are documented as such, and this suggestion is
    // the customer's to take.
    assert.equal(proposalIsApplied(presetByKey('hvac')!), false);
    assert.equal(proposalIsApplied(unbundled()), false);

    const proposals = proposeBundles(presetByKey('hvac')!, 'acme');
    assert.deepEqual(proposals.map((p) => p.intervalSeconds), [60, 4320]);
    assert.equal(proposals[1]!.messagesApart - proposals[1]!.messagesTogether, 620);
  });

  test('a half-grouped fleet is offered only what it has not banked', () => {
    // The banner used to sum every proposal's saving whether or not it was
    // already in place, so the preset offered "apply and save 134.5 M" when
    // 133.9 M of that was the climate bundle it already had.
    const hvac = presetByKey('hvac')!;
    const proposals = proposeBundles(hvac, 'acme');
    const [climate, statuses] = proposals;

    assert.equal(proposalApplied(hvac, climate!), true, 'the 60 s bundle is in place');
    assert.equal(proposalApplied(hvac, statuses!), false, 'the two statuses are not');

    const pending = proposals.filter((p) => !proposalApplied(hvac, p));
    const saving = pending.reduce((s, p) => s + (p.messagesApart - p.messagesTogether), 0);
    assert.equal(saving, 620, 'per machine per month, and not 134,540');
  });

  test('a bundle carrying a series the proposal does not name is not that proposal', () => {
    // Exactly these members, or it is a different design.
    const hvac = presetByKey('hvac')!;
    const [climate] = proposeBundles(hvac, 'acme');
    const widened = {
      ...hvac,
      metrics: hvac.metrics.map((m) =>
        m.name === 'Compressor on/off' ? { ...m, bundleId: hvac.bundles[0]!.id } : m,
      ),
      bundles: hvac.bundles.map((b) =>
        b.id === hvac.bundles[0]!.id
          ? { ...b, metricIds: [...b.metricIds, hvac.metrics.find((m) => m.name === 'Compressor on/off')!.id] }
          : b,
      ),
    };
    assert.equal(proposalApplied(widened, climate!), false);
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
    // The gateway's uplink state is read every 6 h, and that is a tick like
    // any other now, so it appears here beside the two bundles.
    assert.deepEqual(intervalsOf(presetByKey('gateway')!), [60, 300, 21_600]);
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

  test('a tag count survives a save and reload, and one stays absent', async () => {
    const { normalise } = await import('../src/ui/store.js');
    // A dropped count would quote 450 tags as one series -- an under-count by
    // a factor of 450 on the stored side, which is the one failure this tool
    // cannot have.
    const saved = {
      name: 'PLC line',
      settings: { startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
      periods: [{ index: 1, months: 12, machineCountOverrides: {}, commercial: {} }],
      machineTypes: [{
        id: 'mt', name: 'Line', machineCount: 10, onlinePct: 100, bundles: [],
        metrics: [
          {
            id: 'tags', name: 'PLC tags', unit: '', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process',
            seriesCount: 450,
          },
          {
            id: 'temp', name: 'Supply air temp', unit: 'C', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process',
          },
        ],
      }],
    };
    const fixed = normalise(saved);
    assert.equal(fixed.machineTypes[0]?.metrics[0]?.seriesCount, 450);
    // An ordinary row keeps no field at all, so it exports as it always did.
    assert.equal(fixed.machineTypes[0]?.metrics[1]?.seriesCount, undefined);
  });

  test('one type per series survives a save, and the flag is gone when off', async () => {
    const { normalise } = await import('../src/ui/store.js');
    const saved = {
      machineTypes: [{
        id: 'mt', name: 'Line', machineCount: 1, onlinePct: 100, bundles: [],
        metrics: [
          {
            id: 'tags', name: 'PLC tags', unit: '', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process',
            seriesCount: 10, typePerSeries: true,
          },
          {
            id: 'temp', name: 'Supply air temp', unit: 'C', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process',
            typePerSeries: false,
          },
        ],
      }],
    };
    const metrics = normalise(saved).machineTypes[0]!.metrics;
    assert.equal(metrics[0]?.typePerSeries, true);
    // Only `true` is stored, so an ordinary row exports exactly as it did
    // before the flag existed.
    assert.equal(metrics[1]?.typePerSeries, undefined);
  });

  test('choosing a shared measurement type cancels one type per series', async () => {
    const { assignBundle, assignOwnBundle, assignTypePerSeries } =
      await import('../lib/scenario/edits.js');

    let scenario: Scenario = {
      ...blankScenario(),
      machineTypes: [{
        id: 'mt', name: 'Line', machineCount: 1, onlinePct: 100,
        metrics: [
          {
            id: 'tags', name: 'PLC tags', unit: '', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process',
            seriesCount: 10, bundleId: 'b',
          },
          {
            id: 'temp', name: 'Supply air temp', unit: 'C', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'process', bundleId: 'b',
          },
        ],
        bundles: [{ id: 'b', fragmentName: 'acme_Line60s', intervalSeconds: 60, metricIds: ['tags', 'temp'] }],
      }],
    };

    const tagRow = (s: Scenario) => s.machineTypes[0]!.metrics.find((m) => m.id === 'tags')!;

    scenario = assignTypePerSeries(scenario, 'mt', 'tags');
    assert.equal(tagRow(scenario).typePerSeries, true);
    assert.equal(tagRow(scenario).bundleId, null, 'it cannot stay in a shared type');
    assert.equal(tagRow(scenario).seriesCount, 10, 'the count is untouched');
    // The type it left still exists, because the named reading is still in it.
    assert.deepEqual(scenario.machineTypes[0]!.bundles.map((b) => b.metricIds), [['temp']]);

    // Both ways back clear the flag -- otherwise the dropdown would say one
    // thing and the arithmetic another.
    assert.equal(tagRow(assignBundle(scenario, 'mt', 'tags', 'b')).typePerSeries, undefined);
    assert.equal(tagRow(assignOwnBundle(scenario, 'mt', 'tags')).typePerSeries, undefined);
  });

  test('a scenario predating counted rows reads as one series a row', async () => {
    const { normalise } = await import('../src/ui/store.js');
    for (const junk of [undefined, null, 0, 1, -5, 'many', 1.5]) {
      const fixed = normalise({
        machineTypes: [{
          id: 'mt', name: 'Line', machineCount: 1, onlinePct: 100, bundles: [],
          metrics: [{
            id: 'm', name: 'Flow', unit: 'l/s', kind: 'continuous',
            cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'flow',
            seriesCount: junk,
          }],
        }],
      });
      assert.equal(
        fixed.machineTypes[0]?.metrics[0]?.seriesCount,
        undefined,
        `${String(junk)} should mean one series and store nothing`,
      );
    }
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
    for (const kind of ['continuous', 'occurrence', 'condition', 'inventory', 'command']) {
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

  test('a series alone in its type still counts as a type', () => {
    // Four readings on one 60 s tick share a bundle; the two statuses are read
    // every 72 min, which no bundle here uses, so the machine sends three.
    const s = machineTypeSummary(hvac);
    assert.deepEqual(s.intervals, [60, 4320], 'both ticks the customer chose');
    assert.equal(s.measurementTypes, 3);
    assert.equal(s.datapoints, 10);
  });

  test('the parts read in the order the wizard asks for them', () => {
    const s = machineTypeSummary(hvac);
    assert.deepEqual(
      s.parts.map((p) => `${p.count} ${p.kind}`),
      ['6 continuous', '1 occurrence', '1 condition', '1 inventory', '1 command'],
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
    // Six series now -- the four climate readings plus the two statuses, which
    // are ordinary series and so are in this loop too.
    assert.equal(bundles.length, 6, 'six series, six types, and no husk of the shared one');
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

describe('one rhythm, and what happens to a scenario that predates it', () => {
  const store = () => import('../src/ui/store.js');
  const fresh = async () => {
    const { blankScenario } = await import('../lib/presets/index.js');
    const scenario = { ...blankScenario(), machineTypes: [presetByKey('hvac')!] };
    return { scenario, hvac: scenario.machineTypes[0]! };
  };

  /**
   * The conversion that has to be exactly right.
   *
   * A saved flag was quoted as a change rate and billed one message per change.
   * As a series it is quoted as an interval. 86,400 / perDay is the interval
   * that bills the identical number, so a scenario reloaded after the change
   * costs what it cost before -- and the failure mode if this is wrong is a
   * fleet quoted at seventy times its volume, in a tool whose output goes into
   * a contract.
   */
  const savedWithFlag = (perDay: number) => ({
    name: 'Before one rhythm',
    settings: { startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
    periods: [{ index: 1, months: 1, machineCountOverrides: {}, commercial: {} }],
    machineTypes: [
      {
        id: 'mt', name: 'Pump', machineCount: 1, onlinePct: 100, bundles: [],
        metrics: [{
          id: 'f', name: 'Compressor on/off', unit: '', kind: 'state',
          cadence: { mode: 'onChange', perDay }, semanticGroup: 'status', bundleId: null,
        }],
      },
    ],
  });

  test('a saved flag loads as a series on the interval that bills the same', async () => {
    const { normalise } = await store();
    const fixed = normalise(savedWithFlag(20));
    const metric = fixed.machineTypes[0]!.metrics[0]!;

    assert.equal(metric.kind, 'continuous');
    assert.equal(metric.cadence.mode, 'interval');
    assert.equal(metric.cadence.mode === 'interval' ? metric.cadence.seconds : 0, 4320);
    // 20 changes a day for 31 days = 620 messages. Every 4,320 s in a 31-day
    // month = 2,678,400 / 4,320 = 620. The same number, which is the point.
    assert.equal(computeScenario(fixed).months[0]!.counters.measurementsCreated, 620);
  });

  test('and it costs exactly what it cost before the rhythm went', async () => {
    const { normalise } = await store();
    for (const perDay of [0.5, 1, 4, 12, 20, 96]) {
      const fixed = normalise(savedWithFlag(perDay));
      assert.equal(
        computeScenario(fixed).months[0]!.counters.measurementsCreated,
        perDay * 31,
        `${perDay} a day should still be ${perDay * 31} in a 31-day month`,
      );
    }
  });

  test('a nonsensical change rate falls back rather than dividing by zero', async () => {
    const { normalise } = await store();
    for (const perDay of [0, -3, Number.NaN]) {
      const metric = normalise(savedWithFlag(perDay)).machineTypes[0]!.metrics[0]!;
      assert.equal(metric.cadence.mode, 'interval');
      assert.equal(metric.cadence.mode === 'interval' ? metric.cadence.seconds : 0, 60);
    }
  });

  test('an on-change cadence on a kind that still has one is left alone', async () => {
    const { normalise } = await store();
    // Only measurements lost the rhythm. An event still happens when it
    // happens, and converting its rate to an interval would be nonsense.
    const fixed = normalise({
      ...savedWithFlag(3),
      machineTypes: [
        {
          id: 'mt', name: 'Pump', machineCount: 1, onlinePct: 100, bundles: [],
          metrics: [{
            id: 'e', name: 'Door opened', unit: '', kind: 'occurrence',
            cadence: { mode: 'onChange', perDay: 3 }, semanticGroup: 'access', bundleId: null,
          }],
        },
      ],
    });
    const metric = fixed.machineTypes[0]!.metrics[0]!;
    assert.equal(metric.cadence.mode, 'onChange');
    assert.equal(metric.cadence.mode === 'onChange' ? metric.cadence.perDay : 0, 3);
  });

  test('the preset flags are series now, and the fleet still bills what §9 says', async () => {
    const { hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;
    assert.equal(flag.kind, 'continuous');
    assert.equal(flag.cadence.mode === 'interval' ? flag.cadence.seconds : 0, 4320);
    // Its own measurement type, because 4,320 s is not the climate tick.
    assert.equal(flag.bundleId, null);
  });

  test('picking a name fills the unit and no longer moves the row anywhere', async () => {
    const { setDatapointName } = await store();
    const { scenario, hvac } = await fresh();
    const flag = hvac.metrics.find((m) => m.name === 'Compressor on/off')!;

    // This used to pull the row across to the timed catalogue and rewrite its
    // cadence. There is one catalogue and one rhythm now, so a name is a name.
    const after = setDatapointName(scenario, hvac.id, flag.id, 'Temperature').machineTypes[0]!;
    const moved = after.metrics.find((m) => m.id === flag.id)!;
    assert.equal(moved.kind, 'continuous');
    assert.equal(moved.unit, 'C', 'the unit still comes along');
    assert.equal(
      moved.cadence.mode === 'interval' ? moved.cadence.seconds : 0,
      4320,
      'and the interval the customer chose is left where it was',
    );
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

describe('a library of scenarios', () => {
  test('entries sort newest first and survive a rubbish index', async () => {
    const { normaliseEntries, sortedEntries, touch, removeEntry, mostRecent } =
      await import('../lib/scenario/library.js');

    let entries = touch([], 'a', 'Acme', 1_000);
    entries = touch(entries, 'b', 'Northwind', 2_000);
    assert.deepEqual(entries.map((e) => e.id), ['b', 'a'], 'newest first');
    assert.equal(mostRecent(entries)?.id, 'b');

    // Saving again moves it up and takes the new name with it -- the name is
    // copied from the scenario rather than being a second thing to keep in step.
    entries = touch(entries, 'a', 'Acme GmbH', 3_000);
    assert.deepEqual(entries.map((e) => e.id), ['a', 'b']);
    assert.equal(entries[0]?.name, 'Acme GmbH');
    assert.equal(entries.length, 2, 'touch updates, it does not duplicate');

    assert.deepEqual(removeEntry(entries, 'a').map((e) => e.id), ['b']);

    // A library that throws on load leaves the app with no way in, so a bad
    // row is dropped rather than fatal.
    assert.deepEqual(normaliseEntries(null), []);
    assert.deepEqual(normaliseEntries('nonsense'), []);
    const cleaned = normaliseEntries([
      { id: 'ok', name: 'Fine', savedAt: 5 },
      { id: 'ok', name: 'Duplicate', savedAt: 9 },
      { name: 'No id', savedAt: 1 },
      { id: '', name: 'Empty id' },
      { id: 'nodate' },
    ]);
    assert.deepEqual(cleaned.map((e) => e.id), ['ok', 'nodate']);
    assert.equal(cleaned.find((e) => e.id === 'nodate')?.savedAt, 0);
    assert.equal(sortedEntries(cleaned)[0]?.id, 'ok');
  });

  test('an id is safe in a URL, because the Web SDK build routes on it', async () => {
    const { newScenarioId } = await import('../lib/scenario/library.js');
    for (let i = 0; i < 200; i += 1) {
      const id = newScenarioId();
      assert.match(id, /^s[a-z0-9]+$/, id);
      assert.equal(encodeURIComponent(id), id, 'must survive scenario/:id');
    }
    // Distinct within the same millisecond, which is when two clicks land.
    const ids = new Set(Array.from({ length: 500 }, () => newScenarioId(1_700_000_000_000)));
    assert.ok(ids.size > 490, `expected near-unique ids, got ${ids.size}`);
  });

  test('a nameless scenario still gets a row somebody can click', async () => {
    const { entryName } = await import('../lib/scenario/library.js');
    assert.equal(entryName({ name: 'Acme' }, 'Untitled'), 'Acme');
    assert.equal(entryName({ name: '   ' }, 'Untitled'), 'Untitled');
    assert.equal(entryName({ name: '' }, 'Untitled'), 'Untitled');
  });
});


describe('what the left navigator shows', () => {
  /**
   * The shape, not the SDK objects. `@c8y/ngx-components` cannot be imported
   * outside a bundler, so the factory itself is verified by a deploy -- which
   * is exactly how the first cut shipped a `get()` that threw and took the
   * whole left menu with it, this app's entry and every other app's. Whatever
   * can be decided without the SDK is decided here, where a test can reach it.
   */
  async function tree(entries: Array<{ id: string; name: string; savedAt: number }>, max?: number) {
    const { scenarioNavTree } = await import('../lib/wizard/navigator.js');
    return scenarioNavTree(entries, 'Untitled scenario', max);
  }

  test('the app keeps its entry, and every scenario is a child of it', async () => {
    const { root, children } = await tree([
      { id: 's1', name: 'Acme rooftop HVAC', savedAt: 2 },
      { id: 's2', name: '   ', savedAt: 1 },
    ]);
    assert.equal(root.label, 'Message calculator');
    assert.equal(root.path, '/');
    assert.equal(children.length, 2);
    assert.equal(children[0]?.label, 'Acme rooftop HVAC');
    assert.equal(children[0]?.path, '/scenario/s1');
    // A customer's own name is data, so the shell must not translate it.
    assert.equal(children[0]?.translateLabel, false);
    // A nameless scenario still gets a row somebody can click, and that label
    // is the tool's own word, so it is translated.
    assert.equal(children[1]?.label, 'Untitled scenario');
    assert.equal(children[1]?.translateLabel, true);
  });

  test('an empty library still leaves the application reachable', async () => {
    const { root, children } = await tree([]);
    assert.equal(root.label, 'Message calculator');
    assert.equal(children.length, 0);
  });

  test('the menu is capped, so it stays navigation rather than a filing cabinet', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      name: `Scenario ${i}`,
      savedAt: 100 - i,
    }));
    assert.equal((await tree(many)).children.length, 8, 'the rest are on the page');
    assert.equal((await tree(many, 0)).children.length, 0, 'a cap of none is not a crash');
  });
});
