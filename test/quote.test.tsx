/**
 * The figures the results page leads with, held three ways.
 *
 * 1. **By hand.** A two-period ramp worked out from the per-machine rates in
 *    CONCEPT.md §9 with nothing but arithmetic in the comments, so a mistake the
 *    engine and its other tests share cannot pass here. The 12x storage error
 *    lived for a release because every multi-period test compared the engine
 *    with itself.
 * 2. **Screen against workbook.** The panel's text, the quote module and the
 *    Quote sheet's term column -- formula evaluated, not just its cached value --
 *    have to say the same thing, because a reader will check one against the
 *    other and the tool loses the argument the moment they differ.
 * 3. **Across many fleets.** Generated scenarios, seeded so a failure replays,
 *    each checked against the rules the quote promises: rounded up, never below
 *    a month the fleet sends or stores, and the term is the periods added up.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { render } from 'preact-render-to-string';

import {
  MESSAGE_BILLING_UNIT,
  computeScenario,
  periodQuotes,
  termQuote,
  workbookSheets,
  type MachineType,
  type Scenario,
  type ScenarioResult,
} from '../lib/engine/index.js';
import { conceptSection9Scenario, presetByKey } from '../lib/presets/index.js';
import { setFormatLocale } from '../lib/format/index.js';
import { LocaleContext } from '../src/ui/i18n.js';
import { Quote } from '../src/ui/Quote.js';

/** §9's fleet, then a second period of six months at three times the size. */
function ramp(): Scenario {
  const base = conceptSection9Scenario();
  const hvac = base.machineTypes[0]!;
  return {
    ...base,
    periods: [
      { index: 1, months: 12, machineCountOverrides: {}, commercial: { sharedCloud: 1 } },
      { index: 2, months: 6, machineCountOverrides: { [hvac.id]: 3_000 }, commercial: {} },
    ],
  };
}

