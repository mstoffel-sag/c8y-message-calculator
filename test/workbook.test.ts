/**
 * The downloadable workbook.
 *
 * Two things are worth testing hard here. The bytes have to be a valid archive
 * -- a corrupt .xlsx is a support ticket, not a bug report. And the content has
 * to carry no prices, because the whole reason this file can be mailed to a
 * customer unchecked is that there is nothing confidential in it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeScenario, workbookFileName, workbookSheets } from '../lib/engine/index.js';
import { buildXlsx, colName } from '../lib/xlsx/writer.js';
import { crc32, makeZip, utf8 } from '../lib/xlsx/zip.js';
import { blankScenario, conceptSection9Scenario, presetByKey } from '../lib/presets/index.js';

function sheetsFor(scenario = conceptSection9Scenario()) {
  return workbookSheets(scenario, computeScenario(scenario));
}

/** By name, not position -- adding a sheet should not break every test. */
function sheet(name: string, scenario = conceptSection9Scenario()) {
  const found = sheetsFor(scenario).find((s) => s.name === name);
  if (!found) throw new Error(`no sheet named ${name}`);
  return found;
}

/** Every string and number in the workbook, flattened. */
function allValues(scenario = conceptSection9Scenario()): Array<string | number> {
  return sheetsFor(scenario)
    .flatMap((sheet) => sheet.rows)
    .flatMap((row) => row.cells)
    .map((cell) => cell.value)
    .filter((v): v is string | number => v !== null && v !== '');
}

describe('the zip layer', () => {
  test('crc32 matches the known check value', () => {
    // The standard CRC-32 of "123456789" is 0xCBF43926.
    assert.equal(crc32(utf8('123456789')), 0xcbf43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
  });

  test('an archive is byte-identical for identical input', () => {
    const a = makeZip([{ path: 'a.txt', data: utf8('hello') }]);
    const b = makeZip([{ path: 'a.txt', data: utf8('hello') }]);
    assert.deepEqual(a, b, 'a fixed timestamp is what makes this testable');
  });

  test('the default timestamp is a date that exists', () => {
    // The DOS date field is yyyyyyym mmmddddd, year from 1980. The default is
    // 1 Jan 1980, and it is easy to write byte-swapped -- 0x2100 rather than
    // 0x0021 -- which decodes to day 0 of month 8. Excel and unzip tolerate
    // that; a stricter reader does not have to, and the same archive format is
    // what gets uploaded to a tenant.
    const zip = makeZip([{ path: 'a.txt', data: utf8('hello') }]);
    // Local header: signature(4) version(2) flags(2) method(2) time(2) date(2).
    const date = zip[12]! | (zip[13]! << 8);
    assert.equal(1980 + (date >> 9), 1980, 'year');
    assert.equal((date >> 5) & 0x0f, 1, 'month');
    assert.equal(date & 0x1f, 1, 'day of month');
  });

  test('it carries the end-of-central-directory signature and entry count', () => {
    const zip = makeZip([
      { path: 'a.txt', data: utf8('one') },
      { path: 'b/c.txt', data: utf8('two') },
    ]);
    // Signature 0x06054b50, little-endian, 22 bytes from the end.
    const eocd = zip.length - 22;
    assert.deepEqual([...zip.slice(eocd, eocd + 4)], [0x50, 0x4b, 0x05, 0x06]);
    assert.equal(zip[eocd + 8]! | (zip[eocd + 9]! << 8), 2, 'entry count');
  });
});

describe('the sheet writer', () => {
  test('column names go past Z correctly', () => {
    assert.equal(colName(1), 'A');
    assert.equal(colName(4), 'D');
    assert.equal(colName(26), 'Z');
    assert.equal(colName(27), 'AA');
    assert.equal(colName(52), 'AZ');
    assert.equal(colName(53), 'BA');
  });

  test('it refuses to build a workbook with no sheets', () => {
    assert.throws(() => buildXlsx([]), /at least one sheet/);
  });

  test('a non-finite number becomes an empty cell, not a broken file', () => {
    const bytes = buildXlsx([
      { name: 'S', rows: [{ row: 1, cells: [{ col: 1, value: Number.NaN }, { col: 2, value: 5 }] }] },
    ]);
    const xml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(xml, /NaN|Infinity/);
    assert.match(xml, /<v>5<\/v>/);
  });

  test('text is XML-escaped', () => {
    const bytes = buildXlsx([
      { name: 'S', rows: [{ row: 1, cells: [{ col: 1, value: 'a & b < c > "d"' }] }] },
    ]);
    const xml = new TextDecoder().decode(bytes);
    assert.match(xml, /a &amp; b &lt; c &gt; &quot;d&quot;/);
  });

  test('every row carries a cell in column A', () => {
    // A row whose cells all start at column B or later does not render at all
    // in macOS QuickLook -- the grid appears and the content does not. These
    // sheets keep column A as a spacer so B/C/D line up with the Configurator,
    // so the fix is an empty anchor cell rather than shifting everything left.
    const bytes = buildXlsx([
      {
        name: 'S',
        rows: [
          { row: 1, cells: [{ col: 2, value: 'B one' }] },
          { row: 21, cells: [{ col: 3, value: 'C twenty-one' }, { col: 4, value: 7 }] },
        ],
      },
    ]);
    const xml = new TextDecoder().decode(bytes);
    assert.match(xml, /<row r="1"><c r="A1"\/>/, 'row 1 is not anchored');
    assert.match(xml, /<row r="21"><c r="A21"\/>/, 'row 21 is not anchored');
    // And the dimension starts at A1 for the same reason.
    assert.match(xml, /<dimension ref="A1:/);
  });

  test('a row that already uses column A is left alone', () => {
    const bytes = buildXlsx([
      { name: 'S', rows: [{ row: 1, cells: [{ col: 1, value: 'A one' }, { col: 2, value: 2 }] }] },
    ]);
    const xml = new TextDecoder().decode(bytes);
    // One A1 cell, not two.
    assert.equal((xml.match(/r="A1"/g) ?? []).length, 1);
  });

  test('every real sheet is anchored, on every row', () => {
    const bytes = buildXlsx(sheetsFor());
    const xml = new TextDecoder().decode(bytes);
    for (const [, rowNum, firstRef] of xml.matchAll(/<row r="(\d+)"><c r="([A-Z]+)\d+"/g)) {
      assert.equal(firstRef, 'A', `row ${rowNum} starts at ${firstRef}, not A`);
    }
  });

  test('sheet names are made legal', () => {
    const bytes = buildXlsx([{ name: 'a/b:c[d]'.repeat(8), rows: [] }]);
    const xml = new TextDecoder().decode(bytes);
    const name = /<sheet name="([^"]*)"/.exec(xml)?.[1] ?? '';
    assert.ok(name.length <= 31, `name is ${name.length} characters`);
    for (const ch of [':', '/', '[', ']', '\\', '?', '*']) {
      assert.ok(!name.includes(ch), `${ch} survived`);
    }
  });
});

