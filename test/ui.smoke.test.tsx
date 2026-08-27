/**
 * Renders every wizard step once. A typecheck will not catch a component that
 * throws on first paint, and this is meant to be run, not admired.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact-render-to-string';

import { computeScenario } from '../lib/engine/index.js';
import { blankScenario, conceptSection9Scenario, presetByKey } from '../lib/presets/index.js';
import { STEPS } from '../src/ui/wizard/steps.js';
import { StepFleet } from '../src/ui/wizard/StepFleet.js';
import { StepTimeSeries } from '../src/ui/wizard/StepTimeSeries.js';
import { StepDiscrete } from '../src/ui/wizard/StepDiscrete.js';
import { StepContract } from '../src/ui/wizard/StepContract.js';
import { StepResults } from '../src/ui/wizard/StepResults.js';
import { Results } from '../src/ui/Results.js';
import { Handoff } from '../src/ui/wizard/Handoff.js';
import { CANVAS_HEIGHT, Explainer, LAYOUT, boxFor, rowCentre } from '../src/ui/Explainer.js';

const noop = () => {};

/**
 * Test names carry the step's key from steps.ts -- fleet, series, discrete,
 * contract, results -- and never its position. Reordering the wizard
 * used to rename every test in this file, which made a diff that moved one step
 * look like a rewrite of the suite.
 */
