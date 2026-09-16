# Working in this repo

Two webapps over one engine, turning a fleet description into **Cumulocity messages per calendar
month**, mapped onto the nine counters of the `[CTC] Sales Configurator`. [CONCEPT.md](CONCEPT.md)
is the design document and the argument for every decision in here; read the section it names before
changing behaviour it describes.

- **`src/c8y`** — the Web SDK build: Angular 21 + `@c8y/ngx-components` 1024.18.0 (`y2027-lts`),
  inside the Cumulocity shell. The one meant for a tenant.
- **`src/ui`** — the standalone build: preact, draws its own frame, needs no backend.
- **`lib/`** — everything that decides a number, shared by both and framework-free.

**A change to behaviour is a change to both apps.** They are not a fork: if you find yourself
writing the same logic twice, it belongs in `lib/`. That is how `lib/scenario`, `lib/format`,
`lib/diagram` and `lib/wizard` got there.

## The one hard constraint

> "We should not show real prices only metrics."

The Configurator's price list, cost columns, margins, approval thresholds, minimum commitments and
the DataHub uplift percentage are internal sales material. They must not appear in the bundle, the
generated workbook, or the docs. The tool produces **quantities**; the workbook multiplies them by a
price column that ships **empty**, so a commitment exists in the file and never in the tool.

Tests enforce it: they grep the rendered UI and the workbook XML for `€|EUR|USD|$\d`, `1.33|33 %`,
`160,?000|60,?000` and `\bmargin\b`, assert every `priceInput`/`percentInput` cell has
`value === null` and no formula, and assert every `money` cell is a formula with `cached === 0`.
`*.xlsx` is git-ignored for the same reason — the real Configurator is the price list, and git
history is forever.

## Commands

Node is not on the default PATH, and the default version is **too old for Angular 21**, which wants
`^20.19 || ^22.12 || >=24`. Use 22:

```
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
```

```
npm test              # tsc -p tsconfig.test.json && node --test dist-test/test/*.test.js
npm run typecheck     # the standalone app and lib/
npm run c8y:typecheck # the Web SDK app, templates included

npm run dev           # standalone, http://127.0.0.1:5173
npm run build         # standalone -> dist/
npm run package       # standalone -> dist-package/*.zip

npm run c8y:start     # Web SDK dev server; -- -u https://<tenant>.cumulocity.com
npm run c8y:build     # Web SDK -> dist-c8y/message-calculator/ and .zip
npm run c8y:deploy    # uploads it
```

`npm test`, `npm run typecheck` **and** `npm run c8y:typecheck` all pass before anything is called
done.

**`npm run c8y:build` type-checks nothing.** The devkit builds with `aot: false` and transpiles
through babel, so a type error and a broken template both produce a green build. `c8y:typecheck`
runs `ngc` and is the only thing that reads an Angular template. A green `c8y:build` means nothing
on its own.

The test script globs `dist-test/test/*.test.js` rather than passing the directory: `node --test
<dir>` resolves the path as a module on Node 22 and fails.

## Verifying UI and workbook changes

**The Web SDK app cannot be rendered here at all.** It boots by fetching the tenant's options
before Angular starts, so there is no headless render, no snapshot and no dev server without a
Cumulocity instance to point at. What can be checked is `npm run c8y:typecheck` (templates
included), that `npm run c8y:build` produces a zip with `index.html` and `cumulocity.json` in its
root, and reasoning. Say which of those you did; do not describe an Angular screen as if you had
seen it.

The standalone app can be rendered. Every UI check there is `preact-render-to-string` plus a WebKit
snapshot:

```
node tools/render_step.mjs <step> <out.html> [scrollPx] [locale]   # reads dist-test/: npm test first
qlmanage -t -s 1100 -o /tmp /tmp/c.html   # WebKit; renders HTML and .xlsx
python3 tools/xlsx_dump.py <file.xlsx>    # stdlib-only; pipe through sed to redact prices
```

Step keys are `fleet series discrete contract results`; `scrollPx` shifts the page up to reach
content below the first screenful, and `locale` is `en` or `de`.

Worth the round trip when **layout or wording** changed, or when two figures could disagree with each
other. Not worth it for a rename or an engine change — the tests cover those. Hover, focus and click
behaviour is reasoned about, never observed, so say so rather than claiming it works.

## Structure and invariants

- `lib/` is portable by test: no `document.` / `window.` / `localStorage` / `navigator.` / `fetch(` /
  `Blob(` / `process.`, no `@angular`, `@c8y` or `preact`, and every import relative and resolving
  inside `lib/`. It survived being ported into an Angular app, which is what that guard bought.
  `document.`, `window.`, `navigator.` and `process.` need the dot to touch a property name, so
  prose ending in "…the retention window." is fine — but **`localStorage` and `preact` are matched
  as bare words**, so they cannot appear in a comment either.
- `lib/scenario/edits.ts` holds every immutable scenario edit. Both stores are three lines over it:
  hold the scenario, call one of these, keep what comes back. Persistence is *not* there, because
  `lib/` may not see browser storage.
- `lib/format`, `lib/diagram` and `lib/wizard` are there for the same reason — two apps needed them.
- `normalise()` in `lib/scenario/edits.ts` is the compatibility layer for saved scenarios (browser
  storage and exported JSON). A rename that silently drops metrics would under-count, which is the
  one failure this tool cannot have — migrate the old value there and test it.
- **Both apps read the same storage key**, so a scenario started in one opens in the other. That is
  deliberate; it is also why `normalise` has to cope with either app's output.
