# Cumulocity Message Calculator

Estimates **messages per calendar month** from a description of a fleet. Volume only: no prices, no
billable units. The commit-to-consume commitment is computed in *quantities* and multiplied by prices
the file does not contain. See [CONCEPT.md](CONCEPT.md) for the design and the reasoning.

First draft. There are **two builds of the same tool**, from one engine:

| Build | What it is | Where it runs |
|---|---|---|
| **Web SDK** (`src/c8y`) | An Angular application on `@c8y/ngx-components`, inside the Cumulocity shell -- navigator, header, branding, login and language all the platform's | A tenant |
| **Standalone** (`src/ui`) | A 345 kB preact bundle that draws its own frame and needs no backend at all | Anywhere: a laptop, a share, a tenant |

Everything that decides a number is in `lib/` and is shared: the engine, the string catalogue, the
scenario edits, the formatters, the diagram geometry, the workbook writer. The two `src/` folders
are the drawing, and nothing else.

## Run it

**Node 20.19 or newer** -- Angular 21 will not start on anything older, and the repo's own default
(`v20.18.2`) is just below that line. If nvm is installed:

```
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
```

```
npm install
```

Shared by both builds:

```
npm test         # the engine, the cell map, the xlsx writer, and a render pass over every step
npm run typecheck
```

The standalone build:

```
npm run dev      # http://127.0.0.1:5173  -- rebuilds on save
npm run build    # static bundle in dist/
npm run package  # dist-package/message-calculator-standalone-<version>.zip
```

The Web SDK build:

```
npm run c8y:typecheck   # ngc, including the templates -- see the warning below
npm run c8y:start       # dev server; add -- -u https://<tenant>.cumulocity.com
npm run c8y:build       # dist-c8y/message-calculator/ and message-calculator.zip
npm run c8y:deploy      # uploads it, given -- -u <url> -U <user>
```

> **`npm run c8y:build` does not type-check anything.** The devkit builds with `aot: false` and
> transpiles TypeScript through babel, so a type error and a broken template both compile
> perfectly. `npm run c8y:typecheck` is the one that runs the Angular compiler. Run it.

## Deploy it to a Cumulocity tenant

Both builds are hosted web applications: a zip with `index.html` and `cumulocity.json` in its
**root**, uploaded at **Administration → Ecosystem → Applications → Add application → Upload web
application**.

| | Web SDK build | Standalone build |
|---|---|---|
| Build | `npm run c8y:build` | `npm run package` |
| Zip | `dist-c8y/message-calculator.zip` | `dist-package/message-calculator-standalone-<version>.zip` |
| Manifest | [cumulocity.config.ts](cumulocity.config.ts) | [cumulocity.json](cumulocity.json) |
| Opens at | `/apps/message-calculator/` | `/apps/message-calculator-standalone/` |
| Size | ~7 MB | ~450 kB |

**Two manifests, two identities.** A `contextPath` is unique in a tenant, so the two builds cannot
both be `message-calculator`. The Web SDK build takes the plain name because it is the one meant to
live in a tenant; the standalone build is suffixed. Upload either, or both -- they are the same tool
and they read the same `localStorage` key, so a scenario started in one is there in the other.

The Web SDK build can also be deployed without the browser:

```
npm run c8y:deploy -- -u https://<tenant>.cumulocity.com -U <user>
```

Four things that make either build work without a rewrite:

- **Every asset path is relative.** An absolute `/styles.css` resolves against the tenant root, not
  the app, and 404s.
- **Nothing calls the platform.** All arithmetic is in the browser, so the app needs no
  `requiredRoles`, no auth handling and no microservice. Cumulocity still gates `/apps/...` behind
  tenant login, so the page is only reachable by someone with an account.
- **The standalone build self-hosts Public Sans**, so nothing depends on reaching a font CDN from
  inside a tenant. The Web SDK build uses the platform's own fonts and does not ship any.
