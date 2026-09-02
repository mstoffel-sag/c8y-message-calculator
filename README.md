# Cumulocity Message Calculator

Estimates **messages per calendar month** from a description of a fleet. Volume only: no prices, no
billable units. The commit-to-consume commitment is computed in *quantities* and multiplied by prices
the file does not contain. See [CONCEPT.md](CONCEPT.md) for the design and the reasoning.

First draft. Runs locally, and packages into a zip a Cumulocity tenant will host.

## Run it

Node 20 or newer.

```
npm install
npm run dev      # http://127.0.0.1:5173  -- rebuilds on save
```

```
npm test         # the engine, the cell map, the xlsx writer, and a render pass over every step
npm run typecheck
npm run build    # static bundle in dist/
npm run package  # dist-package/message-calculator-<version>.zip, ready to upload
```

## Deploy it to a Cumulocity tenant

```
npm run package
```

Then in the tenant: **Administration → Ecosystem → Applications → Add application →
Upload web application**, drop the zip, and open `/apps/message-calculator/`.

The manifest is [cumulocity.json](cumulocity.json) at the repo root. The platform's only
structural requirement is that `index.html` and `cumulocity.json` sit in the **root** of the
zip, not inside a folder -- so the archive is built from the contents of `dist/`, and
`npm run package` fails rather than shipping a zip that would install and then 404.

| Field | Why it is what it is |
|---|---|
| `"type": "HOSTED"` | The platform serves the files itself. A plain static bundle qualifies; nothing here needs Angular or `@c8y/ngx-components`. |
| `"contextPath"` | Becomes the URL: `/apps/message-calculator/`. |
| `"key"` | Must be unique in the tenant. Change it before uploading a second copy alongside the first. |
| `"availability": "PRIVATE"` | One tenant only. `"MARKET"` would offer it to subtenants, which is a decision about who may see the tool, not a build setting. |
| `"noAppSwitcher": false` | It appears in the application switcher. |
| `"version"` | Stamped from `package.json` at build time, so there is one place to bump. |

Three things that make this work without a rewrite:

- **Every asset path is relative** -- `app.js`, `styles.css`, `fonts/`. An absolute `/styles.css`
  resolves against the tenant root, not the app, and 404s.
- **Public Sans is self-hosted**, so nothing depends on reaching a font CDN from inside a tenant.
- **Nothing calls the platform.** All arithmetic is in the browser, so the app needs no
  `requiredRoles`, no auth handling and no microservice. Cumulocity still gates `/apps/...`
  behind tenant login, so the page is only reachable by someone with an account.

What this deployment does *not* give you: the Cumulocity navigator and app shell. The app draws
its own header, because it is a static bundle rather than an `@c8y/ngx-components` app. That is
the trade for shipping today, and the reason CONCEPT.md section 8 keeps `/lib` framework-free --
when the Angular shell is wanted, `/lib` moves across and only `/src/ui` is rewritten.

### The zip

`scripts/package.mjs` reuses the store-only zip writer from `lib/xlsx/zip.ts` -- the one the Excel
export already depends on -- rather than adding a second implementation that can drift. Entries are
stored, not deflated, so the archive is about the size of `dist/` (330 kB). The source map is left
out: it is the largest file in the build and nothing in a tenant reads it.

If `node` is not on your PATH but nvm is installed:

```
export PATH="$HOME/.nvm/versions/node/v20.18.2/bin:$PATH"
```

## What is here

```
lib/engine/       the arithmetic. No framework, no DOM, no SDK -- this is the half that ports.
  types.ts        Scenario / MachineType / Metric / Bundle, and the nine counters in D28:D36 order
  calendar.ts     real month lengths; billing is per calendar month, so February is 28 days
  compute.ts      the nine counters, per machine type, per real month, plus the naive baseline
  bundling.ts     the proposal: one measurement per sampling interval
  lint.ts         L1-L10, each quantified where it can be
  payload.ts      the JSON a device should actually send, per bundle and per on-change metric
  configurator.ts every Configurator line item and the cell it lives in, per period
  diagram.ts      the measurement view the configuration diagram is drawn from
  summary.ts      a machine type in one line: what it is made of, and what it sends
  workbook.ts     the downloadable workbook: quantities, and a Quote sheet with empty price cells
lib/xlsx/         a dependency-free .xlsx writer: zip.ts (store-only ZIP) + writer.ts
lib/presets/      five machine archetypes, each built the way the tool recommends
src/ui/Machine.tsx  the collapsible machine-type block, and the summary its header carries
src/ui/collapse.ts  which machine types are folded -- a viewer preference, never scenario data
src/ui/styles.css the Cumulocity design tokens, and this app's semantic layer over them
src/ui/fonts/     Public Sans, self-hosted -- a tenant may not reach a font CDN
src/ui/wizard/    the five steps and the hand-off table
lib/i18n/         every word the user reads, in English and German
test/             the CONCEPT.md section 9 acceptance test, and a render pass over every step
tools/xlsx_dump.py  stdlib-only .xlsx reader, used to read the Sales Configurator
```

