# Cumulocity Message Calculator — Concept

**Status:** rev 44 — shortened to the current state; the history of superseded designs is in git, not
here · **Owner:** marco.stoffel@cumulocity.com · **Date:** 2026-10-15

---

## 1. Purpose

A web application, deployable into a Cumulocity tenant and equally runnable as a standalone page, in
which a customer:

1. **Describes their machines** — one machine type at a time, with the metrics each one produces.
2. **Classifies each metric** by kind, guided rather than quizzed.
3. **Gets back the message volume** those choices produce, with the payload design that produces it
   and the reasoning behind it.

Point 3 is why the tool exists. A pure number-cruncher would be a spreadsheet; the value is that
filling it in teaches the Cumulocity data model, so the volume is the consequence of a modelling
decision the customer now understands.

### Where it sits

The **[CTC] Sales Configurator** turns quantities into money: periods, currencies, discounts,
approval gates, commitments. It cannot tell anyone what to type into its nine message-counter cells
(`Configurator!D28:D36`). **That is this tool's job:** machines and metrics in, the nine counters per
period out, ready to paste.

### No prices. Anywhere.

The tool outputs **quantities only**. It contains no price list, rate, currency, margin, approval
threshold, minimum commitment or DataHub uplift percentage, and never quotes one. This pays twice:

- **One build serves everyone.** Nothing confidential is in the bundle, so the same artifact can go
  into a customer tenant, to a prospect, or onto a public page.
- **The division of labour is clean.** Volume is an engineering question and this tool answers it;
  price is a commercial one and the Configurator answers it. A price revision needs no change here.

The workbook still produces a commitment: it multiplies the quantities by a price column that ships
**empty** (§6.6), so the figure exists in the file and never in the tool.

### Audience

| Who | Wants |
|---|---|
| Prospect / customer architect | "How much volume will this generate, and how do I keep it low?" |
| Presales / account team | Defensible numbers to carry into the Configurator |
| Customer developer | The concrete payload shapes to implement |

### Non-goals

- No prices, rates, currencies, discounts or commitment figures.
- No utilisation, overage or commit recommendation. An attached billing system handles withdrawal.
- No live traffic measurement. Pre-fill from tenant statistics is a later phase (§8).

---

## 2. The unit: what counts as a message

Five elements of the Cumulocity domain model, and **creating or updating any of them is one
message**. Measurements cannot be updated, which gives nine counters (`D28:D36`, repeated per
period):

| Element | What it is | Counters |
|---|---|---|
| **Measurements** | Timestamped numeric series | Created |
| **Events** | Non-numeric occurrences with a timestamp | Created, Updated |
| **Alarms** | Events that need somebody to act | Created, Updated |
| **Inventory** | Devices and assets that everything else attaches to | Created, Updated |
| **Operations** | Commands sent *from* Cumulocity to a device | Created, Updated |

Consequences that drive the design:

- **Reads, deletes and failures are free.** Only successful creates and updates count. A device
  retrying a rejected payload burns network, not messages.
- **An update costs what a create costs.** An alarm raised and cleared is two messages; a managed
  object touched daily is thirty a month. A successful update that changes nothing still counts.
- **Payload size is irrelevant; object count is everything.** One measurement carrying forty series
  costs the same as one carrying one. How values are grouped into objects is the biggest lever (§4).
- **Batching does not reduce the count.** Ten measurements in one batch request are ten messages.

  > **Batch for the network. Bundle for the count.**

- **Operations run outbound**, and the command and every status transition the device reports back
  are billed (§3).

### Where this tool stops

**Messages per calendar month** is the volume output. Messages are bought in blocks of 100,000 per
month; the results and the workbook round to those blocks per month (§6.6), and nothing further —
no utilisation, no overage, no commit sizing. The tool cannot get a bill wrong if it never computes
one.

### A calendar month is not a fixed length

February is 28 days and January 31 — an **11 % swing** on identical behaviour. The engine works in
real calendar months, reports a **range** per period, and quotes at the peak month:

```
messagesInMonth(y, m) = ratePerSecond × daysInMonth(y, m) × 86400
peakMonth             = the fullest month of the period
```

---

## 3. The five elements — choosing the right one

