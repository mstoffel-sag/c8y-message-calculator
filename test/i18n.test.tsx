/**
 * The catalogue, and the promise that comes with it.
 *
 * TypeScript already enforces the important half: `de` is `Record<Key, string>`
 * against `en`, so a missing translation does not compile. What it cannot see is
 * a German entry that is still English, a placeholder that was dropped in
 * translation, a key nothing renders any more -- or a component that never
 * asked the catalogue in the first place. Those are what this file is for.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h } from 'preact';
import { render } from 'preact-render-to-string';

import {
  CATALOGUES,
  LOCALES,
  de,
  en,
  makeT,
  parseRich,
  parseRichProse,
  plainText,
  translate,
  type Key,
} from '../lib/i18n/index.js';
import { LocaleContext } from '../src/ui/i18n.js';
import { setFormatLocale } from '../src/ui/format.js';
import { computeScenario } from '../lib/engine/index.js';
import { conceptSection9Scenario } from '../lib/presets/index.js';
import { COUNTER_LABELS, LINE_ITEMS } from '../lib/engine/index.js';
import { PROTOCOLS, UNITS, catalogFor } from '../lib/presets/catalog.js';
import { STEPS } from '../src/ui/wizard/steps.js';
import { StepFleet } from '../src/ui/wizard/StepFleet.js';
import { StepTimeSeries } from '../src/ui/wizard/StepTimeSeries.js';
import { StepDiscrete } from '../src/ui/wizard/StepDiscrete.js';
import { StepContract } from '../src/ui/wizard/StepContract.js';
import { StepResults } from '../src/ui/wizard/StepResults.js';

const root = (() => {
  let at = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 6; up += 1) {
    if (existsSync(join(at, 'package.json')) && existsSync(join(at, 'lib', 'engine'))) return at;
    at = dirname(at);
  }
  throw new Error('cannot find the repo root from the compiled test');
})();
const keys = Object.keys(en) as Key[];

/** Keys built from a value at runtime, so no source file spells them out. */
const COMPUTED_PREFIXES = ['unit.'];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes('/i18n/')) out.push(full);
  }
  return out;
}