describe('the workbook content', () => {
  test('five sheets, named for what they hold', () => {
    assert.deepEqual(
      sheetsFor().map((s) => s.name),
      ['Configurator', 'Quote', 'Design', 'Months', 'Guidance'],
    );
  });

  test('the nine counters sit on the rows the Configurator keeps for them', () => {
    const configurator = sheet('Configurator');
    const result = computeScenario(conceptSection9Scenario());
    const peak = result.periods[0]!.peak;

    const valueAt = (r: number) =>
      configurator.rows.find((row) => row.row === r)?.cells.find((c) => c.col === 4)?.value;

    assert.equal(valueAt(28), peak.counters.measurementsCreated, 'D28');
    assert.equal(valueAt(29), peak.counters.eventsCreated, 'D29');
    assert.equal(valueAt(33), peak.counters.inventoriesCreated, 'D33');
    assert.equal(valueAt(36), peak.counters.operationsUpdated, 'D36');
    assert.equal(valueAt(21), 12, 'D21 is the period length in months');

    // D27 holds =SUM(D28:D36) in the Configurator -- the only formula in the
    // column. Writing a value here would mean a pasted column silently
    // replaced it with a constant.
    assert.equal(valueAt(27), '', 'D27 must stay empty so the formula survives');
  });

  test('column D contains no value that would clobber a formula', () => {
    const configurator = sheet('Configurator');
    const formulaRows = [27, 57, 87, 117, 147];
    for (const r of formulaRows) {
      const cell = configurator.rows.find((row) => row.row === r)?.cells.find((c) => c.col === 4);
      assert.ok(
        cell === undefined || cell.value === '' || cell.value === null,
        `D${r} would overwrite the Messages formula`,
      );
    }
    // But the total is still stated, so the paste can be checked.
    const note = configurator.rows
      .find((row) => row.row === 27)
      ?.cells.find((c) => c.col === 7)?.value;
    assert.match(String(note), /45,978,000/);
  });

  test('a second period lands 30 rows lower', () => {
    const base = conceptSection9Scenario();
    const hvac = base.machineTypes[0]!;
    const scenario = {
      ...base,
      periods: [
        { index: 1, months: 12, machineCountOverrides: {}, commercial: {} },
        { index: 2, months: 12, machineCountOverrides: { [hvac.id]: 4000 }, commercial: {} },
      ],
    };
    const configurator = workbookSheets(scenario, computeScenario(scenario))[0]!;
    const valueAt = (r: number) =>
      configurator.rows.find((row) => row.row === r)?.cells.find((c) => c.col === 4)?.value;

    const p1 = valueAt(28);
    const p2 = valueAt(58);
    assert.ok(typeof p1 === 'number' && typeof p2 === 'number');
    assert.ok(p2 > p1, 'period 2 has four times the fleet');
    assert.equal(p2 / p1, 4);
  });

  test('the Months sheet is the evidence for the range', () => {
    const months = sheet('Months');
    // Header rows plus twelve months plus a footnote.
    const totals = months.rows
      .filter((r) => r.row >= 5 && r.row < 17)
      .map((r) => r.cells.find((c) => c.col === 13)?.value)
      .filter((v): v is number => typeof v === 'number');

    assert.equal(totals.length, 12);
    assert.equal(Math.max(...totals), 45_978_000, 'January, including registration');
    assert.equal(Math.min(...totals), 41_528_000, 'February');
  });

  test('the Design sheet carries how each machine talks', () => {
    const design = sheet('Design');
    assert.ok(
      design.rows.some((r) => r.cells.some((c) => c.col === 3 && c.value === 'Talks')),
      'the heading',
    );
    // It follows the machine name exactly: repeated at the head of each
    // measurement block, blank on the rows inside one.
    const cells = design.rows.flatMap((r) => r.cells);
    const named = cells.filter((c) => c.col === 1 && c.value === 'Rooftop HVAC unit').length;
    const talks = cells.filter((c) => c.col === 3 && c.value === 'BACnet/IP').length;
    assert.ok(named > 0);
    assert.equal(talks, named, `named ${named} times, protocol ${talks}`);
  });

  test('the Design sheet says which readings share a measurement', () => {
    const design = sheet('Design');
    const shared = design.rows.filter((r) =>
      r.cells.some((c) => c.value === 'shared'),
    );
    const alone = design.rows.filter((r) => r.cells.some((c) => c.value === 'alone'));
    assert.equal(shared.length, 4, 'the four climate readings');
    assert.ok(alone.length >= 6, 'two flags plus the event, alarm, fact and command');

    // The message cost belongs to the measurement, so it is stated once.
    const costs = design.rows
      .map((r) => r.cells.find((c) => c.col === 10)?.value)
      .filter((v): v is number => typeof v === 'number');
    assert.equal(costs.filter((c) => c === 44_640).length, 1, 'the bundle is counted once, not four times');
  });

  test('rate prose reads naturally', () => {
    const values = allValues().filter((v): v is string => typeof v === 'string');
    assert.ok(values.includes('every 2 days'), 'not "every 2 day"');
    assert.ok(values.includes('every 1 month'));
    assert.ok(values.some((v) => v === 'an alarm (raise + clear)'), 'elements are named, not kinds');
  });

  test('an empty scenario still produces a valid workbook', () => {
    const scenario = blankScenario();
    const sheets = workbookSheets(scenario, computeScenario(scenario));
    assert.equal(sheets.length, 5);
    assert.doesNotThrow(() => buildXlsx(sheets));
  });

  test('the file name is safe on every platform', () => {
    assert.equal(
      workbookFileName({ ...blankScenario(), name: 'ACME GmbH / Q3 "big" plan' }),
      'acme-gmbh-q3-big-plan-messages.xlsx',
    );
    assert.equal(workbookFileName({ ...blankScenario(), name: '' }), 'message-estimate-messages.xlsx');
    assert.equal(workbookFileName({ ...blankScenario(), name: '///' }), 'message-estimate-messages.xlsx');
  });
});