The customer describes a *metric* and the tool routes it to an element. This is what customers most
often get wrong, which is why kind selection (§5) is the centre of the interface.

| The metric | Example | Element | Counter | Send when |
|---|---|---|---|---|
| A number you read off the machine and chart | Temperature, RPM, kWh, a status flag | **Measurement** | Created | Fixed interval, **bundled** |
| Something happened; nobody needs to act | Door opened, GPS fix, shift started | **Event** | Created | On occurrence |
| Something is wrong; somebody must act | Sensor failure, threshold breach | **Alarm** | Created, Updated on clear | On raise / clear |
| Something simply true about the machine | Firmware version, serial, location | **Inventory** | Created at onboarding, Updated on change | On change |
| Something Cumulocity sends *to* the machine | Firmware update, restart, setpoint | **Operations** | Created, Updated per transition | Per command |

### Guard-rails

- **One command is more than one message.** `PENDING → EXECUTING → SUCCESSFUL` is one create plus
  two or three updates, so 3–4 messages. The tool asks for the transition count.
- **Inventory is not a time-series store.** Updating a changing value onto a managed object bills
  every time and keeps no history. If the history matters, it is a measurement or an event.
- **Every update counts, including no-ops.** Firmware that re-sends its managed object on every boot
  or on a timer bills for each write (L10).
- **Inventory creates are a one-off.** Onboarding 10,000 machines is 10,000 `Inventories Created` in
  the period it happens — a spike, not a monthly rate — and is modelled separately.
- **Alarms are not events.** An alarm has a lifecycle; re-raising an active one updates it (still
  billed) rather than duplicating it.
- **Events are not measurements.** A number in an event body cannot be aggregated or charted.

---

## 4. The core lesson: the Measurement API

### 4.1 One measurement, many series

A measurement is one timestamp, one source, and a tree of fragments and series:

```json
POST /measurement/measurements
{
  "source": { "id": "12345" },
  "time": "2026-08-25T10:00:00.000Z",
  "type": "acme_Climate",
  "acme_Climate": {
    "T":        { "value": 21.4, "unit": "C"   },
    "humidity": { "value": 47.2, "unit": "%RH" },
    "co2":      { "value": 612,  "unit": "ppm" },
    "pressure": { "value": 1013, "unit": "hPa" }
  }
}
```

**One message, four datapoints.** One request per sensor is four messages for the same information.
Everything in one measurement shares a timestamp, so bundling is only valid for readings sampled at
the same instant.

### 4.2 Bundling rule

> Group series into one measurement when they share **the same sampling interval** and **the same
> semantics**.

Same interval is a hard requirement. Same semantics is a judgement: a climate bundle and a power
bundle on the same tick could be one request, but apart they keep dashboards and retention clean.
The tool groups by interval automatically, lets the customer split by semantic group, and shows the
volume cost of each split.

#### A row can stand for a count of series

A PLC exposes 450 tags nobody will name one by one. So **a measurements row carries a count**: *PLC
tags · 450 · every 60 s* is 450 series on that tick, bundled, stored, named and retained like any
other row. A count of one is the ordinary row, so named readings and counts live in one table.

A count does not say how the series travel — that is a fact about the agent, and plenty of agents
post one datapoint per request. So the **measurement type dropdown** offers three mutually exclusive
answers:

| The row says | Measurement types | Messages a tick |
|---|---|---|
| shares an existing type (e.g. `acme_Climate`) | the one it joined | rides along free |
| *One measurement for all series* | 1 | 1 |
| *One measurement per series* (offered when count > 1) | `series` | one each |

```
messages = ticks × types        // per machine per month
stored   = ticks × series       // unchanged by grouping
```

**The tool quotes what was described, however wide.** The platform recommends at most 100 series
per measurement — advice about document shape, not an enforced limit — and bills a wider one as one
message. 450 tags at 60 s across 1,000 machines, 31-day month:

| Design | Messages |
|---|---|
| One series per message | 20,088,000,000 |
| **One measurement of 450 series** | **44,640,000** |
| 5 measurement types of 100 | 223,200,000 |

**L6** warns above 100 and prices what following the advice would add. *One measurement per series*
is its own naive baseline, and **L1** fires on it with the saving.

### 4.3 Stability rule

> **A bundle's series set must be identical on every send.** Never send a partial bundle; never
> conditionally add or drop a series.