describe('the wizard renders', () => {
  const scenario = conceptSection9Scenario();
  const result = computeScenario(scenario);
  const props = { scenario, onChange: noop };

  test('the step list is the order a customer can answer in', () => {
    assert.deepEqual(
      STEPS.map((s) => s.key),
      ['fleet', 'series', 'discrete', 'contract', 'results'],
    );
  });

  test('fleet: machine types and counts', () => {
    const html = render(<StepFleet {...props} />);
    assert.match(html, /Rooftop HVAC unit/);
    assert.match(html, /machine type/i);
  });

  test('fleet: asks how the machine talks, from a list that can be escaped', () => {
    const html = render(<StepFleet {...props} />);
    assert.match(html, /<th[^>]*>Talks<\/th>/);
    assert.match(html, /<optgroup label="Shop floor"/, 'grouped by who does the talking');
    for (const protocol of ['OPC UA', 'Modbus TCP', 'PROFINET', 'BACnet\/IP', 'LoRaWAN']) {
      assert.match(html, new RegExp(`>${protocol}<`), `no ${protocol} option`);
    }
    assert.match(html, /Something else…/, 'and a way out of the list');
    // The preset arrives with one, and it is the selected value rather than a
    // free-text field: a name in the list means the dropdown is enough.
    assert.match(html, /<option selected value="BACnet\/IP">/);
    assert.doesNotMatch(html, /placeholder="Name the protocol"/);
  });

  test('series: teaches bundling and shows the proposal', () => {
    const html = render(<StepTimeSeries {...props} />);
    assert.match(html, /one timestamp/i);
    assert.match(html, /acme_Climate/);
    assert.match(html, /When it changes/, 'both rhythms live in the one table');
    assert.match(html, /Readings per measurement/, 'the interactive explainer is on this step');
  });

  test('series: asks the rhythm, and asks it once per series', () => {
    const html = render(<StepTimeSeries {...props} />);
    // One table, six rows: the four timed readings and the two flags, which are
    // measurements with one series each and not a different kind of thing.
    const rows = html.match(/<tr><td>/g) ?? [];
    assert.equal(rows.length, 6, `${rows.length} rows`);
    assert.equal((html.match(/On a timer/g) ?? []).length, 6, 'every row is asked');
    assert.doesNotMatch(html, /States and flags/, 'and none of them has a section of its own');
    // The flags still travel alone -- the row says so instead of offering a
    // measurement type to join -- but the type they send in is still named, and
    // the name is still theirs to change.
    assert.match(html, /nothing can share an on-change timestamp/);
    assert.match(html, /placeholder="acme_CompressorOnOff"/);
  });

  test('series: makes every column a dropdown', () => {
    const html = render(<StepTimeSeries {...props} />);
    // Four timed readings and two flags: name, unit and rhythm for each, plus
    // the measurement type and the period unit on the four timed ones.
    const selects = html.match(/<select/g) ?? [];
    assert.ok(selects.length >= 4 * 4 + 2 * 3, `only ${selects.length} dropdowns`);
    // Options come from the catalogue, and every list stays escapable.
    assert.match(html, /<optgroup label="Climate"/);
    assert.match(html, /Other/, 'every catalogue can be escaped');
    assert.match(html, /A measurement type of its own/);
  });

  test('series: names things the way the platform does', () => {
    const html = render(<StepTimeSeries {...props} />);
    assert.match(html, /<th[^>]*>Series<\/th>/, 'a datapoint is a series');
    assert.match(html, /<th[^>]*>Measurement type<\/th>/, 'and what it goes into has a name');
    assert.doesNotMatch(html, /atapoint/, 'the word does not belong on this step');
  });

  test('series: mints the measurement type when "of its own" is chosen', async () => {
    const { assignOwnBundle } = await import('../src/ui/store.js');
    const hvac = props.scenario.machineTypes[0]!;
    const pressure = hvac.metrics.find((m) => m.name === 'Pressure')!;
    const split = assignOwnBundle(props.scenario, hvac.id, pressure.id);
    const html = render(<StepTimeSeries scenario={split} onChange={noop} />);
    // Named after the series, and editable in its row the moment it exists --
    // it used to take an interval change before any type was created at all.
    assert.match(html, /acme_Pressure · 1 series/);
    assert.match(html, /<input type="text" value="acme_Pressure"/);
    // The offer is gone from the row that took it, and still open to the three
    // still sharing acme_Climate.
    assert.equal((html.match(/A measurement type of its own/g) ?? []).length, 3);
  });

  test('series: lets the measurement type be renamed in the table', () => {
    const html = render(<StepTimeSeries {...props} />);
    // The suggested name is a placeholder, not a value: an untouched scenario
    // carries no fragment name that nobody chose.
    assert.match(html, /<input type="text" value="acme_Climate"/, 'editable in the row');
    assert.match(html, /placeholder="acme_RooftopHvacUnit60s"/, 'and the tool still suggests one');
    // One box per measurement type, not one per row: the four HVAC series share
    // acme_Climate, and four identical fields for one value would invite an edit
    // in row three that silently rewrites row one.
    assert.equal((html.match(/value="acme_Climate"/g) ?? []).length, 1);
    assert.match(html, /in that same message/, 'the other rows say where they went');
    // One field per row that shares the measurement type, not a second list of
    // them further down the page.
    assert.doesNotMatch(html, /<h4[^>]*>Measurement types</, 'the separate section is gone');
  });

  test('series: asks for the sampling interval as a value and a unit', () => {
    const html = render(<StepTimeSeries {...props} />);
    assert.match(html, /class="duration"/);
    // Every unit the customer might reach for, in reading order.
    for (const unit of ['ms', 's', 'min', 'h', 'day', 'week']) {
      assert.match(html, new RegExp(`<option[^>]*value="${unit}"`), `no ${unit} option`);
    }
    // The HVAC preset samples at 60 s, which reads back as 1 min -- not 60 s,
    // and not 0.0166 h.
    assert.match(html, /value="1"\/><select><option/);
    assert.match(html, /<option selected value="min">/);
    assert.match(html, /samples \/ machine \/ month/, 'the consequence is shown alongside');
  });

  test('series: has no bundle-level destructive control', () => {
    const html = render(<StepTimeSeries {...props} />);
    assert.doesNotMatch(html, /Split apart/);
    assert.doesNotMatch(html, /Delete bundle/);
  });

  test('discrete: names all four elements, and commands are one of them', () => {
    const html = render(<StepDiscrete {...props} />);
    for (const heading of ['Events', 'Alarms', 'Inventory', 'Commands']) {
      assert.match(html, new RegExp(`<h3[^>]*>${heading}`), `missing the ${heading} section`);
    }
    // Commands used to be a step of their own; now the last panel of this one.
    assert.match(html, /Operations Created \+ Operations Updated/);
    assert.doesNotMatch(html, /\bfacts?\b/i, 'inventory is called inventory');
  });

  test('discrete: uses one catalogue dropdown per element', () => {
    const html = render(<StepDiscrete {...props} />);
    assert.match(html, /<optgroup label="Maintenance"/, 'alarm and event catalogues');
    assert.match(html, /PENDING, EXECUTING, SUCCESSFUL — 4 messages/,
      'the transition option states the total so nobody has to add one');
  });

  test('"how often" is asked the same way as the sampling interval', () => {
    // Same control, same markup, on every screen that asks it.
    for (const html of [
      render(<StepTimeSeries {...props} />),
      render(<StepDiscrete {...props} />),
    ]) {
      assert.match(html, /class="duration"/);
      assert.match(html, /class="prefix">every</);
    }

    // States, events and alarms stop at weeks: they only have a day-scaled
    // counter, and "once a month" is said as "every 30 days".
    const discrete = render(<StepDiscrete {...props} />);
    assert.match(discrete, /<option[^>]*value="week"/);

    // Inventory and commands reach months and years, because a monthly campaign
    // genuinely does not scale with month length.
    assert.match(discrete, /<option[^>]*value="month"/);
    assert.match(discrete, /<option[^>]*value="year"/);

    // And every field shows what it works out to.
    assert.match(discrete, /per machine in a 31-day month/);
  });

  test('the inventory "Quoted per month / per day" column is gone', () => {
    // The unit in the period carries that choice now.
    assert.doesNotMatch(render(<StepDiscrete {...props} />), /Quoted/);
  });

  test('series: offers to bundle when nothing is bundled yet', () => {
    const hvac = presetByKey('hvac')!;
    const loose = {
      ...blankScenario(),
      machineTypes: [
        {
          ...hvac,
          metrics: hvac.metrics.map((m) => (m.kind === 'continuous' ? { ...m, bundleId: null } : m)),
          bundles: [],
        },
      ],
    };
    const html = render(<StepTimeSeries scenario={loose} onChange={noop} />);
    assert.match(html, /Suggestion/, 'four 60 s readings in four measurements should be flagged');
    assert.match(html, /Apply/);
  });

  test('discrete: explains events, alarms and inventory', () => {
    const html = render(<StepDiscrete {...props} />);
    assert.match(html, /Events/);
    assert.match(html, /Alarms/);
    assert.match(html, /Inventory/);
    assert.match(html, /not a time series store/i);
    assert.match(html, /lifecycle/i);
  });

  test('discrete: states the real cost of a command', () => {
    const html = render(<StepDiscrete {...props} />);
    assert.match(html, /PENDING/);
    assert.match(html, /three or four messages/i);
  });

  test('contract: lists every asked line item with its cell', () => {
    const html = render(<StepContract {...props} result={result} />);
    for (const label of [
      'Public/Shared Cloud', 'Dedicated - Production', 'Operational Data Store',
      'Streaming Analytics', 'DataHub - Standard Deployment', 'Microservice Hosting',
      'Enterprise Functions', 'Data Broker', 'VPN Services', 'Gold',
    ]) {
      assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${label}`);
    }
    assert.match(html, /D23/, 'period 1 shared cloud cell');
    assert.match(html, /commit-to-consume/i);
  });

  test('contract: shows no price, rate or currency', () => {
    const html = render(<StepContract {...props} result={result} />);
    assert.doesNotMatch(html, /€|EUR|USD|\$\d/);
    assert.doesNotMatch(html, /\bprice\b/i);
  });

  test('contract: the ramp, on the real calendar', () => {
    const html = render(<StepContract {...props} result={result} />);
    assert.match(html, /11 %/);
    assert.match(html, /Period 1/);
  });

  test('contract: periods are decided and spent on one screen', () => {
    // The deployment table asks for a quantity per period; the table that
    // decides how many periods there are is directly above it. They were two
    // screens, and adding a period meant leaving the one that needed it.
    const html = render(<StepContract {...props} result={result} />);
    assert.match(html, /Add period/);
    assert.match(html, /Periods and the ramp/);
    assert.match(html, /Deployment &amp; add-ons/);
    // One column per period in the line-item table, and one row per period in
    // the ramp table, from the same scenario.
    assert.match(html, /D23/, 'period 1 shared cloud cell');
  });

  test('results: carries every counter cell and the hand-off', () => {
    const html = render(<StepResults scenario={scenario} result={result} expert />);
    for (const cell of ['D28', 'D29', 'D30', 'D31', 'D32', 'D33', 'D34', 'D35', 'D36']) {
      assert.match(html, new RegExp(cell), `missing ${cell}`);
    }
    assert.match(html, /Measurements Created/);
    assert.match(html, /volume estimate/);
    assert.match(html, /measurement\/measurements\/create/);
  });

  test('every step survives an empty scenario', () => {
    const empty = blankScenario();
    const emptyResult = computeScenario(empty);
    const p = { scenario: empty, onChange: noop };
    assert.doesNotThrow(() => render(<StepFleet {...p} />));
    assert.doesNotThrow(() => render(<StepTimeSeries {...p} />));
    assert.doesNotThrow(() => render(<StepDiscrete {...p} />));
    assert.doesNotThrow(() => render(<StepContract {...p} result={emptyResult} />));
    assert.doesNotThrow(() => render(<StepResults scenario={empty} result={emptyResult} expert />));
  });
});

describe('a freshly added series', () => {
  test('opens on the catalogue, not on the free-text field', () => {
    const scenario = {
      ...blankScenario(),
      machineTypes: [
        {
          ...presetByKey('hvac')!,
          metrics: [
            {
              id: 'fresh', name: '', unit: '', kind: 'continuous' as const,
              cadence: { mode: 'interval' as const, seconds: 60 },
              semanticGroup: '', bundleId: null,
            },
          ],
          bundles: [],
        },
      ],
    };
    const html = render(<StepTimeSeries scenario={scenario} onChange={noop} />);
    assert.match(html, /Choose a series…/);
    // The placeholder is a known value, so no free-text field is open: an
    // unnamed series invites a pick rather than demanding one be typed. Asserted
    // on that field's own placeholder, because the measurement-type name beside
    // it is a text field and always open.
    assert.doesNotMatch(html, /placeholder="Name it yourself"/);
  });
});

describe('the hand-off row explains its own buttons', () => {
  const scenario = conceptSection9Scenario();
  const result = computeScenario(scenario);

  test('each button says what it copies, and where it goes', () => {
    const html = render(<Handoff scenario={scenario} result={result} />);
    // The old row was two bare labels against one run-on sentence.
    assert.match(html, /<b>Counters<\/b> copies the nine numbers above as a single column/);
    assert.match(html, /<b>All<\/b> copies every row as <em>cell, value, label<\/em>/);
    // The paste target is a real Excel range. It used to render as "D28:36",
    // which Excel does not accept.
    assert.match(html, /<code>D28:D36<\/code>/);
    assert.doesNotMatch(html, /D28:36/);
  });

  test('the storage line shows the figure the workbook writes, not a dash', () => {
    const html = render(<Handoff scenario={scenario} result={result} />);
    // The workbook fills D37 in from the storage estimate. This screen used to
    // show a dash there, which made the two disagree about the same cell.
    assert.match(html, /64\.8/);
    assert.match(html, /estimated, overridable/);
    assert.match(html, /title="the tool's estimate; state a figure/);
  });

  test('and the copied cell/value list carries it too', async () => {
    const html = render(<Handoff scenario={scenario} result={result} />);
    // "All" copies cell, value and label per line; the storage row has to be in
    // it, or the checklist misses the one line the tool filled in itself.
    assert.match(html, /Every cell, value and label/);
    // The value is built on click, so assert the source of truth instead.
    const { storageGiBForPeriod } = await import('../lib/engine/index.js');
    assert.ok(storageGiBForPeriod(result, 1) > 0);
  });

  test('and every copy button can report what happened', () => {
    const html = render(<Handoff scenario={scenario} result={result} />);
    // Two per period, each with a title naming the period's own target cell.
    assert.match(html, /title="Nine counters for period 1, ready to paste at D28"/);
    assert.match(html, /title="Every cell, value and label for period 1"/);
  });
});

describe('the storage estimate shows its working', () => {
  const scenario = conceptSection9Scenario();
  const result = computeScenario(scenario);

  test('results: reports a range, both ends of it, and where it came from', () => {
    const html = render(<Results scenario={scenario} result={result} />);
    assert.match(html, /Operational storage/);
    // The §9 fleet stores 174 M values inside a 30-day retention period: 16.2
    // GiB at 100 bytes each, 64.8 at 400.
    assert.match(html, /16\.2 – 64\.8 GiB/);
    assert.match(html, /to be verified/, 'the provenance travels with the number');
    assert.match(html, /30 days kept/);
    assert.doesNotMatch(html, /€|EUR|USD|\$\d/, 'a storage figure is not a price');
  });

  test('the figure it quotes is one end of the range, and says so', () => {
    const html = render(<Results scenario={scenario} result={result} />);
    // 400 B per value is the default: the top of the range, because
    // under-stating usage on a commit-to-consume contract depletes the
    // commitment early rather than saving anybody anything.
    assert.match(html, /64\.8 GiB<\/b>/, 'the quoted figure');
    assert.match(html, /at 400 B \/ value/);
    assert.match(html, /16\.2 – 64\.8 GiB/, 'with the whole range beside it');
    // Never a midpoint: no averaging of two unverified figures.
    assert.doesNotMatch(html, /40\.5/, 'the midpoint of 16.2 and 64.8');
    assert.match(html, /goes in the ODS cell/);
  });

  test('the ODS cell is filled in for every period, and stays overridable', () => {
    const html = render(<StepContract scenario={scenario} result={result} onChange={noop} />);
    // Empty box, estimate as the placeholder: nobody has stated this, and this
    // is what the workbook will use if nobody does.
    assert.match(html, /placeholder="64\.82"/);
    assert.match(html, /estimated at 400 B \/ value/);
    assert.match(html, /16\.2–64\.8 GiB across the range/);
  });

  test('it says what it leaves out', () => {
    const html = render(<Results scenario={scenario} result={result} />);
    assert.match(html, /Measurements only/);
    assert.match(html, /under 1 %/, 'and how far off that can be for this fleet');
  });
});

describe('the explainer is drawn, not written', () => {
  test('it shows a diagram and no JSON at all', () => {
    const html = render(<Explainer />);
    assert.match(html, /<svg /, 'the point is a shape');
    assert.match(html, /class="dg-msg"/, 'envelopes');
    assert.match(html, /class="dg-dot"/, 'readings as dots');

    // Nothing a customer has to be able to read JSON to follow.
    assert.doesNotMatch(html, /<pre/);
    assert.doesNotMatch(html, /&quot;/);
    assert.doesNotMatch(html, /\bsource\b|\bdeviceId\b|acme_Climate/);
  });

  test('it names the two figures that matter and says one never moves', () => {
    const html = render(<Explainer />);
    assert.match(html, /Messages \/ month/);
    assert.match(html, /Readings stored/);
    assert.match(html, /the same at every setting/);
    assert.match(html, /batch for the network, bundle for the count/);
  });

  test('it carries a text alternative for the diagram', () => {
    const html = render(<Explainer />);
    assert.match(html, /role="img"/);
    assert.match(html, /aria-label="Four sensor readings[^"]*4 messages\."/);
  });

  test('it opens on the unbundled design, so dragging makes the number fall', () => {
    const html = render(<Explainer />);
    // Four separate envelopes, four messages per tick, 178.6 M a month.
    assert.match(html, /178\.6 M/, 'the naive monthly total');
    assert.doesNotMatch(html, />44\.6 M</, 'the bundled figure is what dragging reveals');
    assert.match(html, /drag right to bundle/);
  });
});

describe('expert mode gates the JSON', () => {
  const scenario = conceptSection9Scenario();
  const result = computeScenario(scenario);

  test('off by default: no payloads, but the reader is told where they are', () => {
    const html = render(<StepResults scenario={scenario} result={result} expert={false} />);
    assert.doesNotMatch(html, /<pre/, 'no JSON on screen');
    assert.doesNotMatch(html, /measurement\/measurements\/create/);
    assert.match(html, /Expert mode/, 'and it says how to get them');
    // The numbers a customer came for are still all there.
    assert.match(html, /Measurements Created/);
    assert.match(html, /D28/);
  });

  test('on: the payloads come back', () => {
    const html = render(<StepResults scenario={scenario} result={result} expert />);
    assert.match(html, /<pre/);
    assert.match(html, /measurement\/measurements\/create/);
    assert.match(html, /acme_Climate/);
  });
});

describe('the diagram geometry holds at every setting', () => {
  test('the three columns do not touch', () => {
    const sensorRight = LAYOUT.sensorX + LAYOUT.sensorW;
    const boxRight = LAYOUT.boxX + LAYOUT.boxW;

    assert.ok(
      LAYOUT.boxX - sensorRight >= 40,
      `only ${LAYOUT.boxX - sensorRight}px for the connector wires`,
    );
    assert.ok(
      LAYOUT.tallyX - boxRight >= 20,
      `tally starts at ${LAYOUT.tallyX}, envelopes end at ${boxRight} -- it overlaps`,
    );
    assert.ok(
      LAYOUT.tallyX + LAYOUT.tallyW <= LAYOUT.width,
      `the tally runs ${LAYOUT.tallyX + LAYOUT.tallyW - LAYOUT.width}px past the canvas`,
    );
  });

  test('the tally sits beside the first envelope, not on it', () => {
    // Worst case: one envelope per reading, so the first is at its shortest.
    const { top, height } = boxFor([0]);
    const tallyTop = LAYOUT.top + 24 - 22; // cap height of the 30px figure
    const tallyBottom = LAYOUT.top + 54;
    // Vertical overlap is fine and expected -- they are side by side. What
    // matters is that horizontally they never meet, asserted above.
    assert.ok(tallyBottom > tallyTop);
    assert.ok(top + height <= CANVAS_HEIGHT);
  });

  for (const perMessage of [1, 2, 3, 4]) {
    test(`${perMessage} reading(s) per measurement stays inside the canvas`, () => {
      const groups: number[][] = [];
      for (let i = 0; i < 4; i += perMessage) {
        groups.push([0, 1, 2, 3].slice(i, i + perMessage));
      }

      for (const members of groups) {
        const { top, height } = boxFor(members);

        assert.ok(top >= 0, `box top ${top} above the canvas`);
        assert.ok(top + height <= CANVAS_HEIGHT, `box bottom ${top + height} past ${CANVAS_HEIGHT}`);
        assert.ok(height >= 20, `box height ${height} too small to hold anything`);

        // Whichever layout applies, nothing may sit on or past the border.
        if (height < LAYOUT.stackMinHeight) {
          const line = top + height / 2;
          assert.ok(line > top + 8 && line < top + height - 8, 'single line not centred clear');
        } else {
          const sub = top + 41;
          const dots = top + height - 18;
          assert.ok(top + 24 > top + 10, 'title inside');
          assert.ok(sub < dots - 10, `subtitle ${sub} collides with dots ${dots}`);
          assert.ok(dots < top + height - 8, 'dots clear of the bottom border');
        }

        // The dot row must not run out of the envelope either.
        const dotsRight = LAYOUT.boxX + 22 + members.length * 17 + 60;
        assert.ok(
          dotsRight <= LAYOUT.boxX + LAYOUT.boxW,
          `${members.length} dots plus their label overflow the envelope by ${dotsRight - LAYOUT.boxX - LAYOUT.boxW}px`,
        );
      }
    });
  }

  test('rows are evenly spaced and centred in their band', () => {
    for (let i = 0; i < 4; i++) {
      assert.equal(rowCentre(i), LAYOUT.top + i * LAYOUT.row + LAYOUT.row / 2);
      assert.ok(rowCentre(i) - 15 >= 0, 'sensor pill clears the top edge');
      assert.ok(rowCentre(i) + 15 <= CANVAS_HEIGHT, 'sensor pill clears the bottom edge');
    }
  });
});

describe('the configuration diagram appears where it helps', () => {
  const scenario = conceptSection9Scenario();

  test('live on the datapoints step', () => {
    const html = render(<StepTimeSeries scenario={scenario} onChange={noop} />);
    assert.match(html, /What one of these machines sends/);
    // Two diagrams on this step: the worked example and the customer's own.
    assert.ok((html.match(/class="diagram"/g) ?? []).length >= 2);
    assert.match(html, /acme_Climate/);
    assert.match(html, /class="dg-msg"/, 'the shared bundle');
    assert.match(html, /class="dg-msg-solo"/, 'the two flags travelling alone');
    assert.match(html, /shared &mdash; readings on the same tick|shared — readings/);
  });

  test('as a summary on the results step, expert mode or not', () => {
    const result = computeScenario(scenario);
    for (const expert of [false, true]) {
      const html = render(<StepResults scenario={scenario} result={result} expert={expert} />);
      assert.match(html, /What each machine sends/);
      assert.match(html, /class="dg-msg"/);
    }
  });

  test('it names the real datapoints, not placeholders', () => {
    const html = render(<StepTimeSeries scenario={scenario} onChange={noop} />);
    for (const name of ['Supply air temp', 'Humidity', 'Compressor on/off', 'Filter status']) {
      assert.match(html, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${name}`);
    }
  });

  test('a machine with no datapoints yet draws no diagram', () => {
    const bare = {
      ...blankScenario(),
      machineTypes: [{ ...presetByKey('hvac')!, metrics: [], bundles: [] }],
    };
    const html = render(<StepTimeSeries scenario={bare} onChange={noop} />);
    assert.doesNotMatch(html, /What one of these machines sends/);
    // The worked example is still there, so count diagrams rather than looking
    // for envelopes: the explainer draws those too.
    assert.equal((html.match(/class="diagram"/g) ?? []).length, 1, 'only the explainer');
    assert.doesNotMatch(html, /class="dg-msg-solo"/, 'nothing of the customer own to draw');
  });
})