describe('no prices, anywhere', () => {
  test('not a currency symbol, rate or price word in the whole workbook', () => {
    const scenario = { ...conceptSection9Scenario() };
    scenario.machineTypes = [presetByKey('hvac')!, presetByKey('gateway')!];
    scenario.periods = scenario.periods.map((p) => ({
      ...p,
      commercial: { sharedCloud: 1, dedicatedProd: 2, tenants: 5, dataHubStandard: true, ods: 40 },
    }));

    const text = allValues(scenario)
      .filter((v): v is string => typeof v === 'string')
      .join(' | ');

    assert.doesNotMatch(text, /€|EUR|USD|\$\d/);
    assert.doesNotMatch(text, /\bmargin\b/i);
    // "Unit Price" and "Catalog discount" are column headings the salesperson
    // fills in -- the ban is on price and discount *values*, not on the words.
    assert.match(text, /Unit Price/);
    for (const cell of sheetsFor(scenario)
      .flatMap((sheet) => sheet.rows)
      .flatMap((row) => row.cells)) {
      if (cell.style === 'priceInput' || cell.style === 'percentInput') {
        assert.equal(cell.value, null, 'a price or discount shipped with the file');
        assert.equal(cell.formula, undefined, 'a price cell must be typed, not computed');
      }
    }
    // The DataHub uplift percentage is commercial information.
    assert.doesNotMatch(text, /1\.33|33 ?%/);
    // Nor the Configurator's minimum-commitment thresholds.
    assert.doesNotMatch(text, /160,?000|60,?000/);

    // "commitment" appears once, and only to say the workbook does not size one.
    const mentions = text.match(/[^|]*commitment[^|]*/gi) ?? [];
    assert.equal(mentions.length, 1, mentions.join(' // '));
    assert.match(mentions[0]!, /no commitment sizing/);
  });

  test('it says what it is, so nobody mistakes it for a quote', () => {
    const text = allValues()
      .filter((v): v is string => typeof v === 'string')
      .join(' | ');
    assert.match(text, /volume estimate, not a quote/);
  });
});

