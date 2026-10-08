# Developing the Message Calculator

How the tool is built, tested and laid out. For what it does and how to use or deploy it, see
[README.md](README.md); for why it works the way it does, [CONCEPT.md](CONCEPT.md).

## Two builds, one engine

| Build | What it is | Where it runs |
|---|---|---|
| **Web SDK** (`src/c8y`) | An Angular 21 application on `@c8y/ngx-components`, inside the Cumulocity shell — navigator, header, branding, login and language all the platform's | A tenant |
| **Standalone** (`src/ui`) | A preact bundle that draws its own frame and needs no backend at all | Anywhere: a laptop, a share, a tenant, GitHub Pages |

Everything that decides a number is in `lib/` and is shared: the engine, the string catalogue, the
scenario edits, the formatters, the diagram geometry, the workbook writer. The two `src/` folders
are the drawing, and nothing else. **A change to behaviour is a change to both apps**; logic written
twice belongs in `lib/`.

The Web SDK build cannot be published to GitHub Pages: it fetches a tenant's options before Angular
starts, so it has nothing to boot against outside Cumulocity.

## Commands

**Node 20.19 or newer** — Angular 21 will not start on anything older. If nvm is installed:

```
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
npm install
```

Shared by both builds:

```
npm test               # the engine, the quote, the cell map, the xlsx writer, a render pass over every step
npm run typecheck      # the standalone app and lib/
```

The standalone build:

```
npm run dev            # http://127.0.0.1:5173 -- rebuilds on save
npm run build          # static bundle in dist/
npm run package        # dist-package/message-calculator-standalone-<version>.zip
npm run package:html   # the same thing as one .html file -- no server, no install
```

The Web SDK build:

```
npm run c8y:typecheck  # ngc, including the templates -- see the warning below
npm run c8y:start      # dev server; add -- -u https://<tenant>.cumulocity.com
npm run c8y:build      # dist-c8y/message-calculator/ and message-calculator.zip
npm run c8y:deploy     # builds and uploads it, given -- -u <url> -U <user>
```

> **`npm run c8y:build` does not type-check anything.** The devkit builds with `aot: false` and
> transpiles TypeScript through babel, so a type error and a broken template both compile
> perfectly. `npm run c8y:typecheck` is the one that runs the Angular compiler. Run it.

`npm test`, `npm run typecheck` and `npm run c8y:typecheck` all pass before a change is done.

### Releasing

1. Bump `version` in `package.json` **and** `cumulocity.json` (the standalone manifest — it is easy
   to miss), then `npm install --package-lock-only`.
2. Run the three checks above.
3. Merge to `main`. `.github/workflows/pages.yml` runs the tests and the typecheck again and
   publishes the standalone build to GitHub Pages.
4. `npm run package && npm run package:html`, then `gh release create v<version>` with the two files
   from `dist-package/` attached.

### The single-file build

`package:html` inlines the stylesheet, the fonts and the bundle into one page that runs from a
double-click. One thing is known to differ from a served copy: `navigator.clipboard` does not exist
outside a secure context, so every copy button takes the `document.execCommand` path instead
(`src/ui/format.ts` says why). The saved-scenario library is browser storage, and browsers disagree
about what a `file://` page may keep. Nothing breaks either way — every read and write is wrapped,
and a refusal just means the session is not remembered — but **which browsers remember it has not
been tested.**

### The zips

Both builds are hosted web applications: a zip with `index.html` and `cumulocity.json` in its
**root**. The manifests are [cumulocity.config.ts](cumulocity.config.ts) (Web SDK) and
[cumulocity.json](cumulocity.json) (standalone). A `contextPath` is unique in a tenant, so the two
cannot share one: the Web SDK build takes `message-calculator`, the standalone build is suffixed.

`scripts/package.mjs` reuses the store-only zip writer from `lib/xlsx/zip.ts` — the one the Excel
export already depends on — rather than a second implementation that can drift. Entries are stored,
not deflated. The source map is left out: it is the largest file in the build and nothing in a
tenant reads it. The Web SDK build's zip is the devkit's own.

What makes either build work in a tenant without a rewrite:

- **Every asset path is relative.** An absolute `/styles.css` resolves against the tenant root, not
  the app, and 404s.
- **Nothing calls the platform.** All arithmetic is in the browser, so the app needs no
  `requiredRoles`, no auth handling and no microservice.
- **The standalone build self-hosts Public Sans**, so nothing depends on reaching a font CDN from
  inside a tenant. The Web SDK build uses the platform's own fonts.

What the Web SDK build gets that the standalone one cannot: the shell — navigator, header, user
menu, tenant branding, the dark theme, and the language from the user's profile (so it has no
language switch of its own). `@c8y/style` replaces hand-copied design tokens with the real package,
the step rail becomes `c8y-stepper`, and copying raises a platform toast. What it costs: a zip about
fifteen times the size, and a toolchain.

## What is here