const code = [...sources(join(root, 'src')), ...sources(join(root, 'lib'))]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('the catalogue', () => {
  test('German says something, and says it in German', () => {
    for (const key of keys) {
      const english = en[key];
      const german = de[key];
      assert.ok(german.trim().length > 0, `${key} is empty in German`);
      // A short string can legitimately be identical -- "ms", "Status",
      // "Position", "MQTT". A paragraph cannot: that is a copy-paste.
      if (english.length > 60) {
        assert.notEqual(german, english, `${key} was copied, not translated`);
      }
    }
  });

  test('a placeholder never gets lost in translation', () => {
    // {count} dropped from a German string is a sentence missing its number,
    // and nothing else would catch it: the type is still string.
    for (const key of keys) {
      assert.deepEqual(
        placeholders(de[key]),
        placeholders(en[key]),
        `${key} has different placeholders in the two languages`,
      );
    }
  });

  test('every key is rendered by something', () => {
    // A plural pair is referenced by its base -- `t.plural('ramp.months', n)`
    // -- so `ramp.months.one` is used if `ramp.months` appears anywhere.
    const used = (key: string) => code.includes(`'${key}'`) || code.includes(`"${key}"`);
    const dead = keys.filter((key) => {
      if (COMPUTED_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
      const base = key.replace(/\.(one|other)$/, '');
      return !used(key) && !used(base);
    });
    assert.deepEqual(dead, [], 'unused keys: delete them or render them');
  });

  test('both locales are offered, each named in itself', () => {
    assert.deepEqual(
      LOCALES.map((l) => l.code),
      Object.keys(CATALOGUES),
    );
    assert.equal(LOCALES.find((l) => l.code === 'de')?.label, 'Deutsch');
  });

  test('an unknown locale falls back to English rather than blanking', () => {
    // A saved preference from a build that had a third language, say.
    assert.equal(translate('fr' as 'en', 'nav.back'), en['nav.back']);
  });

  test('a missing placeholder is left visible, not silently emptied', () => {
    assert.match(translate('en', 'nav.progress', { step: 2 }), /\{total\}/);
  });

  test('plurals pick by count in both languages', () => {
    const t = makeT('de');
    assert.equal(t.plural('kind.occurrence', 1), 'Ereignis');
    assert.equal(t.plural('kind.occurrence', 3), 'Ereignisse');
    assert.equal(makeT('en').plural('kind.occurrence', 3), 'events');
  });
});

describe('the catalogue markup', () => {
  test('the four marks become tokens, and nothing else does', () => {
    assert.deepEqual(parseRich('a **b** `c` *d*'), [
      { kind: 'text', text: 'a ' },
      { kind: 'b', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'd' },
    ]);
    assert.deepEqual(parseRich('# not a heading'), [{ kind: 'text', text: '# not a heading' }]);
  });

  test('an unclosed mark stays literal instead of eating the sentence', () => {
    // A translator's stray asterisk should look like a stray asterisk.
    assert.deepEqual(parseRich('2 * 3 = 6'), [{ kind: 'text', text: '2 * 3 = 6' }]);
  });

  test('a blank line is a paragraph, and a single newline is not', () => {
    assert.equal(parseRichProse('one\ntwo\n\nthree').length, 2);
    assert.deepEqual(parseRichProse('one\ntwo')[0], [{ kind: 'text', text: 'one two' }]);
  });

  test('plainText strips the marks for a title attribute', () => {
    assert.equal(plainText('**Send** it `now`'), 'Send it now');
  });

  test('every catalogue string parses to something', () => {
    for (const key of keys) {
      for (const locale of ['en', 'de'] as const) {
        const text = CATALOGUES[locale][key];
        assert.ok(
          plainText(text).length > 0,
          `${key} in ${locale} parses to nothing -- unbalanced marks?`,
        );
      }
    }
  });
});

describe('a German session is German', () => {
  const scenario = conceptSection9Scenario();
  const result = computeScenario(scenario);

  /**
   * What stays English in every locale, and therefore has to come out of the
   * page before it is scanned: Configurator row labels and their unit column,
   * counter names, protocol names, and every name in the metric catalogue --
   * a chosen name becomes scenario data (lib/i18n NOT_TRANSLATED).
   */
  const english = [
    ...LINE_ITEMS.flatMap((i) => [i.label, i.unit]),
    ...Object.values(COUNTER_LABELS),
    ...PROTOCOLS.flatMap((p) => [p.label ?? '', p.value]),
    ...UNITS.map((u) => u.label ?? ''),
    ...['continuous', 'state', 'occurrence', 'condition', 'inventory', 'command'].flatMap((kind) =>
      catalogFor(kind).map((seed) => seed.name),
    ),
    ...scenario.machineTypes.flatMap((mt) => [
      mt.name,
      ...mt.metrics.map((m) => m.name),
      ...mt.bundles.map((b) => b.fragmentName),
    ]),
    // Cumulocity's own vocabulary, kept in both languages on purpose.
    'Cumulocity', 'Sales Configurator', 'commit-to-consume', 'Managed Object', 'DataHub',
    'SmartREST', 'MQTT', 'POST', 'PUT', 'PENDING', 'EXECUTING', 'SUCCESSFUL', 'Quote',
    'Configurator', 'Design', 'Months', 'Guidance', 'Expert', 'Analytics Builder',
    // German technical writing borrows these whole.
    'Proof of Concept', 'Public Cloud', 'Shared Cloud', 'Device Management',
    'Digital Twin Manager', 'Cockpit', 'Smart Rules', 'Management Tenant', 'Multi-Tenancy',
    'Enterprise Tenants', 'EPL Apps', 'Storage', 'Edge',
  ];

  /** English function words. None of them is a word in German. */
  const MARKERS = /\b(the|and|is|are|of|with|from|that|this|not|but|does|than|into|every)\b/gi;

  function germanText(step: string): string {
    setFormatLocale('de');
    const props = { scenario, result, expert: true, onChange: () => {} };
    const component = {
      fleet: StepFleet,
      series: StepTimeSeries,
      discrete: StepDiscrete,
      contract: StepContract,
      results: StepResults,
    }[step]!;
    const html = render(h(LocaleContext.Provider, { value: 'de' }, h(component, props)));
    setFormatLocale('en');

    let text = html.replace(/<[^>]+>/g, ' ');
    // Longest first, or removing "Pressure" out of "Pressure out of range"
    // leaves "out of range" behind and the scan blames the catalogue.
    for (const phrase of [...english].sort((a, b) => b.length - a.length)) {
      if (phrase.length > 1) text = text.split(phrase).join(' ');
    }
    return text;
  }

  for (const step of STEPS) {
    test(`${step.key}: no English left on the page`, () => {
      const leftovers = [...new Set(germanText(step.key).match(MARKERS) ?? [])];
      assert.deepEqual(leftovers, [], `${step.key} still renders English`);
    });
  }

  test('the step titles and the rail come from the catalogue', () => {
    for (const step of STEPS) {
      assert.notEqual(
        de[step.titleKey],
        en[step.titleKey],
        `${step.key} has an untranslated title`,
      );
    }
  });
});