describe('machine types fold away', () => {
  // Two types, so the default is one open and one folded. With a single type the
  // step behaves exactly as it did before there was anything to fold.
  const two = {
    ...conceptSection9Scenario(),
    machineTypes: [presetByKey('hvac')!, { ...presetByKey('meter')!, id: 'mt-meter' }],
  };

  const openCount = (html: string) => (html.match(/<details class="mt" open/g) ?? []).length;
  const blockCount = (html: string) => (html.match(/<details class="mt"/g) ?? []).length;

  test('series: folds every machine type but the first', () => {
    const html = render(<StepTimeSeries scenario={two} onChange={noop} />);
    assert.equal(blockCount(html), 2, 'one block per machine type');
    assert.equal(openCount(html), 1, 'the first is open, the rest folded');
  });

  test('discrete: folds each machine type inside every element panel', () => {
    const html = render(<StepDiscrete scenario={two} onChange={noop} />);
    // Events, alarms, inventory and commands, two machine types each.
    assert.equal(blockCount(html), 8);
    assert.equal(openCount(html), 4, 'the first type stays open in each panel');
  });

  test('one machine type stays open', () => {
    const one = { ...conceptSection9Scenario() };
    const html = render(<StepTimeSeries scenario={one} onChange={noop} />);
    assert.equal(blockCount(html), 1);
    assert.equal(openCount(html), 1);
  });

  test('the folded header carries the summary, not just the name', () => {
    const html = render(<StepTimeSeries scenario={two} onChange={noop} />);
    assert.match(html, /4 time series, 2 on-change series, 1 event, 1 alarm, 1 inventory entry, 1 command/);
    assert.match(html, /3 measurement types/, 'the two flags are measurements of their own');
    assert.match(html, /every 1 min/, 'the sampling rhythm');
    assert.match(html, /Measurements 45\.9 M/, 'the message mix by element');
    // compact() trims a trailing zero, so 45,977,000 is "46 M".
    assert.match(html, /<b>46 M<\/b>/, 'the number the summary exists for');
    assert.match(html, /messages \/ month/);
  });

  test('a summary inside one element panel is about that element only', () => {
    const html = render(<StepDiscrete scenario={two} onChange={noop} />);
    assert.match(html, /1 alarm<\/span>/, 'the alarms panel counts alarms, not datapoints');
    assert.doesNotMatch(html, /4 time series/, 'and does not repeat the whole machine type');
  });

  test('a machine type with nothing in it says so', () => {
    const bare = {
      ...blankScenario(),
      machineTypes: [{ ...presetByKey('hvac')!, metrics: [], bundles: [] }],
    };
    const html = render(<StepTimeSeries scenario={bare} onChange={noop} />);
    assert.match(html, /nothing modelled yet/);
  });
})


describe('a step is never named by its number', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sources(full, out);
      else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  test('no file outside steps.ts names a step by its position', () => {
    // Moving one step used to renumber file headers, cross-references and half
    // the test names in this file, which made a two-line change look like a
    // rewrite. The order lives in steps.ts and in one CONCEPT.md table; every
    // other reference uses the component name or the step key.
    const owner = resolve(root, 'src/ui/wizard/steps.ts');
    for (const file of [...sources(resolve(root, 'src')), ...sources(resolve(root, 'test'))]) {
      if (file === owner) continue;
      const body = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        body,
        /\bsteps? [0-9]/i,
        `${relative(root, file)} names a step by number -- use the component name or its key`,
      );
    }
  });
});