Varying shapes under one type inflate storage, churn indexes and degrade writes and queries — on
data that is expensive to reshape later. So:

- A temporarily unavailable sensor still sends its bundle.
- Two machine variants with different sensor sets need two bundle types.
- A firmware release that adds a sensor introduces a **new** bundle type.

### 4.4 A status is a series, and its interval is the whole question

A status flag is a series like any other, and the only question asked of it is the interval it is
read at. There is one rhythm: no on-change kind.

- **The arithmetic is the change rate stated the other way round.** A flag changing 20 times a day
  read every 4,320 s is 620 messages in a 31-day month — 20 a day. Saved scenarios from the old
  on-change `state` kind are converted on load by exactly this rule (`normalise`: `perDay` →
  `86400 / perDay` seconds), so no figure moves.
- **What is lost** is the exact transition moment: on a tick it is quantised to the interval.
- **Where the mistake lives:** a compressor on/off left on the fleet's 60 s tick costs 44,640
  readings a machine a month to learn something that moves two dozen times a day. **L2** warns when a
  series whose name reads as a status is sampled faster than every 15 minutes. It reads the name, so
  it is advice; no figure depends on it.

### 4.5 Sampling faster than you need

Three vibration axes at 1 Hz, 1,000 machines, bundled, 31-day month: **2,678,400,000 messages.**
Aggregated at the edge to min/max/avg/RMS per axis per minute — 12 series in one 60 s bundle:
**44,640,000**, a 60× reduction and usually a better dataset. **L4** flags any interval below 1 s.

### 4.6 Operational storage

The Operational Data Store is a Configurator line (`D37`).

**Billing:** the platform captures what the database holds at each calendar month's end and bills it
rounded **up to a whole GiB**, every month. `D37` holds the **period's fullest month**, rounded up —
the same peak rule as messages, since the Configurator multiplies every line by the period length.
A fleet holding 150 MiB pays one unit a month; for small fleets the rounding *is* the figure.

| Assumption | Value | Provenance |
|---|---|---|
| Bytes per measurement document | **95 B** (25–245) | Measured 2026-09-28 |
| Bytes per event document | **1.7 kB** | Same fit; no spread of its own |
| Bytes per alarm document | **2.7 kB** | Same fit; no spread of its own |
| Bytes per operation document | **2.7 kB** | Not measured; priced as an alarm |
| DataHub extract, relative to MongoDB | **20–25 %** | Rule of thumb, *to be verified* |
| Retention | asked per type, over a scenario default | A tenant setting the tool cannot read |

**Where the bytes come from:** 39,889 tenant-months across 7,472 tenants, six month-end snapshots.
The estimator is the change in storage between consecutive snapshots over the documents written that
month, on growing tenant-months (which cancels retention), p1/p99 outlier rejection, least squares
through the origin; stable to three significant figures across subsets.

- **Bytes follow the document**, so bundling cuts storage as well as messages.
- **The range is always reported, never a midpoint.** The central figure goes into `D37`; the range
  travels in the note column, and a customer who has measured their own tenant overrides it. That
  makes storage the tool's one **estimated** line item, beside *calculated* and *asked*.
- **The ramp is walked month by month**, so storage keeps climbing after the message count levels
  off — a property no single-month calculation shows.

#### Retention is a rule per type

Retention decides size, not traffic, and a rule attaches to a type, so it is asked on the row that
owns the type. The scenario setting is the tenant default for every type without its own rule; an
empty field means that default, and zero means "not kept".

| Element | Stores | Where retention is asked | Counted as |
|---|---|---|---|
| Measurement | one document, N values | the row naming the type, once per type | documents |
| Event | one document per occurrence | every events row | documents |
| Alarm | one per raise; the clear **updates** it | every alarms row | documents |
| Operation | one per command; transitions **update** it | every commands row | documents |
| Inventory | nothing new; a write overwrites | not asked, and the panel says why | objects, kept for the term |

Storage counts creates only — an alarm bills twice and stores once. Every registered device stays in
the inventory until deleted, so registrations accumulate and never age out.

---

## 5. Machine types and metric kinds — the centre of the tool

### The flow