## The wizard

| Step | Asks |
|---|---|
| 1 Machines | machine types, counts, online %, and what each machine talks — a protocol list you can always escape. Descriptive: no counter reads it. |
| 2 Measurements | one row per series; its rhythm — on a timer, or when the value moves — is a column. Timed series are grouped by interval into one measurement type each, as you type, and that type's fragment name is editable in the row. Splitting one out creates its own measurement type there and then; an on-change series always travels alone — the row says why, and still lets you name the type it sends in. |
| 3 Events, alarms, inventory & commands | everything that is not a measurement, one panel each. Commands close the step, with the status-transition count, because the contrast between three inbound elements and one outbound one is the thing being taught |
| 4 Contract & deployment | periods, the ramp and the calendar, then every Configurator line item the fleet cannot imply — one column per period, right under the table that decides how many periods there are |
| 5 Results | messages per calendar month, the cell each number goes in, the operational-storage range, the CTC commitment in billable units, and an Excel download |

### English and German, from one catalogue

Every word the user reads comes from `lib/i18n`, and the language switch is in the top bar. `en.ts`
is the source of truth; `de.ts` is typed against it, so a string added without a translation does
not compile. The prose keeps its emphasis through four marks the catalogue understands —
`**bold**`, `*emphasis*`, `` `code` ``, and a blank line for a paragraph — rather than through JSX
that no translator can retype.

Four things stay English in both languages, because they are not really UI text: **Configurator row
labels** and their unit column (they name a row in an English workbook), **counter names**
(`Measurements Created` is what a tenant reports), the **metric catalogue** (a chosen name becomes
scenario data and travels into fragment names, payloads and the workbook), and the **generated
workbook** itself. Numbers and month names come from `Intl`.

### Operational storage is a range, not a number

The Results step and a `Storage` sheet in the workbook estimate the Operational Data Store from the
values the fleet writes: **100–400 bytes per stored value** in MongoDB, held for the tenant's
**retention period**, plus a **DataHub extract at 20–25 %** of that. Both figures come from
`StorageCalculation.txt` and both are marked "to be verified" at source, so both ends of the range
are always shown and no midpoint ever is.

The Configurator's ODS cell (`D37`) is filled in from it, at the assumed bytes per value — **400 B by
default, the top of the range**, because under-stating usage on a commit-to-consume contract depletes
the commitment early rather than saving anything. The note beside the cell carries the whole range,
and typing a figure in the deployment panel overrides it.

The retention period is walked backwards through the months the ramp produced, so a fleet three
months into a rollout is not credited with a full period of history, and storage keeps climbing after
the message count has levelled off.

### Styling follows the Cumulocity design system

`src/ui/styles.css` opens with the `--c8y-*` tokens copied verbatim from the styleguide bundle
(`cumulocity.com/codex/styles.css`, the `:root,.c8y-light-theme` and `.c8y-dark-theme` blocks):
the palette ramps, Public Sans at a 14px base, the 8px spacing unit, square geometry with 4px only
on buttons, and the elevation shadows. Underneath, a short semantic layer (`--ink`, `--line`,
`--accent` ...) maps onto them, so retargeting the whole app is a token edit rather than a sweep.

Three departures, each marked in the file:

- **Green text is green-30, not the brand green-40.** `#119d11` on white is 3.6:1 -- right for a
  border, short of AA for a 12px label. `#0f880f` is 4.6:1. Fills and borders still use the brand.
- **Headings are 600, not the token's 500.** The shipped font has 400/600/700 faces only, so a
  500 request resolves down to 400 and every heading flattens into its body text.
- **Status colours darken when they carry text.** Same ramp, one step down.

WCAG 2.2 AA is the design system's own baseline, which is what these three are in service of.

Both themes come from the real blocks, so dark mode inverts the gray ramp and steps the brand up to
green-60 -- and `--on-brand` flips with it, because white on a light-green button is unreadable.

### Machine types fold

Measurements and the elements step both edit the same machine types from
different angles, so past two types either of them was a page nobody reads. Each block is a `<details>`
whose `<summary>` carries what is inside it and what it costs:

```
▸ Rooftop HVAC unit  1,000 machines    4 time series, 2 states, 1 event, 1 alarm,               46 M
                                       1 inventory entry, 1 command · every 1 min ·      MESSAGES / MONTH ·
                                       3 measurement types                              45,977 PER MACHINE
                                       Measurements 45.9 M · Events 31 k · Alarms 31 k
```

`machineTypeSummary` in the engine produces every figure there, and the
one-line machine description on the Machines step comes from the same call -- so
the two cannot drift. Two things it gets right that the old hand-rolled line did
not:

- **A state is its own measurement.** It cannot join an interval bundle without
  making that bundle's series set vary, so the section 9 HVAC unit sends three
  measurements, not one. The count now matches the diagram directly beneath it.
- **The parts come before the measurement count.** "10 datapoints in 3
  measurement types" would be false -- the event, alarm, inventory entry and
  command are not in a measurement at all.

Figures are per `REFERENCE_DAYS` (31) month at the type's own count and online
percentage, which is deliberately *not* the peak-month total in the header: this
one has to compare like with like between machine types. `summary.total` for the
section 9 HVAC unit is 45,977,000, the acceptance number for a 31-day month,
and a test pins it there rather than to a second implementation.

Inside the elements step the same block appears once per element, so `only` narrows
the summary to that element -- the alarms panel summarises alarms. Which is
folded lives in `collapse.ts`: localStorage, shared across the three steps by
machine type id, and pruned to ids the scenario still has, because those ids come
off a counter and a stale one would fold an unrelated type in a later session.

### The engine is the part that matters

`lib/` imports nothing but itself. The eventual target is an Angular app built with `c8ycli` and
`@c8y/ngx-components` (CONCEPT.md section 8); this draft uses preact so it could be built and clicked
today rather than after a framework install. When the real app is scaffolded, `lib/` moves across
unchanged and only `src/ui/` is rewritten.

Invariants worth not breaking:

- **`COUNTER_KEYS` is a contract.** Index 0 is `D28`, index 8 is `D36`. The results table pastes into
  the Configurator in that order.
- **`Metric.bundleId` is authoritative** for bundle membership. `Bundle.metricIds` supplies display
  order only, so a scenario imported with the two out of step still computes predictably.
- **Configurator period blocks are 30 rows apart.** `cellFor(baseRow, period)` is the only place that
  knows it, so period 2's Measurements Created is `D58` without anyone counting rows. The workbook
  itself lays periods out **side by side**, one column each, with the rows kept at the Configurator's
  period-1 addresses so column D still pastes cell for cell.
- **The commitment stops one multiplication short.** `commitment.ts` produces billable units over the
  term; the Quote sheet multiplies them by a price column that ships empty. A commit-to-consume total
  therefore exists in the file and never in the tool.
- **Price columns, never price values.** The Quote sheet in the download has a shaded unit-price
  column and computes its own totals, but every one of those cells ships empty: the salesperson types
  the numbers after the customer sends the file back. That is what keeps the constraint intact --
  the tool holds no price list, so the file cannot carry one. Tested.
- **No prices, anywhere.** `lib/` and `src/` carry line item names, units and cell addresses only.
  There is a test that greps for currency symbols and the word "price"; it is not decoration. The
  downloadable workbook is checked the same way, because it is the artefact most likely to be mailed
  to a customer.
- **Every workbook row needs a cell in column A.** A row whose cells all start at column B or later
  does not render in macOS QuickLook -- the grid appears and the content does not. These sheets keep
  column A as a spacer so B/C/D line up with the Configurator, so `anchorColumnA` in
  `lib/xlsx/writer.ts` emits an empty anchor cell instead. Tested; do not "tidy it away".

### The acceptance test

`test/engine.test.ts` reproduces CONCEPT.md section 9 line by line: 1,000 rooftop HVAC units at
**45,977,000** messages in a 31-day month, **41,528,000** in February, against a naive baseline of
**267,937,000**. If those numbers move, either the concept changed or the engine is wrong -- and the
point of writing them down is that nobody has to guess which.

## Not done

- No tenant deployment: no `cumulocity.json`, no `c8ycli`, no `@c8y/ngx-components`.
- Persistence is `localStorage`, not managed objects.
- No i18n, no A/B scenario comparison, no pre-fill from tenant statistics.
- One open question, which the engine cannot answer for itself: **where does a live tenant report
  these nine counters for a past calendar month?** Until that is known, the arithmetic is unvalidated
  against reality -- it is only validated against the concept.