- **A test that reads source files has to find the repo first.** Tests run compiled, from
  `dist-test/test/`, where `resolve(__dirname, '..')` is `dist-test/` and there is not one `.ts` file
  to be found — two guards were passing on an empty string that way. Walk up to the `package.json`
  that has `lib/engine` beside it, as `test/engine.test.ts` does.

## Vocabulary, and what the code calls things

- A **series** is one named value over time (the industry says "datapoint"). A **measurement type**
  is the fragment carrying a set of series under one timestamp.
- **There is one rhythm.** A status or flag is a series read on an interval like any other; the
  `state` kind and its on-change cadence are gone (CONCEPT.md §4.4). `normalise` converts a saved
  one, `perDay` becoming `86400 / perDay` seconds, so the message count is untouched — get that
  conversion wrong and a reloaded scenario is quoted at seventy times its volume.
- What replaced the structural guarantee is **L2**: a warning when a series whose name reads as a
  status is sampled faster than every 15 minutes. `looksLikeFlag` in `lib/engine/types.ts` is the
  predicate, and it reads the name, so it is advice — no figure depends on it.
- The metric kinds are `continuous | occurrence | condition | inventory | command`. `'fact'` was the
  old name for `inventory`, `'state'` the old flag kind; both are still accepted on load.

## Strings, and the two languages

- **No prose in a component.** Every user-visible string lives in `lib/i18n/en.ts` (the source of
  truth) with a German twin in `de.ts`, typed `Record<Key, string>` so a missing translation is a
  compile error. The standalone app calls `t('key')`, `<Rich k="key" />` for one marked-up string,
  or `<Prose k="key" />` for paragraphs; the Web SDK app calls `{{ 'key' | t }}`,
  `<c8y-mc-rich k="key" />` and `<c8y-mc-prose k="key" />`. Same catalogue, same keys, same markup.
- The `t` pipe is **impure**, because the thing that changes is the session's locale and that is not
  an argument to anything. Each instance caches its last answer, so the cost is one comparison per
  binding per change detection pass.
- The catalogue's markup is `**bold**`, `*emphasis*`, `` `code` `` and a blank line between
  paragraphs. Punctuation is literal — em dashes and curly quotes, not HTML entities.
- **Prose says "create" and "update", never `POST` and `PUT`.** The reader being taught is modelling
  a fleet, not writing the client. The one place the verb survives is the payload panel's request
  line (`POST /measurement/measurements`), which comes from `lib/engine/payload.ts` and is the
  actual call a developer makes — API surface, like the REST paths beside it.
- **Short.** A teaching paragraph earns its length by changing a number or preventing a mistake; an
  illustration that restates the paragraph above it does not. Avoid a coy headline that withholds
  the point ("this one costs more than it looks") — state the point ("one command is more than one
  message"). The bodies were cut by about a third in one pass; do not grow them back.
- Engine-side prose travels as keys plus parameters, never as sentences: `Finding.titleKey`,
  `PayloadExample.noteKeys`, `LineItem.helpKey`, `Seed.blurbKey`.
- **What stays English** (`NOT_TRANSLATED` in `lib/i18n/index.ts`): Configurator row labels and
  units, counter names, the metric catalogue, REST paths, and the generated workbook, which reads
  the English catalogue directly rather than keeping a second copy of it.
- Numbers and month names come from `Intl` via `lib/format`, which holds the session locale as
  module state — `setFormatLocale` — so `n()` and `compact()` did not each grow a parameter. **In
  the Angular app that module state is invisible to signals**: a `computed()` that formats a number
  without also calling `t()` has to read `locales.locale()` to say so, or it will not re-run when
  the language changes. There is a comment saying this in `contract.component.ts`.
- The Web SDK app has **no language switch**. The user picked a language in their Cumulocity
  profile; `LocaleService` follows the shell's `TranslateService` and maps anything that is not
  German to English.
- `test/i18n.test.tsx` enforces the rest: no empty or copy-pasted German, matching placeholders, no
  dead keys, and no English function words left on a German render of any step. The dead-key scan
  reads every `.ts`/`.tsx` under `src/` and `lib/` **except paths containing `/i18n/`** — so a key
  used only inside `src/c8y/app/i18n/` does not count as used, and would be reported dead.
- **German runs about a fifth longer than English**, so a new string in a fixed-width row is a layout
  change: snapshot the German render too. The top bar is the tight one — it is capped at 1240 px and
  already wrapped once.

## Docs, and keeping the cost of a change down

- **CONCEPT.md** is the design doc: bump the rev line and say what changed when the design does, not
  when an implementation detail does. **README.md** is orientation for a new reader.
- **No step ordinals outside the wizard table in CONCEPT.md §6.** That table's `Key` column
  (`fleet`, `series`, `discrete`, `contract`, `results`) is the stable handle: code
  comments name the component, tests are named after the key, prose names the screen. Reordering the
  wizard should touch `steps.ts` and one table row.
- **No counts that go stale in docs** — test totals, finding totals, line counts. They are a
  mandatory edit on every change and nobody acts on them.
- **An input is asked once, in the place it is used.** Two steps merged because one asked for a
  quantity per contract period while the next was where periods were created.
- Comments in this repo say *why*, at length, where the reasoning is not obvious from the code. Match
  that when editing them; do not add a comment that only restates the line beneath it.

## Known unknowns

- **No tenant.** The upload path is unverified, and the Web SDK app has never been rendered by
  anything: it cannot boot without a Cumulocity instance to fetch its options from. It compiles and
  it type-checks; that is the whole of what is known about it.
- The storage model's bytes-per-value figures are rules of thumb marked "to be verified" at source,
  and the tool reports the range rather than a midpoint on purpose (`lib/engine/storage.ts`).
- Nobody has confirmed where a live tenant reports the nine counters for a past calendar month. That
  gates any ground-truth test and any pre-fill.