describe('the bytes are a real archive', () => {
  const unzip = (() => {
    try {
      execFileSync('unzip', ['-v'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  test('unzip -t reports no errors', { skip: unzip ? false : 'unzip not available' }, () => {
    const scenario = conceptSection9Scenario();
    const bytes = buildXlsx(workbookSheets(scenario, computeScenario(scenario)));
    const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
    const file = join(dir, 'out.xlsx');
    writeFileSync(file, bytes);

    const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
    // Every part Excel needs must be present.
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet4.xml',
    ]) {
      assert.match(out, new RegExp(part.replace(/[.[\]/]/g, (c) => `\\${c}`)), `missing ${part}`);
    }
  });

  test('every sheet part is well-formed XML', { skip: unzip ? false : 'unzip not available' }, () => {
    const scenario = conceptSection9Scenario();
    const bytes = buildXlsx(workbookSheets(scenario, computeScenario(scenario)));
    const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
    const file = join(dir, 'out.xlsx');
    writeFileSync(file, bytes);

    for (const part of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
      const xml = execFileSync('unzip', ['-p', file, part], { encoding: 'utf8' });
      // Cheap well-formedness check: tags balance and nothing is left open.
      const opens = (xml.match(/<[a-zA-Z]/g) ?? []).length;
      const closes = (xml.match(/<\/[a-zA-Z]/g) ?? []).length;
      const selfClosing = (xml.match(/\/>/g) ?? []).length;
      assert.equal(opens - selfClosing, closes, `${part} has unbalanced tags`);
      assert.ok(xml.startsWith('<?xml'), `${part} has no declaration`);
    }
  });
});

describe('the Quote sheet', () => {
  const quote = () => sheet('Quote');
  const cell = (r: number, c: number) =>
    quote().rows.find((row) => row.row === r)?.cells.find((x) => x.col === c);

  test('it is the second sheet, after the paste-ready quantities', () => {
    assert.deepEqual(
      sheetsFor().map((s) => s.name),
      ['Configurator', 'Quote', 'Design', 'Months', 'Guidance'],
    );
  });

  test('every price cell ships empty', () => {
    const prices = quote()
      .rows.flatMap((row) => row.cells)
      .filter((c) => c.style === 'priceInput');

    assert.ok(prices.length >= 10, `only ${prices.length} price cells`);
    for (const price of prices) {
      assert.equal(price.value, null, 'a price shipped with the file');
      assert.equal(price.formula, undefined, 'a price cell must not be computed');
      assert.equal(price.col, 7, 'prices belong in column G, as in the Configurator');
    }
  });

  test('quantities are referenced, not copied, so there is one source of truth', () => {
    // Public/Shared Cloud, row 23.
    assert.equal(cell(23, 4)?.formula, 'Configurator!D23');
    // Measurements Created, row 28.
    assert.equal(cell(28, 4)?.formula, 'Configurator!D28');
  });

  test('messages are billed per 100,000, rounded up', () => {
    const quantity = cell(27, 4);
    const billable = cell(27, 5);
    assert.equal(quantity?.formula, 'SUM(Configurator!D28:D36)');
    assert.equal(quantity?.cached, 45_978_000);
    assert.equal(billable?.formula, 'ROUNDUP(D27/100000,0)');
    assert.equal(billable?.cached, 460, '45,978,000 messages is 460 blocks of 100,000');
  });

  test('the catalog discount applies to everything except messages', () => {
    // Messages carry their own negotiated rate.
    assert.equal(cell(27, 8)?.formula, 'E27*G27');
    // Everything else takes the discount in D6.
    assert.equal(cell(23, 8)?.formula, 'E23*G23*(1-$D$6)');
    assert.equal(cell(37, 8)?.formula, 'E37*G37*(1-$D$6)');
    // And the discount cell itself is an empty input.
    assert.equal(cell(6, 4)?.style, 'percentInput');
    assert.equal(cell(6, 4)?.value, null);
  });

  test('the totals mirror the Configurator: monthly, then times the months', () => {
    assert.equal(cell(48, 8)?.formula, 'SUM(H23:H47)');
    assert.equal(cell(49, 8)?.formula, 'H48*D21');
    assert.equal(cell(8, 8)?.formula, 'H49', 'one period, so the grand total is its period total');
  });

  test('five periods chain into the grand total', () => {
    const base = conceptSection9Scenario();
    const scenario = {
      ...base,
      periods: [1, 2, 3, 4, 5].map((i) => ({
        index: i,
        months: 12,
        machineCountOverrides: {},
        commercial: {},
      })),
    };
    const sheet = workbookSheets(scenario, computeScenario(scenario))[1]!;
    const grand = sheet.rows.find((r) => r.row === 8)?.cells.find((c) => c.col === 8);
    assert.equal(grand?.formula, 'H49+H79+H109+H139+H169');
    // And each period's own total is 30 rows below the last.
    for (const i of [1, 2, 3, 4, 5]) {
      const r = 49 + (i - 1) * 30;
      const total = sheet.rows.find((row) => row.row === r)?.cells.find((c) => c.col === 8);
      assert.equal(total?.formula, `H${r - 1}*D${21 + (i - 1) * 30}`, `period ${i} total`);
    }
  });

  test('every cached value is zero wherever a price is missing', () => {
    // A cached number that disagreed with its formula would be worse than a
    // blank, so the only non-zero caches are figures the tool already computed.
    for (const row of quote().rows) {
      for (const c of row.cells) {
        if (!c.formula || c.cached === undefined) continue;
        if (c.col === 8) {
          assert.equal(c.cached, 0, `total at row ${row.row} cached non-zero with no prices`);
        }
      }
    }
  });

  test('it says it is a working total, not an approved quote', () => {
    const notes = quote()
      .rows.flatMap((r) => r.cells)
      .map((c) => c.value)
      .filter((v): v is string => typeof v === 'string');
    assert.ok(notes.some((n) => /working total, not an approved quote/.test(n)));
    assert.ok(notes.some((n) => /ships with no prices in it/.test(n)));
    assert.ok(
      notes.some((n) => /approval thresholds.*stay in the Sales Configurator/.test(n)),
      'approval gates are internal and must stay where they are',
    );
  });

  test('the workbook still carries no price, rate or currency of its own', () => {
    const text = allValues()
      .filter((v): v is string => typeof v === 'string')
      .join(' | ');
    assert.doesNotMatch(text, /€|EUR|USD|\$\d/);
    assert.doesNotMatch(text, /\bprice list\b/i);
    // "Unit Price" is a column heading, which is the whole point.
    assert.match(text, /Unit Price/);
  });

  test('formulas recalculate on open, since no total is cached non-zero', () => {
    const xml = new TextDecoder().decode(buildXlsx(sheetsFor()));
    assert.match(xml, /<calcPr calcId="0" fullCalcOnLoad="1"\/>/);
    // calcPr must follow sheets, per the schema.
    assert.ok(xml.indexOf('<sheets>') < xml.indexOf('<calcPr'));
  });
});
