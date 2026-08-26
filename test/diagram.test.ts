/**
 * The measurement view and the diagram's layout.
 *
 * Real configurations produce shapes the worked example never does: a hundred
 * series in one bundle, nothing configured at all, a machine that only has
 * flags. Each of those has to draw.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { measurementView, type MachineType } from '../lib/engine/index.js';
import { blankMachineType, presetByKey } from '../lib/presets/index.js';
import { DG, boxFor, canvasHeight, rowCentre, rowSpans } from '../src/ui/MeasurementDiagram.js';

describe('the view model', () => {
  test('the HVAC unit is one shared bundle and two flags travelling alone', () => {
    const view = measurementView(presetByKey('hvac')!, 'acme');
    assert.equal(view.groups.length, 3);

    const [bundle, ...solo] = view.groups;
    assert.equal(bundle?.fragmentName, 'acme_Climate');
    assert.equal(bundle?.shared, true);
    assert.equal(bundle?.timed, true);
    assert.equal(bundle?.seriesCount, 4);
    assert.equal(bundle?.cadence, 'every 1 min');
    assert.equal(bundle?.messagesPerMonth, 44_640);

    for (const group of solo) {
      assert.equal(group.shared, false, `${group.fragmentName} should be alone`);
      assert.equal(group.timed, false, 'flags are sent on change');
      assert.equal(group.cadence, 'on change');
      assert.equal(group.messagesPerMonth, 620);
    }
  });

  test('shared bundles come first, fastest to slowest, then the loners', () => {
    const view = measurementView(presetByKey('gateway')!, 'acme');
    const timed = view.groups.filter((g) => g.timed);
    assert.deepEqual(
      timed.map((g) => g.cadence),
      ['every 1 min', 'every 5 min'],
    );
    // On-change groups sort last, so connectors never cross.
    assert.equal(view.groups[view.groups.length - 1]?.timed, false);
  });

  test('totals agree with the counters, and readings do not depend on grouping', () => {
    const hvac = presetByKey('hvac')!;
    const bundled = measurementView(hvac, 'acme');

    const split: MachineType = {
      ...hvac,
      metrics: hvac.metrics.map((m) => (m.kind === 'continuous' ? { ...m, bundleId: null } : m)),
      bundles: [],
    };
    const apart = measurementView(split, 'acme');

    assert.equal(bundled.messagesPerMonth, 44_640 + 620 * 2);
    assert.equal(apart.messagesPerMonth, 44_640 * 4 + 620 * 2);
    assert.equal(
      bundled.storedPerMonth,
      apart.storedPerMonth,
      'the same readings either way -- that is the whole argument',
    );
  });

  test('the naive baseline samples flags on the fastest tick in use', () => {
    const view = measurementView(presetByKey('hvac')!, 'acme');
    // Four readings and two flags, all at 60 s: 6 x 44,640.
    assert.equal(view.naiveMessagesPerMonth, 44_640 * 6);
    assert.ok(view.naiveMessagesPerMonth > view.messagesPerMonth);
  });

  test('an unnamed reading still gets a row', () => {
    const mt: MachineType = {
      ...blankMachineType('Rig'),
      bundles: [{ id: 'b', fragmentName: 'acme_X', intervalSeconds: 60, metricIds: ['m'] }],
      metrics: [
        {
          id: 'm', name: '', unit: '', kind: 'continuous',
          cadence: { mode: 'interval', seconds: 60 }, semanticGroup: '', bundleId: 'b',
        },
      ],
    };
    const view = measurementView(mt, 'acme');
    assert.equal(view.groups.length, 1);
    assert.equal(view.groups[0]?.members.length, 1);
  });

  test('a machine with nothing measurable draws nothing', () => {
    const view = measurementView(blankMachineType('Empty'), 'acme');
    assert.deepEqual(view.groups, []);
    assert.equal(view.rowCount, 0);
    assert.equal(view.messagesPerMonth, 0);
  });

  test('events, alarms, facts and commands are absent -- they have nothing to group', () => {
    const hvac = presetByKey('hvac')!;
    const view = measurementView(hvac, 'acme');
    const drawn = view.groups.flatMap((g) => g.members.map((m) => m.metricId));
    for (const metric of hvac.metrics) {
      const isMeasurement = metric.kind === 'continuous' || metric.kind === 'state';
      assert.equal(
        drawn.includes(metric.id),
        isMeasurement,
        `${metric.name} (${metric.kind}) should ${isMeasurement ? '' : 'not '}be drawn`,
      );
    }
  });
});

describe('a very wide bundle still draws', () => {
  function wide(count: number): MachineType {
    const metrics = Array.from({ length: count }, (_, i) => ({
      id: `m${i}`, name: `Reading ${i}`, unit: 'C', kind: 'continuous' as const,
      cadence: { mode: 'interval' as const, seconds: 60 }, semanticGroup: 'process', bundleId: 'b',
    }));
    return {
      ...blankMachineType('Wide'),
      metrics,
      bundles: [{ id: 'b', fragmentName: 'acme_Wide', intervalSeconds: 60, metricIds: metrics.map((m) => m.id) }],
    };
  }

  test('100 series collapse to a drawable number of rows', () => {
    const view = measurementView(wide(100), 'acme');
    assert.equal(view.groups.length, 1);
    assert.ok(view.rowCount <= 16, `${view.rowCount} rows is too tall to read`);
    assert.equal(view.groups[0]?.seriesCount, 100, 'the count is still the truth');
    assert.equal(
      view.groups[0]!.members.length + view.groups[0]!.hiddenMembers,
      100,
      'nothing is silently dropped',
    );
  });

  test('the message figures ignore the display cap entirely', () => {
    const view = measurementView(wide(100), 'acme');
    assert.equal(view.messagesPerMonth, 44_640, 'one bundle is one message per tick');
    assert.equal(view.storedPerMonth, 44_640 * 100);
    assert.equal(view.naiveMessagesPerMonth, 44_640 * 100);
  });

  test('many separate measurements each keep a row', () => {
    const metrics = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`, name: `Solo ${i}`, unit: '', kind: 'state' as const,
      cadence: { mode: 'onChange' as const, perDay: 1 }, semanticGroup: '', bundleId: null,
    }));
    const view = measurementView({ ...blankMachineType('Flags'), metrics }, 'acme');
    assert.equal(view.groups.length, 20, 'every measurement stays visible');
    assert.equal(view.messagesPerMonth, 20 * 31);
  });
});

describe('the diagram layout', () => {
  test('the two columns leave room for the connectors', () => {
    const labelRight = DG.labelX + DG.labelW;
    assert.ok(DG.boxX - labelRight >= 40, `only ${DG.boxX - labelRight}px for wires`);
    assert.ok(DG.boxX + DG.boxW <= DG.width, 'the envelopes run past the canvas');
  });

  for (const key of ['hvac', 'meter', 'tracker', 'gateway', 'machine']) {
    test(`${key}: every box and row sits inside the canvas`, () => {
      const view = measurementView(presetByKey(key)!, 'acme');
      const height = canvasHeight(view.rowCount);
      let drawn = 0;

      for (const { group, from, to } of rowSpans(view)) {
        const { top, height: h } = boxFor(from, to);
        assert.ok(top >= 0, `${group.fragmentName} top ${top}`);
        assert.ok(top + h <= height, `${group.fragmentName} bottom ${top + h} past ${height}`);
        assert.ok(h >= 20, `${group.fragmentName} is only ${h}px tall`);

        // Whichever box layout applies, nothing may sit on the border.
        if (h < DG.stackMinHeight) {
          const line = top + h / 2;
          assert.ok(line > top + 8 && line < top + h - 8, 'single line not clear of the border');
        } else {
          assert.ok(top + 39 < top + h - 8, 'subtitle past the bottom border');
        }

        for (let i = from; i <= to; i++) {
          assert.ok(rowCentre(i) - 13 >= 0, `row ${i} pill above the canvas`);
          assert.ok(rowCentre(i) + 13 <= height, `row ${i} pill below the canvas`);
        }
        drawn += to - from + 1;
      }

      assert.equal(drawn, view.rowCount, 'the spans cover exactly the drawn rows');
    });
  }

  test('spans are contiguous and never overlap', () => {
    const view = measurementView(presetByKey('gateway')!, 'acme');
    const spans = rowSpans(view);
    for (let i = 1; i < spans.length; i++) {
      assert.equal(spans[i]!.from, spans[i - 1]!.to + 1, 'a gap or an overlap between groups');
    }
  });

  test('an empty view has a canvas that is still valid', () => {
    assert.ok(canvasHeight(0) > 0);
  });
});
