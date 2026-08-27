/**
 * The engine's acceptance test. CONCEPT.md section 9.
 *
 * If these numbers move, either the concept changed or the engine is wrong --
 * and the point of writing them down is that nobody has to guess which.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BYTES_PER_GIB,
  BYTES_PER_VALUE_HIGH,
  BYTES_PER_VALUE_LOW,
  COUNTER_KEYS,
  DATAHUB_SHARE_HIGH,
  DATAHUB_SHARE_LOW,
  computeScenario,
  computeMachineTypeMonth,
  daysInMonth,
  expandMonths,
  lintScenario,
  onboardingByPeriod,
  payloadsFor,
  resolveBundles,
  seriesNameOf,
  totalOf,
  type MachineType,
  type Scenario,
} from '../lib/engine/index.js';
import { blankScenario, conceptSection9Scenario, presetByKey } from '../lib/presets/index.js';

/** Narrows and fails with a useful message, which assert.ok does not do here. */
function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

function monthOf(result: ReturnType<typeof computeScenario>, month: number) {
  return must(
    result.months.find((m) => m.month === month),
    `no month ${month} in result`,
  );
}

describe('calendar', () => {
  test('real month lengths, including leap years', () => {
    assert.equal(daysInMonth(2027, 1), 31);
    assert.equal(daysInMonth(2027, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2027, 4), 30);
    assert.equal(daysInMonth(2027, 12), 31);
  });

  test('periods expand into consecutive calendar months and roll the year', () => {
    const months = expandMonths([{ index: 1, months: 3 }, { index: 2, months: 2 }], 2027, 11);
    assert.deepEqual(
      months.map((m) => `${m.year}-${m.month}:p${m.periodIndex}`),
      ['2027-11:p1', '2027-12:p1', '2028-1:p1', '2028-2:p2', '2028-3:p2'],
    );
    assert.equal(months[3]!.days, 29, 'February 2028 is a leap February');
    assert.equal(months[3]!.monthOfPeriod, 1);
  });
});

describe('CONCEPT.md section 9 - 1,000 rooftop HVAC units', () => {
  const result = computeScenario(conceptSection9Scenario());

  test('the 31-day month matches the concept line by line', () => {
    const january = monthOf(result, 1);
    assert.equal(january.days, 31);
    assert.equal(january.counters.measurementsCreated, 44_640_000 + 1_240_000);
    assert.equal(january.counters.eventsCreated, 31_000);
    assert.equal(january.counters.eventsUpdated, 0);
    assert.equal(january.counters.alarmsCreated, 15_500);
    assert.equal(january.counters.alarmsUpdated, 15_500);
    assert.equal(january.counters.inventoriesUpdated, 31_000);
    assert.equal(january.counters.operationsCreated, 1_000);
    assert.equal(january.counters.operationsUpdated, 3_000);
  });

  test('total messages in the 31-day month: 45,977,000', () => {
    // January is period 1 month 1, so it also carries the one-off onboarding.
    const january = monthOf(result, 1);
    assert.equal(january.onboardingCreates, 1_000);
    assert.equal(january.counters.inventoriesCreated, 1_000);
    assert.equal(january.total - january.onboardingCreates, 45_977_000);
  });

  test('total messages in February: 41,528,000', () => {
    const february = monthOf(result, 2);
    assert.equal(february.days, 28);
    assert.equal(february.counters.measurementsCreated, 40_320_000 + 1_120_000);
    assert.equal(february.counters.eventsCreated, 28_000);
    assert.equal(february.counters.alarmsCreated, 14_000);
    assert.equal(february.counters.alarmsUpdated, 14_000);
    assert.equal(february.counters.inventoriesUpdated, 28_000);
    assert.equal(february.counters.operationsCreated, 1_000);
    assert.equal(february.counters.operationsUpdated, 3_000);
    assert.equal(february.onboardingCreates, 0, 'onboarding is a one-off, not a monthly rate');
    assert.equal(february.total, 41_528_000);
  });

  test('the naive baseline is 267,937,000 in the 31-day month', () => {
    const january = monthOf(result, 1);
    assert.equal(january.naiveTotal - january.onboardingCreates, 267_937_000);
  });

  test('the delta is 221,960,000 -- 5.8x, 83 %', () => {
    const january = monthOf(result, 1);
    const designed = january.total - january.onboardingCreates;
    const naive = january.naiveTotal - january.onboardingCreates;
    assert.equal(naive - designed, 221_960_000);
    assert.equal(Number((naive / designed).toFixed(1)), 5.8);
    assert.equal(Math.round((1 - designed / naive) * 100), 83);
  });

  test('the same fleet spans an 11 % range on month length alone', () => {
    // The peak month carries onboarding, so compare steady-state months.
    const steady = result.months.filter((m) => m.onboardingCreates === 0);
    const peak = Math.max(...steady.map((m) => m.total));
    const lean = Math.min(...steady.map((m) => m.total));
    assert.equal(peak, 45_977_000);
    assert.equal(lean, 41_528_000);
    assert.equal(Math.round((peak / lean - 1) * 100), 11);
  });

  test('stored values count series, not messages', () => {
    const january = monthOf(result, 1);
    // 44.64 M bundle sends x 4 series, plus 1.24 M single-series state sends.
    assert.equal(january.storedValues, 44_640_000 * 4 + 1_240_000);
    assert.ok(
      january.storedValues > january.counters.measurementsCreated,
      'bundling stores more values than it sends messages -- that is the whole idea',
    );
  });

  test('throughput sanity check', () => {
    const january = monthOf(result, 1);
    assert.equal(Math.round(january.avgMessagesPerSec), 17);
    assert.equal(Math.round(january.peakMessagesPerSec), 51, 'peakFactor 3');
  });

  test('a clean model produces no errors or warnings', () => {
    const blocking = result.findings.filter((f) => f.severity !== 'suggestion');
    assert.deepEqual(blocking, [], JSON.stringify(blocking, null, 2));
  });
});