- **No prices anywhere**, which is what makes one artifact safe for a tenant, a prospect and a
  public share alike (CONCEPT.md section 1).

### What the Web SDK build gets that the standalone one cannot

The shell. The left navigator, the header bar, the user menu, tenant branding, the dark theme, and
the language the user picked in their own profile -- the calculator has no language switch of its
own there, because the platform already asked. `@c8y/style` replaces 700 lines of hand-copied
design tokens with the real package, the step rail becomes `c8y-stepper`, and copying the nine
counters raises a platform toast instead of relabelling its own button.

What it costs: **7 MB against 450 kB**, and a toolchain. CONCEPT.md section 8 said that number could
only be measured rather than read off a manifest; it has now been measured.

### The zip

`scripts/package.mjs` (standalone) reuses the store-only zip writer from `lib/xlsx/zip.ts` -- the one
the Excel export already depends on -- rather than adding a second implementation that can drift.
Entries are stored, not deflated, so the archive is about the size of `dist/`. The source map is left
out: it is the largest file in the build and nothing in a tenant reads it. The Web SDK build's zip is
the devkit's own, written by `@c8y/devkit:build`.

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
lib/i18n/         every word the user reads, in English and German
lib/scenario/     every immutable edit to a Scenario. Both apps' stores are three lines over this
lib/format/       every number, duration and month name, in the session's language
lib/diagram/      the two SVG diagrams' geometry -- shared by both renderers and by the test
lib/wizard/       the five steps, in order. The only statement of order anywhere

src/c8y/          the Web SDK app (Angular 21 + @c8y/ngx-components)
  app/app.config.ts        hookNavigator + hookRoute: where it attaches to the shell
  app/scenario.store.ts    one signal, and everything on screen computed from it
  app/i18n/                lib/i18n wired into Angular: a `t` pipe, and the catalogue's markup
  app/controls/            the shared fields, over @c8y/style's form markup
  app/wizard/              the c8y-stepper and the five steps
  app/results/             the hand-off table, the result panels, findings, payloads
  app/diagram/             the explainer and the configuration diagram
  styles.css               only what the design system does not draw: the diagrams and the tiles

src/ui/           the standalone app (preact)
  Machine.tsx     the collapsible machine-type block, and the summary its header carries
  collapse.ts     which machine types are folded -- a viewer preference, never scenario data
  styles.css      the Cumulocity design tokens copied by hand, and a semantic layer over them
  fonts/          Public Sans, self-hosted -- a tenant may not reach a font CDN
  wizard/         the five steps and the hand-off table