```
Add machine type          "Rooftop HVAC unit"     how many · % online · protocol · rollout per period
  └─ Add metric           "Supply air temp"       name · unit
       └─ Choose kind     ▸ Series                → Measurement, interval, bundled
                          ▸ Occurrence            → Event
                          ▸ Condition             → Alarm
                          ▸ Inventory entry       → Inventory
                          ▸ Command               → Operations
```

Presets prefill common archetypes — HVAC unit, meter, tracker, gateway, production machine.

### The kind selector

Five kinds, each chosen by a plain-language question rather than an API name.

| Kind (`code`) | The question | Element | Cadence asked |
|---|---|---|---|
| **Series** (`continuous`) | "A value you read off the machine and want to chart?" — status flags included | Measurement | Sampling interval |
| **Occurrence** (`occurrence`) | "Something happened worth recording, nobody needing to act?" | Event | Per day |
| **Condition** (`condition`) | "Something wrong that somebody has to act on?" | Alarm | Raises per day |
| **Inventory entry** (`inventory`) | "Simply true about the machine, not a reading over time?" | Inventory | Changes per day or month |
| **Command** (`command`) | "Does Cumulocity send this *to* the machine?" | Operations | Per month, plus transitions |

Each kind asks for the cadence it implies, and only series can join a bundle. `'fact'` and `'state'`
are older names still accepted on load.

### Data model

Framework-free TypeScript in `lib/engine`, unit-tested independently of either UI.

```
Scenario
  name, notes
  settings:     startYear, startMonth, retentionDays (tenant default), fragmentPrefix
  periods:      Period[]                 // 1-5, mirrors the Configurator
  machineTypes: MachineType[]

Period        index, months, machineCountOverrides   // the ramp

MachineType   name, machineCount, onlinePct, protocol, metrics[], bundles[]

Metric
  name, unit
  seriesCount?        // series this row stands for; absent = 1
  typePerSeries?      // one measurement per series; asked in the type dropdown
  kind:    'continuous' | 'occurrence' | 'condition' | 'inventory' | 'command'
  cadence: { mode: 'interval', seconds }
         | { mode: 'onChange', perDay }
         | { mode: 'perMonth', count }
         | { mode: 'command',  perMonth, transitions }
  semanticGroup, bundleId?, fragmentName?, retentionDays?

Bundle
  fragmentName, intervalSeconds, metricIds[], retentionDays?
  // invariant: every member is 'continuous' with the bundle's interval
  // no cap on series: one bundle is one message, however wide (§4.2)
```

### The arithmetic

```
DPM = daysInMonth(year, month); SPM = DPM × 86400
N   = machineCount × onlinePct / 100

types       = Σ seriesCount over rows sending one type per series + 1 if any row pools
bundle      → N × SPM / intervalSeconds × types  → Measurements Created
occurrence  → N × perDay × DPM                   → Events Created
condition   → N × perDay × DPM × 2               → Alarms Created + Updated
inventory   → N × count  |  N × perDay × DPM     → Inventories Updated
command     → N × perMonth × (1 + transitions)   → Operations Created + Updated
onboarding  → machineCount, once, in its period  → Inventories Created

messagesInMonth   = Σ nine counters
avgMessagesPerSec = messagesInMonth / SPM, overall and per machine type   // a sanity check only
peakMonth, leanMonth over every month of every period

storage: per retention window, walk the month's created documents back through the window,
         add registered objects, CEILING to GiB per month
```

The engine also computes the **naive baseline** — every series in its own measurement at its own
interval. L1 prices it per finding and the top bar shows the ratio.

---

## 6. User flow — a guided wizard

Five steps, in the order a customer can answer them. A running total stays pinned throughout.

| # | Key | Screen | What it asks |
|---|---|---|---|
| 1 | `fleet` | **Machines** | Machine types, counts, online %, and the protocol each talks. A type is a group that behaves identically. |
| 2 | `series` | **Measurements** | One row per series (or per counted set of series), and one question: how often it is read. Rows group into measurement types by interval automatically; the type name and its **retention** are edited once per type. |
| 3 | `discrete` | **Events, alarms, inventory & commands** | One panel per element with the mistake each invites. Commands last, with their transition count. Events, alarms and commands carry retention; inventory does not, and says why. |
| 4 | `contract` | **Contract & deployment** | Periods, their lengths, machines live in each, the start month and the default retention; then every Configurator line item the fleet cannot imply, one column per period. Quantities only. |
| 5 | `results` | **Results** | §7. |