describe('the quote, worked by hand', () => {
  const scenario = ramp();
  const result = computeScenario(scenario);
  const quotes = periodQuotes(scenario, result);
  const term = termQuote(quotes)!;

  test('messages: the busiest month of each period, in whole 100,000s, times its months', () => {
    // One HVAC unit, from §9: 1,440 climate readings a day bundled into one
    // measurement each, two flags every 4,320 s (20 a day each), one event,
    // half an alarm raised and half cleared, one inventory update -- 1,483
    // messages a day -- plus one command a month with three updates, 4 more.
    const perMachine = (days: number) => 1_483 * days + 4;
    assert.equal(perMachine(31), 45_977);

    // Period 1, Jan-Dec 2027, 1,000 machines. January is a 31-day month and
    // registers all 1,000: 45,977,000 + 1,000 = 45,978,000 -> 459.78 -> 460.
    assert.equal(quotes[0]!.messageUnitsPerMonth, 460);
    assert.equal(quotes[0]!.messagesPerMonth, 46_000_000);
    assert.equal(quotes[0]!.messagesOverPeriod, 46_000_000 * 12);

    // Period 2, Jan-Jun 2028, 3,000 machines. January is 31 days and registers
    // the 2,000 added: 3,000 x 45,977 + 2,000 = 137,933,000 -> 1,379.33 -> 1,380.
    // March and May are 31 days too, but register nobody, so they are 2,000 less.
    assert.equal(3_000 * perMachine(31) + 2_000, 137_933_000);
    assert.equal(quotes[1]!.messageUnitsPerMonth, 1_380);
    assert.equal(quotes[1]!.messagesPerMonth, 138_000_000);
    assert.equal(quotes[1]!.messagesOverPeriod, 138_000_000 * 6);

    // The term: 552,000,000 + 828,000,000.
    assert.equal(term.messages, 1_380_000_000);
    assert.equal(term.messageUnits, 460 * 12 + 1_380 * 6);
    assert.equal(term.months, 18);
  });

  test('storage: the fullest month-end in whole GiB, times its months', () => {
    // Kept 30 days. A measurement document is 95 B, and one unit writes 1,480
    // of them a day: 1,440 bundles and 2 x 20 flags.
    const GiB = 1024 ** 3;
    const measurements = (machines: number) => (machines * 1_480 * 30 * 95) / GiB;
    // Events 1 a day at 1.7 kB, alarms one document per incident (0.5 a day)
    // at 2.7 kB. Commands and the devices themselves add a few MB on top.
    const documents = (machines: number) => (machines * 30 * (1 * 1_700 + 0.5 * 2_700)) / GiB;

    // 1,000 machines: 3.93 GiB of measurements + 0.09 GiB of documents = 4.02.
    const p1 = measurements(1_000) + documents(1_000);
    assert.ok(p1 > 4 && p1 < 4.05, `${p1}`);
    assert.equal(quotes[0]!.storageGiBPerMonth, 5, '4.02 GiB, rounded up');
    assert.equal(quotes[0]!.storageGiBOverPeriod, 60);

    // 3,000 machines: 11.79 + 0.26 = 12.05 GiB -> 13.
    const p2 = measurements(3_000) + documents(3_000);
    assert.ok(p2 > 12 && p2 < 12.1, `${p2}`);
    assert.equal(quotes[1]!.storageGiBPerMonth, 13, '12.05 GiB, rounded up');
    assert.equal(quotes[1]!.storageGiBOverPeriod, 78);

    // And the engine's own figure sits within a few MB of the hand one: the
    // commands and devices the sum above leaves out.
    const engine = result.storage.find((m) => m.year === 2028 && m.month === 6)!.quotedGiB;
    assert.ok(engine - p2 >= 0 && engine - p2 < 0.02, `${engine} vs ${p2}`);

    assert.equal(term.storageGiB, 60 + 78);
  });

  test('the panel prints every digit, in both languages', () => {
    const html = render(h(Quote, { scenario, result }));
    for (const figure of [
      '46,000,000', '552,000,000', '138,000,000', '828,000,000', '1,380,000,000',
      '5 GiB', '60 GiB-months', '13 GiB', '78 GiB-months', '138 GiB-months',
    ]) {
      assert.ok(html.includes(`>${figure}<`), `missing ${figure}`);
    }
    assert.match(html, /Whole term/);
    assert.match(html, /January 2027 – June 2028 · 18 months/);
    // Shortened figures can read below the quote: 1,340,000,000 is "1.3 B".
    assert.doesNotMatch(html, /\d (M|B|k)</);

    setFormatLocale('de');
    try {
      const de = render(h(LocaleContext.Provider, { value: 'de' }, h(Quote, { scenario, result })));
      assert.ok(de.includes('>1.380.000.000<'), 'German groups with dots');
      assert.ok(de.includes('>138 GiB-Monate<'));
      assert.match(de, /Gesamte Laufzeit/);
    } finally {
      setFormatLocale('en');
    }
  });

  test('one period still gets its sum row, so the total is always in the same place', () => {
    const one = conceptSection9Scenario();
    const html = render(h(Quote, { scenario: one, result: computeScenario(one) }));
    assert.match(html, /Whole term/);
    assert.match(html, /<b>552,000,000<\/b>/);
    assert.match(html, /<b>60 GiB-months<\/b>/);
  });
});

/* ------------------------------------------------- the workbook says the same */

type Cell = { col: number; value: unknown; formula?: string; cached?: unknown };
type Sheet = { name: string; rows: { row: number; cells: Cell[] }[] };

function colIndex(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function cellAt(sheet: Sheet, ref: string): Cell | undefined {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!m) throw new Error(`not a reference: ${ref}`);
  return sheet.rows.find((r) => r.row === Number(m[2]))?.cells.find((c) => c.col === colIndex(m[1]!));
}

/**
 * Evaluates the two shapes the term column is written in -- `X*Y` and
 * `ROUNDUP(X/N,0)*Y`, summed with `+` -- against the sheet's own cells. So the
 * check is on what Excel will compute when the file is opened, not on the
 * value the writer cached beside the formula.
 */