describe('the counting rules', () => {
  test('a bundle costs one message however many series it carries', () => {
    const base = presetByKey('hvac')!;
    const one = computeMachineTypeMonth(base, 1, 31);

    // Move every climate reading into its own measurement.
    const split: MachineType = {
      ...base,
      metrics: base.metrics.map((m) => (m.kind === 'continuous' ? { ...m, bundleId: null } : m)),
      bundles: base.bundles.map((b) => ({ ...b, metricIds: [] })),
    };
    const four = computeMachineTypeMonth(split, 1, 31);

    assert.equal(four.counters.measurementsCreated - three(one), 3 * 44_640);
    assert.equal(one.storedValues, four.storedValues, 'identical information either way');

    function three(r: typeof one) {
      return r.counters.measurementsCreated;
    }
  });

  test('a condition costs two messages: the raise creates, the clear updates', () => {
    const mt: MachineType = {
      id: 'mt', name: 'x', machineCount: 10, onlinePct: 100, bundles: [],
      metrics: [{
        id: 'm', name: 'Fault', unit: '', kind: 'condition',
        cadence: { mode: 'onChange', perDay: 2 }, semanticGroup: 'fault', bundleId: null,
      }],
    };
    const r = computeMachineTypeMonth(mt, 10, 30);
    assert.equal(r.counters.alarmsCreated, 600);
    assert.equal(r.counters.alarmsUpdated, 600);
    assert.equal(r.total, 1_200);
  });

  test('a command costs one create plus one update per transition', () => {
    const mt: MachineType = {
      id: 'mt', name: 'x', machineCount: 100, onlinePct: 100, bundles: [],
      metrics: [{
        id: 'm', name: 'Firmware update', unit: '', kind: 'command',
        cadence: { mode: 'command', perMonth: 1, transitions: 3 }, semanticGroup: 'control', bundleId: null,
      }],
    };
    const r = computeMachineTypeMonth(mt, 100, 31);
    assert.equal(r.counters.operationsCreated, 100);
    assert.equal(r.counters.operationsUpdated, 300);
    assert.equal(r.total, 400, 'one command is four messages, not one');
  });

  test('online percentage scales traffic but not registration', () => {
    const scenario: Scenario = {
      ...blankScenario(),
      settings: { peakFactor: 2, startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
      machineTypes: [{ ...presetByKey('hvac')!, machineCount: 1000, onlinePct: 50 }],
    };
    const january = monthOf(computeScenario(scenario), 1);
    assert.equal(january.counters.measurementsCreated, (44_640_000 + 1_240_000) / 2);
    assert.equal(january.counters.inventoriesCreated, 1_000, 'all 1,000 still had to be registered');
  });

  test('every counter is summed independently', () => {
    const january = monthOf(computeScenario(conceptSection9Scenario()), 1);
    assert.equal(totalOf(january.counters), january.total);
    assert.equal(COUNTER_KEYS.length, 9);
  });
});

describe('registration is a one-off, not a rate', () => {
  test('a ramp registers only the machines each period adds', () => {
    const hvac = presetByKey('hvac')!;
    const scenario: Scenario = {
      ...blankScenario(),
      settings: { peakFactor: 2, startYear: 2027, startMonth: 1, fragmentPrefix: 'acme' },
      periods: [
        { index: 1, months: 12, machineCountOverrides: { [hvac.id]: 1_000 }, commercial: {} },
        { index: 2, months: 12, machineCountOverrides: { [hvac.id]: 4_000 }, commercial: {} },
        { index: 3, months: 12, machineCountOverrides: { [hvac.id]: 4_000 }, commercial: {} },
      ],
      machineTypes: [hvac],
    };
    const onboarding = onboardingByPeriod(scenario);
    assert.equal(onboarding.get(1), 1_000);
    assert.equal(onboarding.get(2), 3_000, 'the 3,000 added, not the 4,000 present');
    assert.equal(onboarding.get(3), 0, 'a flat period registers nobody');

    const result = computeScenario(scenario);
    const withCreates = result.months.filter((m) => m.onboardingCreates > 0);
    assert.equal(withCreates.length, 2, 'two spikes, in the first month of periods 1 and 2');
  });

  test('a shrinking fleet does not register negative machines', () => {
    const hvac = presetByKey('hvac')!;
    const onboarding = onboardingByPeriod({
      ...blankScenario(),
      periods: [
        { index: 1, months: 6, machineCountOverrides: { [hvac.id]: 900 }, commercial: {} },
        { index: 2, months: 6, machineCountOverrides: { [hvac.id]: 100 }, commercial: {} },
      ],
      machineTypes: [hvac],
    });
    assert.equal(onboarding.get(2), 0);
  });
});

describe('lint rules', () => {
  function withMetrics(metrics: MachineType['metrics'], bundles: MachineType['bundles'] = []): Scenario {
    return {
      ...blankScenario(),
      machineTypes: [{ id: 'mt', name: 'Type A', machineCount: 100, onlinePct: 100, metrics, bundles }],
    };
  }

  test('L1 spots siblings that share an interval and semantics but not a measurement', () => {
    const findings = lintScenario(
      withMetrics([
        { id: 'a', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: null },
        { id: 'b', name: 'Humidity', unit: '%', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: null },
      ]),
    );
    const l1 = must(findings.find((f) => f.rule === 'L1'), 'expected L1');
    assert.equal(l1.severity, 'suggestion');
    assert.equal(l1.messageDelta, -44_640 * 100, 'the saving is one send per interval per machine');
  });

  test('L1 stays quiet once they are bundled', () => {
    const findings = lintScenario(
      withMetrics(
        [
          { id: 'a', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
          { id: 'b', name: 'Humidity', unit: '%', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
        ],
        [{ id: 'bun', fragmentName: 'acme_Climate', intervalSeconds: 60, metricIds: ['a', 'b'] }],
      ),
    );
    assert.equal(findings.filter((f) => f.rule === 'L1').length, 0);
  });

  test('L3 is an error, and L2 quantifies the same mistake', () => {
    const findings = lintScenario(
      withMetrics(
        [
          { id: 'a', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
          { id: 'f', name: 'Compressor on/off', unit: '', kind: 'state', cadence: { mode: 'onChange', perDay: 20 }, semanticGroup: 'status', bundleId: 'bun' },
        ],
        [{ id: 'bun', fragmentName: 'acme_Climate', intervalSeconds: 60, metricIds: ['a', 'f'] }],
      ),
    );
    const l3 = must(findings.find((f) => f.rule === 'L3'), 'expected L3');
    assert.equal(l3.severity, 'error');
    assert.equal(findings[0]!.rule, 'L3', 'errors sort first');

    const l2 = must(
      findings.find((f) => f.rule === 'L2'),
      'a flag changing 20x a day sampled every 60 s is 72x too fast',
    );
    assert.ok(l2.messageDelta! < 0);
  });

  test('L4 fires below one second', () => {
    const findings = lintScenario(
      withMetrics(
        [{ id: 'a', name: 'Vibration', unit: 'mm/s', kind: 'continuous', cadence: { mode: 'interval', seconds: 0.1 }, semanticGroup: 'process', bundleId: 'bun' }],
        [{ id: 'bun', fragmentName: 'acme_Fast', intervalSeconds: 0.1, metricIds: ['a'] }],
      ),
    );
    assert.ok(findings.some((f) => f.rule === 'L4'));
  });

  test('L6 fires past 100 series', () => {
    const metrics = Array.from({ length: 101 }, (_, i) => ({
      id: `m${i}`, name: `Reading ${i}`, unit: 'C', kind: 'continuous' as const,
      cadence: { mode: 'interval' as const, seconds: 60 }, semanticGroup: 'process', bundleId: 'bun',
    }));
    const findings = lintScenario(
      withMetrics(metrics, [{ id: 'bun', fragmentName: 'acme_Wide', intervalSeconds: 60, metricIds: metrics.map((m) => m.id) }]),
    );
    must(
      findings.find((f) => f.rule === 'L6' && f.title.includes('101 series')),
      'the platform recommendation is 100',
    );
  });

  test('L6 ignores mixed units but flags mixed semantics', () => {
    const quiet = lintScenario(
      withMetrics(
        [
          { id: 'a', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
          { id: 'b', name: 'CO2', unit: 'ppm', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
        ],
        [{ id: 'bun', fragmentName: 'acme_Climate', intervalSeconds: 60, metricIds: ['a', 'b'] }],
      ),
    );
    assert.equal(quiet.filter((f) => f.rule === 'L6').length, 0, 'four units off one sensor board is fine');

    const noisy = lintScenario(
      withMetrics(
        [
          { id: 'a', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bun' },
          { id: 'b', name: 'CPU load', unit: '%', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'gateway health', bundleId: 'bun' },
        ],
        [{ id: 'bun', fragmentName: 'acme_Mixed', intervalSeconds: 60, metricIds: ['a', 'b'] }],
      ),
    );
    assert.equal(noisy.filter((f) => f.rule === 'L6').length, 1);
  });

  test('L7 is an error when one fragment name means two series sets', () => {
    const base = blankScenario();
    const findings = lintScenario({
      ...base,
      machineTypes: [
        {
          id: 'a', name: 'Type A', machineCount: 10, onlinePct: 100,
          metrics: [{ id: 'a1', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'ba' }],
          bundles: [{ id: 'ba', fragmentName: 'acme_Climate', intervalSeconds: 60, metricIds: ['a1'] }],
        },
        {
          id: 'b', name: 'Type B', machineCount: 10, onlinePct: 100,
          metrics: [
            { id: 'b1', name: 'Temp', unit: 'C', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bb' },
            { id: 'b2', name: 'CO2', unit: 'ppm', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'climate', bundleId: 'bb' },
          ],
          bundles: [{ id: 'bb', fragmentName: 'acme_Climate', intervalSeconds: 60, metricIds: ['b1', 'b2'] }],
        },
      ],
    });
    const l7 = must(findings.find((f) => f.rule === 'L7'), 'expected L7');
    assert.equal(l7.severity, 'error');
  });

  test('L5 and L10 catch inventory misuse', () => {
    const findings = lintScenario(
      withMetrics([
        { id: 'a', name: 'Runtime hours', unit: 'h', kind: 'inventory', cadence: { mode: 'onChange', perDay: 2000 }, semanticGroup: 'identity', bundleId: null },
        { id: 'b', name: 'Config block', unit: '', kind: 'inventory', cadence: { mode: 'onChange', perDay: 1 }, semanticGroup: 'identity', bundleId: null, resentOnTimer: true },
      ]),
    );
    assert.ok(findings.some((f) => f.rule === 'L5'), '2,000 a day is more than one a minute');
    const l10 = must(findings.find((f) => f.rule === 'L10'), 'expected L10');
    assert.equal(l10.messageDelta, -(100 * 31));
  });

  test('L8 spots an alarm being used as an event', () => {
    const findings = lintScenario(
      withMetrics([
        { id: 'a', name: 'Threshold exceeded', unit: '', kind: 'condition', cadence: { mode: 'onChange', perDay: 96 }, semanticGroup: 'fault', bundleId: null },
      ]),
    );
    assert.ok(findings.some((f) => f.rule === 'L8'));
  });

  test('L9 catches unmodelled and excessive transitions', () => {
    const findings = lintScenario(
      withMetrics([
        { id: 'a', name: 'Reboot', unit: '', kind: 'command', cadence: { mode: 'command', perMonth: 4, transitions: 0 }, semanticGroup: 'control', bundleId: null },
        { id: 'b', name: 'Progress polling', unit: '', kind: 'command', cadence: { mode: 'command', perMonth: 4, transitions: 20 }, semanticGroup: 'control', bundleId: null },
      ]),
    );
    const l9 = findings.filter((f) => f.rule === 'L9');
    assert.equal(l9.length, 2);
    assert.equal(
      must(l9.find((f) => f.title.includes('no status transitions')), 'expected the unmodelled case')
        .messageDelta,
      100 * 4 * 3,
    );
  });
});

describe('payloads', () => {
  test('a bundle renders one measurement carrying every series', () => {
    const hvac = presetByKey('hvac')!;
    const bundle = must(
      payloadsFor(hvac, 'acme').find((p) => p.name === 'acme_Climate'),
      'expected an acme_Climate payload',
    );
    assert.equal(bundle.seriesCount, 4);
    const body = JSON.parse(bundle.restBody);
    assert.deepEqual(Object.keys(body.acme_Climate), ['supplyAirTemp', 'humidity', 'co2', 'pressure']);
    assert.equal(body.type, 'acme_Climate');
    assert.ok(body.time, 'one timestamp for all four series');
    assert.equal(bundle.mqttTopic, 'measurement/measurements/create');
  });

  test('every metric that is not a bundled reading gets its own example', () => {
    const examples = payloadsFor(presetByKey('hvac')!, 'acme');
    assert.ok(examples.some((p) => p.restPath.startsWith('POST /event/events')));
    assert.ok(examples.some((p) => p.restPath.startsWith('POST /alarm/alarms')));
    assert.ok(examples.some((p) => p.restPath.startsWith('PUT /inventory/managedObjects')));
  });

  test('series names come out as sane identifiers', () => {
    assert.equal(seriesNameOf('Supply air temp'), 'supplyAirTemp');
    assert.equal(seriesNameOf('CO2'), 'co2');
    assert.equal(seriesNameOf('Active energy import'), 'activeEnergyImport');
    assert.equal(seriesNameOf('  '), 'value');
  });
});

describe('bundle membership', () => {
  test('metric.bundleId wins when the two fields disagree', () => {
    const mt: MachineType = {
      id: 'mt', name: 'x', machineCount: 1, onlinePct: 100,
      bundles: [{ id: 'bun', fragmentName: 'acme_X', intervalSeconds: 60, metricIds: ['a', 'ghost'] }],
      metrics: [
        { id: 'a', name: 'A', unit: '', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'g', bundleId: 'bun' },
        { id: 'b', name: 'B', unit: '', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'g', bundleId: 'bun' },
        { id: 'c', name: 'C', unit: '', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'g', bundleId: null },
      ],
    };
    const { bundles, loneContinuous } = resolveBundles(mt);
    assert.deepEqual(bundles[0]!.members.map((m) => m.id), ['a', 'b'], 'ghost dropped, b picked up');
    assert.deepEqual(loneContinuous.map((m) => m.id), ['c']);
  });

  test('a metric pointing at a bundle that does not exist keeps its own measurement', () => {
    const r = computeMachineTypeMonth(
      {
        id: 'mt', name: 'x', machineCount: 1, onlinePct: 100, bundles: [],
        metrics: [{ id: 'a', name: 'A', unit: '', kind: 'continuous', cadence: { mode: 'interval', seconds: 60 }, semanticGroup: 'g', bundleId: 'missing' }],
      },
      1,
      31,
    );
    assert.equal(r.counters.measurementsCreated, 44_640);
  });
});

describe('an empty scenario does not throw', () => {
  test('no machine types', () => {
    const result = computeScenario(blankScenario());
    assert.equal(result.months.length, 12);
    assert.equal(result.peakMonth.total, 0);
    assert.deepEqual(result.findings, []);
  });
});

describe('fragment and type names', () => {
  test('nothing is emitted into the reserved c8y_ namespace', () => {
    for (const key of ['hvac', 'meter', 'tracker', 'gateway', 'machine']) {
      for (const example of payloadsFor(presetByKey(key)!, 'acme')) {
        assert.doesNotMatch(
          example.name,
          /^c8y_/,
          `${key}: ${example.name} writes into Cumulocity's own namespace`,
        );
        assert.doesNotMatch(example.restBody, /"c8y_/, `${key}: ${example.name} body`);
      }
    }
  });

  test('generated names use the scenario prefix and PascalCase after it', () => {
    const hvac = presetByKey('hvac')!;
    const named = new Set(hvac.bundles.map((b) => b.fragmentName));
    for (const example of payloadsFor(hvac, 'customer')) {
      if (named.has(example.name)) continue; // a name the customer typed
      assert.match(example.name, /^customer_[A-Z]/, example.name);
    }
  });

  test('a fragment name the customer typed is never rewritten', () => {
    // Changing the prefix must not rename a bundle somebody already named --
    // that name is in their firmware.
    const hvac = presetByKey('hvac')!;
    const names = payloadsFor(hvac, 'somethingElse').map((e) => e.name);
    assert.ok(names.includes('acme_Climate'), names.join(', '));
  });

  test('the six HVAC names span four namespaces, not six fragments', () => {
    const examples = payloadsFor(presetByKey('hvac')!, 'acme');
    const byNamespace = new Map<string, number>();
    for (const e of examples) byNamespace.set(e.namespace, (byNamespace.get(e.namespace) ?? 0) + 1);

    assert.equal(byNamespace.get('measurement fragment'), 3, 'one bundle plus two states');
    assert.equal(byNamespace.get('event type'), 1);
    assert.equal(byNamespace.get('alarm type'), 1);
    assert.equal(byNamespace.get('inventory fragment'), 1);
  });

  test('a bundle is the only name that carries more than one series', () => {
    const examples = payloadsFor(presetByKey('hvac')!, 'acme');
    const wide = examples.filter((e) => e.seriesCount > 1);
    assert.equal(wide.length, 1);
    assert.equal(wide[0]?.name, 'acme_Climate');
  });
});

describe('lib/ imports nothing but itself', () => {
  // CONCEPT.md section 8 rests on this: the engine is meant to move to an
  // Angular + @c8y/ngx-components app unchanged, and only src/ui gets rewritten.
  // That is only true for as long as nothing framework-shaped leaks in, which is
  // a one-line mistake to make and invisible until the port. So it is checked.
  // The suite runs compiled, out of dist-test/, so the repo root is found by
  // walking up rather than assumed to be one level above this file.
  const root = (() => {
    let at = dirname(fileURLToPath(import.meta.url));
    for (let up = 0; up < 6; up += 1) {
      if (existsSync(join(at, 'package.json')) && existsSync(join(at, 'lib', 'engine'))) return at;
      at = dirname(at);
    }
    throw new Error('cannot find the repository root from ' + import.meta.url);
  })();
  const dir = join(root, 'lib');

  const sources = (function walk(at: string): string[] {
    return readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(at, entry.name))
        : entry.name.endsWith('.ts')
          ? [join(at, entry.name)]
          : [],
    );
  })(dir);

  test('there is something to check', () => {
    assert.ok(sources.length >= 10, `found ${sources.length} sources under lib/`);
  });

  test('every import is a relative path inside lib/', () => {
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      // Both `import ... from 'x'` and bare `import 'x'`, plus dynamic import('x').
      const specifiers = [...body.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*'([^']+)'/g)]
        .concat([...body.matchAll(/(?:^|\n)\s*import\s*'([^']+)'/g)])
        .concat([...body.matchAll(/\bimport\(\s*'([^']+)'/g)])
        .map((m) => m[1]!);
      for (const specifier of specifiers) {
        assert.ok(
          specifier.startsWith('./') || specifier.startsWith('../'),
          `${relative(root, file)} imports "${specifier}" -- lib/ may only import itself`,
        );
        const target = resolve(dirname(file), specifier);
        assert.ok(
          target.startsWith(dir),
          `${relative(root, file)} imports "${specifier}", which is outside lib/`,
        );
      }
    }
  });

  test('nothing reaches for a DOM, a framework or a runtime', () => {
    // The engine has to run in Node for the tests, in a preact app today and in
    // an Angular app later, so it can assume none of them.
    const banned: Array<[RegExp, string]> = [
      // The dot has to touch a property name. "the retention window. So ..." in
      // a comment is prose, and a guard that flags English gets worked around
      // rather than obeyed; a property access never has a space before its name.
      [/\bdocument\.[A-Za-z_$]/, 'document'],
      [/\bwindow\.[A-Za-z_$]/, 'window'],
      [/\blocalStorage\b/, 'localStorage'],
      [/\bnavigator\.[A-Za-z_$]/, 'navigator'],
      [/\bfetch\s*\(/, 'fetch'],
      [/\bBlob\s*\(/, 'Blob'],
      [/\bprocess\.[A-Za-z_$]/, 'process'],
      [/@angular\//, '@angular'],
      [/@c8y\//, '@c8y'],
      [/\bpreact\b/, 'preact'],
    ];
    for (const file of sources) {
      const body = readFileSync(file, 'utf8');
      for (const [pattern, name] of banned) {
        assert.doesNotMatch(body, pattern, `${relative(root, file)} references ${name}`);
      }
    }
  });
})

describe('operational storage', () => {
  const flat = (): Scenario => {
    const s = conceptSection9Scenario();
    // One period, so every month writes the same amount and the arithmetic is
    // checkable by hand.
    return { ...s, periods: [{ ...s.periods[0]!, months: 6 }] };
  };

  test('the quantity is what is on disk, not what the month wrote', () => {
    const result = computeScenario(flat());
    const first = result.storage[0]!;
    const month = result.months[0]!;
    // 30 days kept out of a 31-day month: a month's worth of writes, less a day.
    assert.equal(first.retentionDays, 30);
    assert.equal(first.daysCovered, 30);
    assert.ok(
      Math.abs(first.retained - (month.storedValues / month.days) * 30) < 1,
      `${first.retained} vs ${month.storedValues}`,
    );
    assert.ok(first.retained < first.written, 'less than the month wrote, because a day fell out');
  });

  test('GiB is the values on disk at 100 and at 400 bytes, and nothing in between', () => {
    const peak = computeScenario(flat()).peakStorage!;
    assert.equal(peak.lowGiB, (peak.retained * BYTES_PER_VALUE_LOW) / BYTES_PER_GIB);
    assert.equal(peak.highGiB, (peak.retained * BYTES_PER_VALUE_HIGH) / BYTES_PER_GIB);
    assert.equal(peak.highGiB / peak.lowGiB, 4, 'the spread in the source, carried through');
    // DataHub extracts are a fifth to a quarter of it.
    assert.equal(peak.dataHubLowGiB, peak.lowGiB * DATAHUB_SHARE_LOW);
    assert.equal(peak.dataHubHighGiB, peak.highGiB * DATAHUB_SHARE_HIGH);
  });

  test('retention scales it, and the message count does not move', () => {
    const base = flat();
    const long = { ...base, settings: { ...base.settings, retentionDays: 90 } };
    const short = computeScenario(base);
    const kept = computeScenario(long);

    assert.equal(kept.peakMonth.total, short.peakMonth.total, 'retention is not traffic');
    assert.ok(
      Math.abs(kept.peakStorage!.retained / short.peakStorage!.retained - 3) < 0.02,
      'three times the days, three times the disk',
    );
  });

  test('a fleet that has only just started has less history than its retention allows', () => {
    const s = flat();
    const long = { ...s, settings: { ...s.settings, retentionDays: 90 } };
    const storage = computeScenario(long).storage;
    assert.ok(storage[0]!.daysCovered < 90, 'one month in, there is one month of data');
    assert.equal(storage[0]!.daysCovered, computeScenario(long).months[0]!.days);
    assert.equal(storage[3]!.daysCovered, 90, 'and by month four the period is full');
    assert.ok(storage[3]!.retained > storage[0]!.retained * 2.5);
  });

  test('storage keeps climbing after the messages have levelled off', () => {
    const s = conceptSection9Scenario();
    const growing: Scenario = {
      ...s,
      // Four times the fleet from month 4, and a period kept long enough that
      // the old, smaller months are still on disk when the new rate starts.
      settings: { ...s.settings, retentionDays: 90 },
      periods: [
        { ...s.periods[0]!, months: 3 },
        {
          ...s.periods[0]!,
          index: 2,
          months: 4,
          machineCountOverrides: Object.fromEntries(
            s.machineTypes.map((mt) => [mt.id, mt.machineCount * 4]),
          ),
        },
      ],
    };
    const result = computeScenario(growing);

    // Messages step once and then hold: month 4 already sends what month 6 does,
    // give or take the registrations that land in the first month of a period.
    const settled = result.months[5]!.total / result.months[3]!.total;
    assert.ok(Math.abs(settled - 1) < 0.01, `messages moved by ${(settled - 1) * 100} %`);
    // Storage does not, because month 4 still had two thin months behind it.
    // This is the whole reason the retention period is walked back rather than
    // multiplied out, and getting it wrong over-states period 1 by 4x here.
    assert.ok(
      result.storage[5]!.retained > result.storage[3]!.retained * 1.5,
      `${result.storage[3]!.retained} -> ${result.storage[5]!.retained}`,
    );
    const peak = result.peakStorage!;
    const last = result.storage[result.storage.length - 1]!;
    assert.equal(peak.retained, last.retained, 'the fullest month is the last one');
  });

  test('bundling is visible in the storage figure, not just the message count', () => {
    const result = computeScenario(flat());
    const peak = result.peakStorage!;
    // The four climate readings travel together, so a measurement carries about
    // four values -- the ratio that decides where in the range the truth sits.
    assert.ok(peak.valuesPerMeasurement > 3.5, `${peak.valuesPerMeasurement}`);
    assert.ok(peak.valuesPerMeasurement < 4, 'the two flags travel alone and pull it under four');
    // And measurements are what this fleet writes, which is what makes
    // "measurements only" a fair simplification here.
    assert.ok(peak.nonMeasurementShare < 0.01, `${peak.nonMeasurementShare}`);
  });

  test('nothing to store, nothing to report', () => {
    const empty = blankScenario();
    const result = computeScenario(empty);
    assert.equal(result.storage.length, result.months.length);
    for (const month of result.storage) {
      assert.equal(month.retained, 0);
      assert.equal(month.lowGiB, 0);
      assert.equal(month.valuesPerMeasurement, 0);
    }
  });
});