The **key** is the stable handle — `steps.ts`, test names and code comments use it. The number exists
only in this table. **An input is asked once, in the place it is used.**

Design principles:

- **The customer describes physical reality; the tool designs the payload.** "How often is this
  sampled?" is answerable without knowing Cumulocity; inventing fragment names is not.
- **Bundling is the default.** A new series drops into the measurement type for its interval;
  splitting is the deliberate act.
- **The vocabulary is the platform's:** *series* (what the industry calls a datapoint) and
  *measurement type*.
- **The protocol does not count.** It travels to the workbook and the machine header, and advises
  (SmartREST static templates carry one series per row), but a message is one request however it
  was produced.
- **One name per type.** `ownFragmentName` resolves every series to its type's stored or suggested
  name, so table, diagram, payloads and workbook cannot disagree. A type with no series is dropped.
  Generated names use the customer's prefix, never `c8y_`, and a typed name is never rewritten.

### Machine types fold to a summary

Each machine type is a disclosure whose header answers *what did I model here, and how much of the
volume is it*: its parts, measurement types, and messages per 31-day month at its own count. The
header is **scoped to the step** — Measurements counts measurements, each discrete panel its own
element, and only Machines totals all five. One function, `lib/wizard/machine-line.ts`, produces
every version in both apps.

### The commercial line items

The Configurator repeats a block per period, 30 rows apart (period 1 at rows 21–49, period 2 at
51–79, …), so every figure has an exact cell address.

| Group | Line items | Period-1 rows |
|---|---|---|
| Deployment | Public/Shared Cloud · Dedicated Production · Development · Testing | 23–26 |
| Core Metrics | Messages (**calculated**) · Operational Data Store (**estimated**, §4.6) | 27, 37 |
| Add-Ons | Streaming Analytics · DataHub Standard + data queried · DataHub Dedicated · Microservice Hosting · Enterprise Functions · Tenants · Data Broker · VPN Services | 38–46 |
| Support | Gold (Public Cloud Upgrade) | 47 |

Everything else is **asked**. Two inputs move no quantity but matter to the quote:

- **DataHub Standard (yes/no per period)** — the Configurator raises the message rate by an uplift
  in those periods. The percentage is confidential, so the Quote sheet takes it as an empty cell,
  like the discount.
- **The hyperscaler** (Cumulocity Chosen, AWS, Azure; `E6`), asked once — it selects the VPN price.

Never asked: discounts, currency, margin, minimum commitments, approval thresholds, the uplift
percentage.

### 6.6 The commit-to-consume commitment

Cumulocity is commit-to-consume: a customer commits to a spend, usage is drawn down against it, and
unused commitment is forfeited. The Configurator computes it at `E18`:

```
commitment = Σ periods ( Σ line items ( billable quantity × unit price ) × months )
```

**The tool computes every factor except the price.** The Quote sheet carries the multiplication as
live formulas over an empty price column, plus the Configurator's **Total per month** (`H48`) and
**Total per period** (`H49`). Every money cell is a formula with a cached value of zero; a test
prices the sheet with made-up figures and holds it to the Configurator's arithmetic.

**Each period is quoted at its peak month's billable units × its length** — the safe side, never
below consumption. Messages are rounded up to blocks of 100,000 **per month** before multiplying, so
each month's part-block is paid for; a test pins that order. `periodQuotes` in
`lib/engine/commitment.ts` computes this for both apps and the workbook. Month-by-month consumption
and the headroom between the two are computed in the engine and not shown.

---

## 7. Output

**The results page leads with what gets quoted.** One row per period — messages and storage, per
month and over the period, in whole billing units at the busiest month — and a term row that is
their sum, equal to the Quote sheet's term column. Every digit is printed: a shortened figure can
read below the quote. Then the workbook download and the guidance.

**Everything else sits behind Expert mode**, in this order:

- **The hand-off table** — every figure next to its Configurator cell, per period, with two copies:
  the nine counters as one column for `D28:D36`, and everything as *cell, value, label*. Rows at
  zero fold behind one *Show*, since an undecided cell must still be findable. Without a secure
  context the copy falls back to `execCommand` and the button says **Copied** or **Blocked**.