```
lib/engine/       the arithmetic. No framework, no DOM, no SDK.
  types.ts        Scenario / MachineType / Metric / Bundle, and the nine counters in D28:D36 order
  calendar.ts     real month lengths; billing is per calendar month, so February is 28 days
  compute.ts      the nine counters, per machine type, per real month, plus the naive baseline
  bundling.ts     the proposal: one measurement per sampling interval
  storage.ts      operational storage per month-end, by retention window
  commitment.ts   what each period is quoted at, and the term: periodQuotes, termQuote
  lint.ts         L1-L10, each quantified where it can be
  payload.ts      the JSON a device should actually send
  configurator.ts every Configurator line item and the cell it lives in, per period
  diagram.ts      the measurement view the configuration diagram is drawn from
  summary.ts      a machine type in one line: what it is made of, and what it sends
  workbook.ts     the downloadable workbook: quantities, and a Quote sheet with empty price cells
lib/xlsx/         a dependency-free .xlsx writer: zip.ts (store-only ZIP) + writer.ts
lib/presets/      five machine archetypes, each built the way the tool recommends
lib/i18n/         every word the user reads, in English and German
lib/scenario/     every immutable edit to a Scenario, and normalise() for saved ones
lib/format/       every number, duration and month name, in the session's language
lib/diagram/      the two SVG diagrams' geometry -- shared by both renderers and by the tests
lib/wizard/       the five steps, in order. The only statement of order anywhere

src/c8y/          the Web SDK app (Angular 21 + @c8y/ngx-components)
  app/app.config.ts        hookNavigator + hookRoute: where it attaches to the shell
  app/scenario.store.ts    one signal, and everything on screen computed from it
  app/i18n/                lib/i18n wired into Angular: a `t` pipe, and the catalogue's markup
  app/controls/            the shared fields, over @c8y/style's form markup
  app/wizard/              the c8y-stepper and the five steps
  app/results/             the quote, the hand-off table, the result panels, findings, payloads
  app/diagram/             the explainer and the configuration diagram
  styles.css               only what the design system does not draw

src/ui/           the standalone app (preact)
  Quote.tsx       the quote table the results page leads with
  Machine.tsx     the collapsible machine-type block, and the summary its header carries
  collapse.ts     which machine types are folded -- a viewer preference, never scenario data
  styles.css      the Cumulocity design tokens copied by hand, and a semantic layer over them
  fonts/          Public Sans, self-hosted -- a tenant may not reach a font CDN
  wizard/         the five steps and the hand-off table

test/             see "How the numbers are tested"
tools/            render_step.mjs (snapshot a step), xlsx_dump.py (read an .xlsx, stdlib only)
```

## How the numbers are tested

- **`test/engine.test.ts`** reproduces CONCEPT.md section 9 line by line: 1,000 rooftop HVAC units at
  **45,977,000** messages in a 31-day month, **41,528,000** in February, against a naive baseline of
  **179,897,000**. If those numbers move, either the concept changed or the engine is wrong — and
  writing them down means nobody has to guess which. It also holds the counting rules (an alarm is
  two messages, a command one plus one per transition), registration following the ramp, and the
  storage model.
- **`test/quote.test.tsx`** holds the figures the results page leads with three ways: a two-period
  ramp worked out **by hand** in the comments, so an error the engine shares with its own tests
  cannot pass; **screen against workbook**, with the Quote sheet's formulas evaluated against its own
  cells; and **300 seeded generated fleets** checked against the quote's promises — whole units,
  never below a month the fleet sends or stores, under one unit above the busiest, the term equal to
  the periods added up.
- **`test/workbook.test.ts`** checks the workbook's content and that it is a real archive, and
  enforces the one hard constraint: every price cell empty, every money cell a formula with a zero
  cached value, and no currency anywhere in the XML.
- **`test/ui.smoke.test.tsx`** renders every step of the standalone app; **`test/i18n.test.tsx`**
  keeps the German complete and the catalogue free of dead keys.

The Web SDK app cannot be rendered outside a tenant, so it is covered by `c8y:typecheck` and by
sharing `lib/` with the app that is rendered.

To look at a layout change rather than reason about it:

```
node tools/render_step.mjs <step> <out.html> [scrollPx] [en|de] [scenarios] [light|dark] [on|off]
qlmanage -t -s 1100 -o /tmp <out.html>    # WebKit snapshot, macOS
```

## Notes on the design

### English and German, from one catalogue

Every word the user reads comes from `lib/i18n`. `en.ts` is the source of truth; `de.ts` is typed
against it, so a string added without a translation does not compile. Prose keeps its emphasis
through four marks the catalogue understands — `**bold**`, `*emphasis*`, `` `code` ``, and a blank
line for a paragraph — rather than through markup no translator can retype.

Four things stay English in both languages, because they are not really UI text: **Configurator row
labels** and their units (they name a row in an English workbook), **counter names**
(`Measurements Created` is what a tenant reports), the **metric catalogue** (a chosen name becomes
scenario data and travels into fragment names, payloads and the workbook), and the **generated
workbook** itself. Numbers and month names come from `Intl`.

### Operational storage

