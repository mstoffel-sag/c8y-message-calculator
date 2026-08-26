/**
 * Durations round-trip. If they do not, the sampling column silently rewrites
 * what the customer typed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DURATION_UNITS,
  UNIT_SECONDS,
  formatDuration,
  splitDuration,
  toSeconds,
} from '../lib/engine/duration.js';

describe('splitDuration picks the unit a person would have used', () => {
  const cases: Array<[number, number, string]> = [
    [0.1, 100, 'ms'],
    [0.25, 250, 'ms'],
    [0.5, 500, 'ms'],
    [1, 1, 's'],
    [15, 15, 's'],
    [30, 30, 's'],
    [60, 1, 'min'],
    [90, 90, 's'],       // 1.5 min would be worse
    [120, 2, 'min'],
    [300, 5, 'min'],
    [900, 15, 'min'],
    [3600, 1, 'h'],
    [5400, 90, 'min'],   // 1.5 h would be worse
    [21_600, 6, 'h'],
    [86_400, 1, 'day'],
    [172_800, 2, 'days'],
    [604_800, 1, 'week'],
    [1_209_600, 2, 'weeks'],
  ];

  for (const [seconds, value, unit] of cases) {
    test(`${seconds} s reads as ${value} ${unit}`, () => {
      const split = splitDuration(seconds);
      assert.equal(split.value, value);
      assert.equal(formatDuration(seconds), `${value} ${unit}`);
    });
  }

  test('the largest whole unit wins, never a fraction of a coarser one', () => {
    // 45 minutes divides into minutes but not hours.
    assert.deepEqual(splitDuration(2700), { value: 45, unit: 'min' });
    // 10 days divides into days but not weeks.
    assert.deepEqual(splitDuration(864_000), { value: 10, unit: 'day' });
  });

  test('a value that divides into nothing stays in seconds', () => {
    assert.deepEqual(splitDuration(7), { value: 7, unit: 's' });
    assert.deepEqual(splitDuration(1.5), { value: 1500, unit: 'ms' });
  });

  test('nonsense does not produce nonsense', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(splitDuration(bad), { value: 0, unit: 's' });
    }
  });
});

describe('round-tripping', () => {
  test('split then recompose is the identity', () => {
    const seconds = [
      0.1, 0.5, 1, 2, 5, 7, 10, 15, 30, 45, 60, 90, 120, 300, 900, 1800, 2700,
      3600, 7200, 21_600, 43_200, 86_400, 172_800, 604_800, 1_209_600,
    ];
    for (const s of seconds) {
      const { value, unit } = splitDuration(s);
      assert.ok(Math.abs(toSeconds(value, unit) - s) < 1e-9, `${s} s round-tripped to ${toSeconds(value, unit)}`);
    }
  });

  test('every unit is offered and converts', () => {
    assert.deepEqual(DURATION_UNITS, ['ms', 's', 'min', 'h', 'day', 'week']);
    for (const unit of DURATION_UNITS) {
      assert.ok(UNIT_SECONDS[unit] > 0);
      assert.equal(toSeconds(1, unit), UNIT_SECONDS[unit]);
    }
  });

  test('a float-error interval still reads as whole milliseconds', () => {
    // 0.1 + 0.2 style error is exactly what a 100 ms interval invites.
    assert.deepEqual(splitDuration(0.30000000000000004), { value: 300, unit: 'ms' });
  });
});

describe('one formatter, not two', () => {
  test('the bundle chip and the sampling dropdown agree', async () => {
    const { interval } = await import('../src/ui/format.js');
    for (const seconds of [0.1, 1, 30, 60, 90, 300, 900, 3600, 86_400]) {
      assert.equal(interval(seconds), `every ${formatDuration(seconds)}`);
    }
    // The case the old duplicate got wrong.
    assert.equal(interval(60), 'every 1 min');
  });
});

describe('"how often" as a period', () => {
  test('day-scaled units round-trip exactly', async () => {
    const { cadenceToPeriod, periodToCadence } = await import('../lib/engine/cadence.js');
    const cases: Array<[number, string, number]> = [
      [1, 'day', 1],       // every day -> 1 per day
      [2, 'day', 0.5],
      [4, 'h', 6],         // every 4 hours -> 6 per day
      [1, 'h', 24],
      [30, 'min', 48],
      [1, 'week', 1 / 7],
      [30, 'day', 1 / 30], // "once a month", said honestly
    ];
    for (const [value, unit, perDay] of cases) {
      const cadence = periodToCadence(value, unit as never, { mode: 'onChange', perDay: 1 });
      assert.equal(cadence.mode, 'onChange');
      assert.ok(
        Math.abs((cadence as { perDay: number }).perDay - perDay) < 1e-9,
        `every ${value} ${unit} should be ${perDay}/day, got ${JSON.stringify(cadence)}`,
      );
      const back = cadenceToPeriod(cadence);
      assert.equal(back.value, value, `every ${value} ${unit} read back as ${back.value} ${back.unit}`);
      assert.equal(back.unit, unit);
    }
  });

  test('the unit chooses the rhythm, and no month length is ever invented', async () => {
    const { cadenceToPeriod, periodToCadence } = await import('../lib/engine/cadence.js');
    const existing = { mode: 'onChange' as const, perDay: 1 };

    // Weeks and below are exact multiples of a day, so they scale with month
    // length: 'every 30 days' is 31 events in January and 28 in February.
    const daily = periodToCadence(30, 'day', existing);
    assert.equal(daily.mode, 'onChange');

    // A month is not a fixed number of days, so it maps to the counter that
    // does not scale.
    const monthly = periodToCadence(1, 'month', existing);
    assert.deepEqual(monthly, { mode: 'perMonth', count: 1 });
    assert.deepEqual(cadenceToPeriod(monthly), { value: 1, unit: 'month' });

    const yearly = periodToCadence(1, 'year', existing);
    assert.deepEqual(yearly, { mode: 'perMonth', count: 1 / 12 });
    assert.deepEqual(cadenceToPeriod(yearly), { value: 1, unit: 'year' });

    const biennial = periodToCadence(2, 'year', existing);
    assert.deepEqual(cadenceToPeriod(biennial), { value: 2, unit: 'year' });
  });

  test('a command keeps its transition count through a unit change', async () => {
    const { cadenceToPeriod, periodToCadence } = await import('../lib/engine/cadence.js');
    const monthly = { mode: 'command' as const, perMonth: 1, transitions: 3 };
    assert.deepEqual(cadenceToPeriod(monthly), { value: 1, unit: 'month' });

    // Switching to a day-scaled unit must not lose the transitions.
    const daily = periodToCadence(1, 'day', monthly);
    assert.equal(daily.mode, 'command');
    assert.equal((daily as { transitions: number }).transitions, 3);
    assert.equal((daily as { perDay?: number }).perDay, 1);
    assert.equal((daily as { perMonth?: number }).perMonth, undefined);

    // And back again.
    const again = periodToCadence(2, 'month', daily);
    assert.equal((again as { perMonth?: number }).perMonth, 0.5);
    assert.equal((again as { transitions: number }).transitions, 3);
  });

  test('a frequent monthly rate is why commands needed a day-scaled rhythm', async () => {
    const { cadenceToPeriod, periodToCadence } = await import('../lib/engine/cadence.js');

    // 20 commands a month, quoted monthly, is 'every 0.05 months' -- true, and
    // unreadable. Nothing stops a scenario arriving that way, so it still has
    // to render.
    const monthly = { mode: 'command' as const, perMonth: 20, transitions: 3 };
    assert.deepEqual(cadenceToPeriod(monthly), { value: 0.05, unit: 'month' });

    // Restated day-scaled, it reads as a period a person would say.
    const daily = periodToCadence(1, 'day', monthly);
    assert.deepEqual(cadenceToPeriod(daily), { value: 1, unit: 'day' });
  });

  test('every preset rate reads as a period a person would say', async () => {
    const { cadenceToPeriod } = await import('../lib/engine/cadence.js');
    const { presetByKey } = await import('../lib/presets/index.js');

    for (const key of ['hvac', 'meter', 'tracker', 'gateway', 'machine']) {
      for (const metric of presetByKey(key)!.metrics) {
        if (metric.kind === 'continuous') continue;
        const { value, unit } = cadenceToPeriod(metric.cadence);
        assert.ok(value >= 1, `${key}/${metric.name} reads as "every ${value} ${unit}"`);
      }
    }
  });

  test('a zero or negative rate does not produce an infinite period', async () => {
    const { cadenceToPeriod } = await import('../lib/engine/cadence.js');
    assert.deepEqual(cadenceToPeriod({ mode: 'onChange', perDay: 0 }), { value: 1, unit: 'day' });
    assert.deepEqual(cadenceToPeriod({ mode: 'perMonth', count: 0 }), { value: 1, unit: 'month' });
    assert.deepEqual(
      cadenceToPeriod({ mode: 'command', transitions: 3, perMonth: 0 }),
      { value: 1, unit: 'month' },
    );
  });

  test('per-month equivalents match what the engine will compute', async () => {
    const { perMonthEquivalent, commandsInMonth } = await import('../lib/engine/cadence.js');
    assert.equal(perMonthEquivalent({ mode: 'onChange', perDay: 1 }, 31), 31);
    assert.equal(perMonthEquivalent({ mode: 'onChange', perDay: 1 }, 28), 28);
    assert.equal(perMonthEquivalent({ mode: 'perMonth', count: 4 }, 28), 4, 'does not scale');
    assert.equal(commandsInMonth({ mode: 'command', transitions: 3, perMonth: 1 }, 28), 1);
    assert.equal(commandsInMonth({ mode: 'command', transitions: 3, perDay: 1 }, 28), 28);
  });
});