test/             the CONCEPT.md section 9 acceptance test, and a render pass over every step
tools/xlsx_dump.py  stdlib-only .xlsx reader, used to read the Sales Configurator
```

## The wizard

| Step | Asks |
|---|---|
| 1 Machines | machine types, counts, online %, and what each machine talks — a protocol list you can always escape. Descriptive: no counter reads it. |
| 2 Measurements | one row per series, and one question about each: how often it is read. A row can also stand for a **count** of series — 450 PLC tags on one scan is one row reading 450, not 450 rows — which is how a fleet nobody has a datapoint list for still gets estimated; a count over the platform's 100-series recommendation is sent as as many measurement types as that needs, and the row says so. A count does not assume the series share a message: the measurement type dropdown's third answer, **one measurement type per series**, models the agent that posts one datapoint per request, and the guidance panel then prices the bundling it is giving up. Series are grouped by interval into one measurement type each, as you type, and that type's fragment name is editable in the row. Splitting one out creates its own measurement type there and then. A status flag is a row like any other — the interval you give it is the rate you intend to read it at, and the tool warns if one is left on the fleet's fastest tick. |
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
values the fleet writes: **100–400 bytes per stored value** in MongoDB, kept for as long as the
tenant's **retention rules** keep them, plus a **DataHub extract at 20–25 %** of that. Both figures
come from `StorageCalculation.txt` and both are marked "to be verified" at source, so both ends of the
range are always shown and no midpoint ever is.

**Storage is billed on what the database holds at the end of each calendar month, captured every
month and added up over the contract period** — so the quantity is in **GiB-months**, and a
twelve-month period reads roughly twelve times what the database holds at any one time. It is
deliberately neither the fullest month, which would charge a year at the level it only reached in
month twelve, nor the last, which would under-state a fleet that shrank.

**Retention is a rule per type**, asked in a column on the row that owns the type: once per
measurement type in the measurements table, and on every row of the events, alarms and commands
tables, since each of those is a type of its own. A tenant keeping `acme_Climate` for 90 days and
`acme_Vibration` for 7 is the ordinary case. The scenario setting on the Contract step is the tenant
default, used by every type with no rule of its own.

Two elements behave differently and the tool says so. An **alarm** bills twice per incident — raise
and clear — and stores once, because the clear updates the document the raise created; an
**operation** bills three or four times and likewise stores once. And **inventory has no retention at
all**: a write overwrites the managed object in place, so nothing accumulates to age out, and a
managed object is not one of the types a retention rule covers — every device registered counts
towards storage until somebody deletes it.

The Configurator's ODS cell (`D37`) is filled in from all of this, at the assumed bytes per value —
**400 B by default, the top of the range**, because under-stating usage on a commit-to-consume
contract depletes the commitment early rather than saving anything. The note beside the cell carries
the whole range, and typing a figure in the deployment panel overrides it.

Each retention window is walked backwards through the months the ramp produced, so a fleet three
months into a rollout is not credited with a full window of history, and storage keeps climbing after
the message count has levelled off.

### Styling follows the Cumulocity design system

In the Web SDK build it follows it by loading it: `@c8y/style/main.scss` is a global style in
`angular.json`, so buttons, fields, tables and the page frame are the platform's own, and
`src/c8y/styles.css` is 400 lines holding only what the design system does not draw -- the two SVG
diagrams, the teaching boxes, the stat tiles, the machine-type disclosure and the findings list.
Its colours are all `--c8y-palette-*`, so tenant branding and the dark theme reach the diagrams
without that file knowing either exists.

The standalone build has no design system to load, so it copies one.
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
▸ Rooftop HVAC unit  1,000 machines    6 time series, 1 event, 1 alarm,                          46 M
                                       1 inventory entry, 1 command ·                  MESSAGES / MONTH ·
                                       every 1 min, every 72 min ·                     45,977 PER MACHINE
                                       3 measurement types
                                       Measurements 45.9 M · Events 31 k · Alarms 31 k
```

`machineTypeSummary` in the engine produces every figure there, and the
one-line machine description on the Machines step comes from the same call -- so
the two cannot drift. Two things it gets right that the old hand-rolled line did
not:

- **A series alone in its measurement type still counts as a type.** The section
  9 HVAC unit sends three -- one 60 s bundle plus its two 72-minute statuses,
  which share no tick with anything else. The count matches the diagram directly
  beneath it.
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

- **Neither build has been opened in a tenant.** Both compile, both produce the zip the platform
  wants, and the Web SDK build type-checks including its templates -- but nobody has logged into a
  Cumulocity instance and clicked it. Treat the upload path and every runtime behaviour as
  unverified.
- Persistence is `localStorage` in both builds, not managed objects -- so a scenario belongs to a
  browser rather than to a tenant, and cannot be shared by sending a link.
- No A/B scenario comparison, and no pre-fill from tenant statistics. The Web SDK build is where
  that becomes possible, because it has an authenticated `@c8y/client` to hand; it does not use it.
- One open question, which the engine cannot answer for itself: **where does a live tenant report
  these nine counters for a past calendar month?** Until that is known, the arithmetic is unvalidated
  against reality -- it is only validated against the concept.