The estimate counts the **documents** the fleet writes, kept for as long as the tenant's
**retention rules** keep them: **95 bytes a measurement, 1.7 kB an event, 2.7 kB an alarm**, plus a
**DataHub extract at 20–25 %** of that. The byte figures were measured across 7,472 tenants; the
DataHub share is still a rule of thumb. The per-tenant spread is wide, so Expert mode always shows
both ends of the range.

- **Bytes follow the document, not the reading.** A measurement carrying ten series is stored once,
  so bundling cuts storage as well as the message count.
- **Billed per month-end, rounded up to a whole GiB.** It is quoted like messages: the period's
  fullest month, times its months — never below what the fleet will use. The Configurator's ODS cell
  (`D37`) carries that one month; the Configurator multiplies it by the months.
- **Retention is a rule per type**, asked on the row that owns the type, over a scenario default on
  the Contract step. Each window is walked backwards through the months the ramp produced, so a
  fleet three months into a rollout is not credited with a full window of history.
- **An alarm** bills twice per incident and stores once; **an operation** bills three or four times
  and stores once; **inventory** overwrites in place and has no retention, so every registered device
  counts until it is deleted.

A stated ODS figure saved before scenario format 2 was GiB-months; `normalise()` converts it.

### Styling follows the Cumulocity design system

In the Web SDK build it follows it by loading it: `@c8y/style/main.scss` is a global style in
`angular.json`, and `src/c8y/styles.css` holds only what the design system does not draw — the SVG
diagrams, the teaching boxes, the stat tiles, the machine-type disclosure and the findings list. Its
colours are all `--c8y-palette-*`, so tenant branding and the dark theme reach the diagrams.

The standalone build has no design system to load, so it copies one. `src/ui/styles.css` opens with
the `--c8y-*` tokens copied verbatim from the styleguide bundle (`cumulocity.com/codex/styles.css`,
the light and dark theme blocks), with a short semantic layer (`--ink`, `--line`, `--accent` …) over
them. Three departures, each marked in the file, all in service of WCAG 2.2 AA:

- **Green text is green-30, not the brand green-40**, which is short of AA for a 12px label.
- **Headings are 600, not the token's 500.** The shipped font has 400/600/700 faces only.
- **Status colours darken when they carry text.** Same ramp, one step down.

### Machine types fold

Measurements and the elements step edit the same machine types from different angles, so each
machine type is a `<details>` block whose summary carries what is inside it and what it costs.
`machineTypeSummary` in the engine produces every figure there, and the one-line description on the
Machines step comes from the same call, so the two cannot drift. Figures are per `REFERENCE_DAYS`
(31) month, deliberately not the peak-month total, so machine types compare like with like. Which
blocks are folded lives in `collapse.ts` — browser storage, keyed by machine type id, pruned to ids
the scenario still has.

### Invariants worth not breaking

- **`COUNTER_KEYS` is a contract.** Index 0 is `D28`, index 8 is `D36`. The hand-off table pastes
  into the Configurator in that order.
- **`Metric.bundleId` is authoritative** for bundle membership. `Bundle.metricIds` supplies display
  order only, so a scenario imported with the two out of step still computes predictably.
- **Configurator period blocks are 30 rows apart.** `cellFor(baseRow, period)` is the only place that
  knows it. The workbook itself lays periods out side by side, one column each, with rows at the
  Configurator's period-1 addresses so column D still pastes cell for cell.
- **The commitment stops one multiplication short.** `commitment.ts` produces quantities over the
  term; the Quote sheet multiplies them by a price column that ships empty. A commit-to-consume
  total therefore exists in the file and never in the tool.
- **No prices, anywhere.** `lib/` and `src/` carry line item names, units and cell addresses only,
  and tests grep the rendered UI and the workbook XML to keep it that way.
- **Every workbook row needs a cell in column A.** A row whose cells all start at column B or later
  does not render in macOS QuickLook. `anchorColumnA` in `lib/xlsx/writer.ts` emits an empty anchor
  cell. Tested; do not tidy it away.
- **`normalise()` is the compatibility layer** for saved scenarios. A rename or a change of meaning
  that silently drops or inflates a figure is the one failure this tool cannot have — migrate the
  old value there and test it.

## Not done

- **Little is verified inside a tenant.** The Web SDK build deploys with `c8y:deploy` and its files
  land, but no test covers anything inside a tenant, and the standalone zip has not been checked
  there. Treat runtime behaviour in a tenant as lightly verified.
- Persistence is browser storage in both builds, not managed objects — so a scenario belongs to a
  browser rather than to a tenant, and cannot be shared by sending a link.
- No A/B scenario comparison, and no pre-fill from tenant statistics. The Web SDK build is where that
  becomes possible, because it has an authenticated `@c8y/client` to hand; it does not use it.
- Billable **Messages** is known to be the sum of seven tenant statistics, rounded up to whole 100K
  units per tenant per month. What is still unvalidated is a whole scenario end to end: no modelled
  fleet has been compared with the same fleet's real counters.
