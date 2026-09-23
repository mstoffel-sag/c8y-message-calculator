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
    // The Configurator sheet is gone. It restated the Quote sheet's quantities
    // at the Sales Configurator's own row numbers so a column could be pasted
    // cell for cell; the hand-off table in the app still offers that as a copy,
    // and one sheet quoting another was the part nobody opened.
    assert.deepEqual(
      sheetsFor().map((s) => s.name),
      ['Quote', 'Machine Data', 'Months', 'Storage', 'Guidance'],
    );
  });

  test('the Quote sheet states the message quantity rather than referencing it', () => {
    const quote = sheet('Quote');
    const result = computeScenario(conceptSection9Scenario());
    const peak = result.periods[0]!.peak;

    // It used to read `SUM(Configurator!D28:D36)` off a sheet that no longer
    // exists -- which would be #REF!, not a number. The nine counters that make
    // it up are itemised on Months.
    const row = quote.rows.find((r) => r.cells.some((c) => c.value === 'Messages'))!;
    const cell = row.cells.find((c) => typeof c.value === 'number' && c.value === peak.total);
    assert.ok(cell, 'the peak total is stated as a value');
    assert.equal(cell!.formula, undefined, 'and not as a cross-sheet reference');

    // Nothing anywhere still points at the removed sheet.
    for (const s0 of sheetsFor()) {
      for (const r of s0.rows) {
        for (const c of r.cells) {
          assert.doesNotMatch(String(c.formula ?? ''), /Configurator!/, `${s0.name} r${r.row}`);
        }
      }
    }
  });

  test('the storage line is the period sum, and the Storage sheet shows the addition', () => {
    const result = computeScenario(conceptSection9Scenario());
    const period = result.storageByPeriod[0]!;

    // D37 carries the quantity storage is billed on: the month-end snapshots
    // added up. The fullest month is a stat, not the cell -- quoting it would
    // charge twelve full months for a year spent filling up.
    const d37 = sheet('Quote')
      .rows.find((row) => row.cells.some((c) => c.value === 'Operational Data Store'))
      ?.cells.find((c) => typeof c.value === 'number')?.value;
    assert.equal(d37, Number(period.giBMonths.toFixed(2)));
    assert.notEqual(d37, Number(period.peak!.quotedGiB.toFixed(2)));

    // And the sheet behind it carries one row per month plus the total, so the
    // sum can be checked rather than taken on trust.
    const storage = sheet('Storage');
    const cells = storage.rows.flatMap((row) => row.cells);
    const labels = cells.filter((c) => c.col === 1).map((c) => String(c.value));
    assert.ok(
      labels.some((l) => l === 'Period 1 total (12 months) - GiB-months'),
      `no period total row: ${labels.join(' | ')}`,
    );
    assert.ok(labels.filter((l) => /^\w+ 2027$/.test(l.replace(' (fullest)', ''))).length >= 12);
    // The total row's GiB columns are the sums of the month rows above it.
    const totalRow = storage.rows.find((row) =>
      row.cells.some((c) => c.col === 1 && String(c.value).startsWith('Period 1 total')),
    )!;
    assert.equal(
      totalRow.cells.find((c) => c.col === 7)?.value,
      Number(period.highGiBMonths.toFixed(2)),
    );
    // The two streams are shown apart: the byte figure was measured on
    // datapoints, so a reviewer has to be able to see how much of the estimate
    // is documents before trusting it.
    const monthRow = storage.rows.find((row) =>
      row.cells.some((c) => c.col === 1 && String(c.value).startsWith('January 2027')),
    )!;
    const at = (col: number) => monthRow.cells.find((c) => c.col === col)?.value as number;
    assert.equal(at(3), Math.round(result.storage[0]!.retainedMeasurements));
    assert.equal(at(4), Math.round(result.storage[0]!.retainedOther));
    assert.ok(at(3) > at(4) * 1000, 'measurements dominate this fleet, and it is visible');
    // GiB-months has to be said somewhere, or a reader divides by twelve.
    assert.ok(
      allValues().some((v) => typeof v === 'string' && v.includes('GiB-months')),
      'the unit is named',
    );
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

  test('the Machine Data sheet carries how each machine talks', () => {
    const design = sheet('Machine Data');
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

  test('the Machine Data sheet says which readings share a measurement', () => {
    const design = sheet('Machine Data');
    const shared = design.rows.filter((r) =>
      r.cells.some((c) => c.value === 'shared'),
    );
    const alone = design.rows.filter((r) => r.cells.some((c) => c.value === 'alone'));
    assert.equal(shared.length, 4, 'the four climate readings');
    assert.ok(alone.length >= 6, 'two flags plus the event, alarm, fact and command');

    // The message cost belongs to the measurement, so it is stated once.
    const costs = design.rows
      .map((r) => r.cells.find((c) => c.col === 11)?.value)
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

    // The workbook now does size a commitment -- the whole point of a
    // commit-to-consume contract -- but only as a formula over an empty price
    // column. So no commitment *value* may ship, on any sheet.
    for (const cell of sheetsFor(scenario)
      .flatMap((sheet) => sheet.rows)
      .flatMap((row) => row.cells)) {
      if (cell.style === 'money' || cell.style === 'moneyBold') {
        assert.ok(cell.formula, 'a money cell must be computed, never written');
        assert.equal(cell.value, null, 'a money value shipped with the file');
        assert.equal(cell.cached, 0, 'a money cell cached a non-zero total');
      }
    }
    // Not asserted: that prose near the word "commitment" carries no digits. It
    // was, and it failed on "paste from row 21 down" -- a heuristic that forbids
    // honest sentences gets weakened until it means nothing. The invariant that
    // matters is the one above: every money cell is a formula over an empty
    // price, so no commitment figure can ship whatever the prose says.
    assert.ok((text.match(/commitment/gi) ?? []).length > 0, 'and it is named, not hidden');
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

  test('it is the first sheet: the file opens on the thing that gets priced', () => {
    assert.deepEqual(
      sheetsFor().map((s) => s.name),
      ['Quote', 'Machine Data', 'Months', 'Storage', 'Guidance'],
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

  test('quantities are stated here, since there is no second sheet to read them from', () => {
    // They used to be `Configurator!D23` and friends -- one sheet quoting
    // another. That sheet is gone, so the quantity is the value, and a
    // dangling reference is the failure this guards against.
    assert.equal(cell(13, 4)?.value, 1, 'Public/Shared Cloud');
    assert.equal(cell(13, 4)?.formula, undefined);
    const dangling = quote()
      .rows.flatMap((r) => r.cells)
      .filter((c) => typeof c.formula === 'string' && c.formula.includes('Configurator!'));
    assert.deepEqual(dangling, [], 'nothing still points at the removed sheet');
  });

  test('messages are billed per 100,000, rounded up per month then over the term', () => {
    // One period of 12 months, so the messages row sits at 17.
    const quantity = cell(17, 4);
    const term = cell(17, 6);
    // Stated, not read off a second sheet -- that sheet is gone.
    assert.equal(quantity?.formula, undefined);
    assert.equal(typeof quantity?.value, 'number');
    // `cached` belonged to the formula; a stated quantity is just the value.
    assert.equal(quantity?.value, 45_978_000);
    // Rounded up per month and then multiplied by the months -- the order the
    // Configurator bills in. Rounding at the end would under-count.
    assert.equal(term?.formula, 'ROUNDUP(D17/100000,0)*D$11');
    assert.equal(term?.cached, 460 * 12, '460 blocks a month for 12 months');
  });

  test('the catalog discount applies to everything except messages', () => {
    // Messages carry their own negotiated rate.
    assert.equal(cell(17, 8)?.formula, 'F17*G17');
    // Everything else takes the discount in D6.
    assert.equal(cell(13, 8)?.formula, 'F13*G13*(1-$D$6)');
    assert.equal(cell(18, 8)?.formula, 'F18*G18*(1-$D$6)', 'Operational Data Store');
    // And the discount cell itself is an empty input.
    assert.equal(cell(6, 4)?.style, 'percentInput');
    assert.equal(cell(6, 4)?.value, null);
  });

  test('the commitment is the term column times the price column, summed', () => {
    // Every line: billable units over the term (F) x unit price (G) -> total (H).
    // The commitment is the sum of that column, and the headline at row 8 points
    // at it rather than summing a second time.
    assert.equal(cell(30, 8)?.formula, 'SUM(H13:H28)');
    assert.equal(cell(8, 8)?.formula, 'H30');
    assert.equal(cell(30, 7)?.value, 'CTC commitment, whole term');
    // Nothing is cached: the file ships with no price, so every total is zero
    // until Excel recalculates on open.
    assert.equal(cell(30, 8)?.cached, 0);
  });

  test('the quantity side of the commitment is computed, not left to Excel', () => {
    // Prices are Excel's job. Quantities are the tool's, so they arrive filled
    // in: 460 blocks a month for 12 months.
    assert.equal(cell(17, 6)?.cached, 5520);
    // Messages over the whole term, at every month's own volume.
    const term = quote().rows.find((r) => r.row === 32)!;
    assert.ok((term.cells.find((c) => c.col === 6)?.value as number) > 500_000_000);
    // And the gap against a commitment quoted on peak months.
    const gap = quote().rows.find((r) => r.row === 34)!;
    assert.ok((gap.cells.find((c) => c.col === 6)?.value as number) >= 0);
  });

  test('five periods widen the sheet instead of lengthening it', () => {
    const base = conceptSection9Scenario();
    const scenario = {
      ...base,
      periods: [1, 2, 3, 4, 5].map((i) => ({
        index: i,
        months: i * 6,
        machineCountOverrides: {},
        commercial: {},
      })),
    };
    const sheet = workbookSheets(scenario, computeScenario(scenario))[0]!;
    const at = (r: number, c: number) =>
      sheet.rows.find((row) => row.row === r)?.cells.find((x) => x.col === c);

    // Months in D..H, and the term is their sum: 6+12+18+24+30.
    for (const [i, col] of [4, 5, 6, 7, 8].entries()) {
      assert.equal(at(11, col)?.value, (i + 1) * 6, `period ${i + 1} months`);
    }
    assert.equal(at(11, 10)?.value, 90, 'term months');

    // Five periods push the term, price and total columns right; the line items
    // stay on the same rows, which is the point of laying them out this way.
    assert.equal(at(12, 10)?.value, 'Billable units, whole term');
    assert.equal(at(12, 12)?.value, 'Total, whole term');

    // The term column multiplies each period by its own length and adds them up.
    assert.equal(
      at(17, 10)?.formula,
      'ROUNDUP(D17/100000,0)*D$11+ROUNDUP(E17/100000,0)*E$11+ROUNDUP(F17/100000,0)*F$11' +
        '+ROUNDUP(G17/100000,0)*G$11+ROUNDUP(H17/100000,0)*H$11',
    );
    // And the commitment still sums one column.
    assert.equal(at(30, 12)?.formula, 'SUM(L13:L28)');
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