- **Operational storage** — the range month by month, with its assumptions (§4.6).
- **Design per machine and volume panels** — the calendar-month range with the peak named, messages
  by counter and by machine type (each with its average messages per second), the per-machine
  figure, and the ramp across periods.
- **Payloads** — for every measurement type, event, alarm and inventory fragment: REST JSON plus
  JSON-over-MQTT and a SmartREST sketch, grouped by namespace.

**Guidance** — each rule carries its volume delta, so advice is quantified.

| # | Rule | Severity |
|---|---|---|
| L1 | Series sharing an interval and semantic group are sent in more measurement types than needed | Suggestion — shows the saving |
| L2 | A series whose name reads as a status is sampled faster than every 15 min | Warning (§4.4) |
| L3 | A non-measurement metric in a measurement type | **Error** — reachable only by import |
| L4 | Interval below 1 s | Warning — offers edge aggregation |
| L5 | Inventory updates above 1 per machine per minute | Warning — wrong element |
| L6 | A measurement type above 100 series, or mixing semantic groups | Warning — prices the split (§4.2) |
| L7 | One fragment name, two different series sets | **Error** — variable bundle |
| L8 | Alarm rate implies re-raising the same alarm type | Suggestion — use the lifecycle |
| L9 | Command transitions unmodelled, or more than 4 | Warning |
| L10 | An inventory entry re-sent on a timer or every boot | Warning — no-op updates bill |

**Export** — JSON that round-trips, and an **Excel workbook** the customer sends to their account
team, who price it:

| Sheet | Contents |
|---|---|
| **Quote** | Every quantity, periods side by side, billable units over the term, an empty unit-price column, and the commitment as formulas (§6.6) |
| **Storage** | The storage range month by month and per period, with assumptions and provenance |
| **Machine Data** | Every reading, its cadence, and the measurement it travels in |
| **Months** | All nine counters for every calendar month |
| **Guidance** | Every finding with its volume delta |

**Every price cell ships empty.** The workbook is written in the browser by a dependency-free writer
(`lib/xlsx`); nothing is uploaded.

---

## 8. Architecture

```
lib/engine     the nine counters, bundling, lint rules, payloads, storage, commitment,
               the Configurator cell map and the workbook
lib/scenario   immutable scenario edits, normalise() for old saves, the library index
lib/presets    machine archetypes and the metric catalogue
lib/i18n       every user-visible string, English and German
lib/format     Intl number and month formatting
lib/diagram    explainer and measurement-diagram geometry
lib/wizard     steps, machine summary line, navigator entries
lib/xlsx       zip and .xlsx writer
src/ui         standalone build: preact + esbuild, ~450 kB, needs no backend
src/c8y        Web SDK build: Angular 21 + @c8y/ngx-components 1024.18.0 (y2027-lts)
```

- **Two builds, one engine.** Everything that decides a number is in `lib/`, which a test keeps free
  of any framework, SDK, DOM or browser API. Both builds are `HOSTED` zips and can be uploaded;
  neither contains pricing data, so neither needs a different audience.
- **Client-side only.** No microservice; no scenario leaves the browser.
- **What the Web SDK build uses from the SDK:** the stepper and its buttons, `c8y-title` and action
  bar items, `hookNavigator`/`hookRoute`, the alert channel for copy feedback, and the shell's
  language. Not used: formly, `c8y-data-grid`, echarts, and `@ngx-translate` for the catalogue,
  which stays typed in `lib/i18n` because the workbook renders from it too. The diagrams are
  hand-written SVG over shared geometry. The cost is roughly 15× the bytes of the standalone build
  and an Angular version pinned to the SDK line.
- **The Web SDK build type-checks nothing on build** (`aot: false`, babel); `c8y:typecheck` runs
  `ngc` and is the only check of a template.

### 8.1 Strings

`en.ts` is the source of truth; `de.ts` is typed `Record<Key, string>` against it, so a missing
translation does not compile. The surface is `t(key, params)` plus a two-branch plural rule. The
catalogue carries four marks — `**bold**`, `*emphasis*`, `` `code` ``, blank line — and `rich.ts`
renders them. Numbers and months come from `Intl`; lint findings travel as keys plus parameters.