function evaluate(sheet: Sheet, formula: string): number {
  return formula.split('+').reduce((sum, term) => {
    const value = (ref: string) => Number(cellAt(sheet, ref)?.value ?? 0);
    const rounded = /^ROUNDUP\(([A-Z$]+\d+)\/(\d+),0\)\*([A-Z$]+\$?\d+)$/.exec(term);
    if (rounded) {
      return sum + Math.ceil(value(rounded[1]!) / Number(rounded[2])) * value(rounded[3]!);
    }
    const plain = /^([A-Z$]+\d+)\*([A-Z$]+\$?\d+)$/.exec(term);
    if (plain) return sum + value(plain[1]!) * value(plain[2]!);
    throw new Error(`unexpected term in ${formula}: ${term}`);
  }, 0);
}

/** The Quote sheet's line for one item: its quantity per period and over the term. */
function quoteLine(scenario: Scenario, result: ScenarioResult, label: string) {
  const sheet = workbookSheets(scenario, result).find((s) => s.name === 'Quote') as unknown as Sheet;
  const row = sheet.rows.find((r) => r.cells.some((c) => c.value === label))!;
  const term = row.cells.find((c) => typeof c.formula === 'string' && !/\(1-/.test(c.formula))!;
  const perPeriod = row.cells
    .filter((c) => typeof c.value === 'number')
    .sort((a, b) => a.col - b.col)
    .map((c) => c.value as number);
  return { perPeriod, termCached: term.cached as number, termEvaluated: evaluate(sheet, term.formula!) };
}

function agrees(scenario: Scenario, result: ScenarioResult, tag: string): void {
  const quotes = periodQuotes(scenario, result).filter((q) => q.months > 0);
  const term = termQuote(quotes);
  if (!term) return;

  const messages = quoteLine(scenario, result, 'Messages');
  assert.equal(messages.termEvaluated, term.messageUnits, `${tag}: messages, as Excel computes it`);
  assert.equal(messages.termCached, term.messageUnits, `${tag}: messages, as cached`);
  assert.deepEqual(
    messages.perPeriod.map((m) => Math.ceil(m / MESSAGE_BILLING_UNIT)),
    quotes.map((q) => q.messageUnitsPerMonth),
    `${tag}: each period's messages`,
  );

  const ods = quoteLine(scenario, result, 'Operational Data Store');
  assert.equal(ods.termEvaluated, term.storageGiB, `${tag}: storage, as Excel computes it`);
  assert.equal(ods.termCached, term.storageGiB, `${tag}: storage, as cached`);
  assert.deepEqual(ods.perPeriod, quotes.map((q) => q.storageGiBPerMonth), `${tag}: each period's storage`);
}

describe('the screen and the workbook say the same thing', () => {
  test('on the hand-worked ramp', () => {
    const scenario = ramp();
    agrees(scenario, computeScenario(scenario), 'ramp');
  });

  test('with a storage figure stated on the contract step', () => {
    const scenario = ramp();
    scenario.periods[1]!.commercial = { ods: 40 };
    const result = computeScenario(scenario);
    agrees(scenario, result, 'stated');
    assert.equal(termQuote(periodQuotes(scenario, result))!.storageGiB, 60 + 40 * 6);
  });
});

/* --------------------------------------------------------- across many fleets */

/** mulberry32: small, seeded, and the same sequence on every machine. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRESET_KEYS = ['hvac', 'meter', 'tracker', 'gateway', 'machine'];

function generated(seed: number): Scenario {
  const rnd = random(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(xs: T[]): T => xs[int(0, xs.length - 1)]!;

  const keys = PRESET_KEYS.filter(() => rnd() < 0.5);
  if (keys.length === 0) keys.push(pick(PRESET_KEYS));
  const machineTypes: MachineType[] = keys.map((key) => ({
    ...presetByKey(key)!,
    // Small fleets as well as large: the rounding is most of the figure there.
    machineCount: pick([0, 1, 7, 150, 2_000, 40_000]),
    onlinePct: pick([100, 100, 85, 40]),
  }));

  const periods = Array.from({ length: int(1, 5) }, (_, i) => ({
    index: i + 1,
    months: pick([1, 3, 6, 12, 12, 24, 36]),
    // Growing, shrinking and flat, period to period.
    machineCountOverrides: Object.fromEntries(
      machineTypes.filter(() => rnd() < 0.6).map((mt) => [mt.id, int(0, 60_000)]),
    ),
    commercial: (rnd() < 0.15 ? { ods: int(1, 500) } : {}) as Record<string, number>,
  }));

  return {
    format: 2,
    name: `generated ${seed}`,
    notes: '',
    settings: {
      startYear: int(2026, 2029),
      startMonth: int(1, 12),
      fragmentPrefix: 'acme',
      retentionDays: pick([1, 7, 30, 90, 365]),
    },
    periods,
    machineTypes,
  };
}

describe('the quote keeps its promises on 300 generated fleets', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const scenario = generated(seed);
    const result = computeScenario(scenario);
    const quotes = periodQuotes(scenario, result);
    const tag = `seed ${seed}`;

    test(tag, () => {
      for (const q of quotes) {
        const period = scenario.periods.find((p) => p.index === q.index)!;
        const months = result.months.filter((m) => m.periodIndex === q.index);
        assert.equal(months.length, period.months, `${tag} P${q.index}: one entry per calendar month`);

        // Messages: whole units, at or above every month, and less than one
        // unit above the busiest -- rounded up, not padded.
        const busiest = Math.max(0, ...months.map((m) => m.total));
        assert.equal(q.messagesPerMonth % MESSAGE_BILLING_UNIT, 0, `${tag} P${q.index}: whole units`);
        assert.ok(q.messagesPerMonth >= busiest, `${tag} P${q.index}: below its busiest month`);
        assert.ok(q.messagesPerMonth - busiest < MESSAGE_BILLING_UNIT, `${tag} P${q.index}: over-rounded`);
        assert.equal(q.messagesOverPeriod, q.messagesPerMonth * period.months);
        const sent = months.reduce((sum, m) => sum + m.total, 0);
        assert.ok(q.messagesOverPeriod >= sent, `${tag} P${q.index}: below what is sent`);

        // Storage: stated wins; otherwise whole GiB, at or above every
        // month-end, less than one GiB above the fullest.
        const own = result.storage.filter((m) => m.periodIndex === q.index);
        const stated = period.commercial['ods'];
        if (typeof stated === 'number' && stated > 0) {
          assert.equal(q.storageGiBPerMonth, stated, `${tag} P${q.index}: stated storage`);
        } else {
          const fullest = Math.max(0, ...own.map((m) => m.quotedGiB));
          assert.ok(Number.isInteger(q.storageGiBPerMonth), `${tag} P${q.index}: whole GiB`);
          assert.ok(q.storageGiBPerMonth >= fullest, `${tag} P${q.index}: below its fullest month`);
          assert.ok(q.storageGiBPerMonth - fullest < 1, `${tag} P${q.index}: over-rounded storage`);
          const billed = own.reduce((sum, m) => sum + m.unitsGiB, 0);
          assert.ok(q.storageGiBOverPeriod >= billed, `${tag} P${q.index}: below what is billed`);
        }
        assert.equal(q.storageGiBOverPeriod, q.storageGiBPerMonth * period.months);
      }

      // The term is the rows added up, and the workbook agrees to the unit.
      const term = termQuote(quotes)!;
      assert.equal(term.messages, quotes.reduce((s, q) => s + q.messagesOverPeriod, 0));
      assert.equal(term.storageGiB, quotes.reduce((s, q) => s + q.storageGiBOverPeriod, 0));
      assert.equal(term.months, scenario.periods.reduce((s, p) => s + p.months, 0));
      agrees(scenario, result, tag);
    });
  }
});