**Kept English in every language** (`NOT_TRANSLATED`): Configurator row labels and units (they name
rows in an English workbook), counter names (the platform's own), the metric catalogue (a chosen
name becomes a fragment name), the generated workbook, and REST paths and MQTT topics.

### 8.2 A library of scenarios

One estimate per customer, kept side by side. The Web SDK build lists every scenario as a top-level
entry in the shell's left navigator, newest first, each a route `scenario/:id`; **New** and
**Delete** are header actions. The standalone build has a picker instead. `lib/scenario/library.ts`
holds the index (`{ id, name, savedAt }`), so the menu never parses a fleet;
`lib/wizard/navigator.ts` decides the menu as a pure, tested function, and the SDK factory around it
is wrapped so a bad entry costs its own row, never the menu.

**Persistence is the browser**, under one key both builds share, plus JSON import/export. Managed
objects in the tenant remain the right home and are unbuilt: that would be the tool's first call to
the platform API.

### Phasing

| Phase | Content | State |
|---|---|---|
| P0–P3 | Engine, both builds, explainer, guidance, presets, export, scenario library | **done** |
| P4 | Pre-fill from tenant statistics; scenario comparison; scenarios as managed objects | later |
| P5 | Write the counters straight into a Configurator copy | later |

---

## 9. Worked example — the engine's acceptance test

1,000 rooftop HVAC units, steady state:

| Counter | Metric and kind | 31-day month | 28-day month |
|---|---|---|---|
| Measurements Created | `acme_Climate` — T, humidity, CO₂, pressure — 1 bundle @ 60 s | 44,640,000 | 40,320,000 |
| Measurements Created | compressor on/off, filter status — 2 series @ 4,320 s, one type each | 1,240,000 | 1,120,000 |
| Events Created | service events, 1/machine/day | 31,000 | 28,000 |
| Alarms Created | 0.5/machine/day | 15,500 | 14,000 |
| Alarms Updated | the matching clears | 15,500 | 14,000 |
| Inventories Updated | firmware + config, 1/machine/day | 31,000 | 28,000 |
| Operations Created | 1 command/machine/month | 1,000 | 1,000 |
| Operations Updated | 3 transitions per command | 3,000 | 3,000 |
| **Total messages** | | **45,977,000** | **41,528,000** |

Plus a one-off **1,000 `Inventories Created`** in the onboarding period. The same fleet spans
41.5 M to 46.0 M on month length alone.

**Against the naive baseline** (every series in its own measurement, same month): 179,897,000, a
difference of **133,920,000** — **3.9× less volume** for identical information, all of it the
climate bundle.

A volume reduction is not automatically a cost reduction — that depends on commercial terms this
tool does not model. 134 million fewer writes a month is still worth having for query latency and a
database that behaves at scale.

---

## 10. Risks

- **Garbage in.** Customers rarely know change rates or transition counts. Mitigation: presets and
  plain-language cadence questions.
- **Wrong kind chosen** is invisible in the output. Mitigation: the §5 questions, an example per
  kind, and L2/L5.
- **Over-optimisation.** Bundling for volume alone can produce fragments no dashboard builder wants.
  Mitigation: semantic-group splits and L6.
- **Definition drift.** The Configurator changes yearly. Mitigation: the cell map in one module
  (`lib/engine/configurator.ts`), and no prices to go stale.

---

## 11. Open questions

- **Ground truth.** The CTC Metrics Dashboard reports Messages and ODS per tenant and month, so a
  source exists. Not yet done: a test comparing a real tenant's counters against what the engine
  predicts for its fleet. Two known differences: that dashboard does not count operations (which the
  Configurator's definition includes), and its seventh column is inventory *requests*, not updates.
- **Storage bytes** for events, alarms and operations have no measured spread; operations no
  measurement at all.
- **The Web SDK build cannot be rendered by any check in this repo.** `c8y:deploy` to a test tenant
  works; everything about its screens beyond that rests on `c8y:typecheck` and on use in a tenant.

---

*Message definition per the Cumulocity domain model and `[CTC] Sales Configurator (2026 Update).xlsx`
— `Configurator!D28:D36`. Read with [tools/xlsx_dump.py](tools/xlsx_dump.py). This document contains
no pricing data by design.*
