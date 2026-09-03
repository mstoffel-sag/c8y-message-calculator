# Cumulocity Message Calculator — Concept

**Status:** draft for review, rev 24 — one rhythm: the on-change state kind is gone, and a status is a series read on its own interval · **Owner:** marco.stoffel@cumulocity.com · **Date:** 2026-09-03

---

## 1. Purpose

A web application, deployable into a Cumulocity tenant and equally runnable as a standalone page for
prospects, in which a customer:

1. **Describes their machines** — one machine type at a time, with the metrics each one produces.
2. **Classifies each metric** by kind, guided rather than quizzed.
3. **Gets back the message volume** those choices produce, together with the payload design that
   produces it and the reasoning behind it.

Point 3 is why the tool exists. A pure number-cruncher would be a spreadsheet. The value is that
filling it in teaches the Cumulocity data model, and the volume the customer sees is the direct
consequence of a modelling decision they now understand.

### Where it sits

The **[CTC] Sales Configurator** already turns message volume into money: periods, currencies,
discounts, approval gates, minimum commitments. What it cannot do is tell anyone what to type into
its nine message-counter cells — a salesperson faces `Configurator!D28:D36` with no way to derive
them from anything a customer actually knows about their fleet.

**That is this tool's job.** Machines and metrics in; the nine counters out, per period, ready to
paste. Framing it this way fixes the output spec exactly and keeps the two tools from competing.

### No prices. Anywhere.

The tool outputs **metrics only** — messages per calendar month, and stored values as a count. It contains no
price list, no rate, no currency and no minimum-commitment figure, and it never quotes one.

This is a design constraint, and it pays for itself twice:

- **One build serves everyone.** Because there is nothing confidential in the bundle, the same
  artifact can be deployed into a customer tenant, handed to a prospect, or hosted publicly by
  presales. No internal/external variants, no build flags, no leak surface.
- **The division of labour is clean.** Volume is an engineering question and this tool answers it.
  Price is a commercial question and the Configurator answers it. Neither has to track the other's
  changes — the Configurator's Feb 2026 revision inflated prices 10 %, and a tool built this way
  needed no update at all.

Where the concept needs to reason about money to justify a recommendation, it reasons about the
*mechanism* and leaves the rate out (see §4.4).

### Audience

| Who | Wants |
|---|---|
| Prospect / customer architect | "How much volume will this generate, and how do I build it so it stays low?" |
| Presales / account team | Nine defensible numbers to carry into the Configurator |
| Customer developer | The concrete payload shapes to implement |

### Non-goals

- No prices, rates, currencies, discounts or commitment figures. See above.
- **No commit sizing, no utilisation, no overage.** A billing system is attached and takes care of
  withdrawal. This tool estimates messages; nothing downstream of that number is its business.
- No deployment, add-on or support modelling. That is the Configurator's job.
- **Storage is estimated as a range, never as a number.** Stored values remain the primary figure,
  because they are the counterweight to message optimisation (§4.4); the GiB range on top of them
  rests on two unverified rules of thumb and is reported with both ends and its provenance (§4.6).
  Still no money: what a GiB costs is not this tool's business.
- No live traffic measurement. Pre-fill from tenant statistics is a later phase (§8).

---

## 2. The unit: what counts as a message

"Messages" is comprised of five elements of the Cumulocity domain model:

| Element | What it is |
|---|---|
| **Measurements** | Datapoints with timestamps |
| **Events** | Non-numeric data with a timestamp |
| **Alarms** | A special type of event, used to indicate an action is necessary |
| **Inventory** | The storage location which all other components are attributed against, with a unique identifier — usually devices and other assets |
| **Operations** | Outbound device controls sent *from* Cumulocity, such as firmware updates |

> **Both creating and updating these five elements count as messages** — `POST` and `PUT`
> respectively. Measurements are the exception: they cannot be updated, only created.

Which gives the nine counters the Configurator sums (`D28:D36`, repeated per period):

| # | Counter | Verb |
|---|---|---|
| 1 | Measurements Created | `POST` |
| 2 | Events Created | `POST` |
| 3 | Events Updated | `PUT` |
| 4 | Alarms Created | `POST` |
| 5 | Alarms Updated | `PUT` |
| 6 | Inventories Created | `POST` |
| 7 | Inventories Updated | `PUT` |
| 8 | Operations Created | `POST` |
| 9 | Operations Updated | `PUT` |

Five consequences drive the whole design.

**Reads are free, and so are failures.** Only successful `POST` and `PUT` writes count. Every `GET` —
dashboards, queries, exports, integrations reading back out — is not counted, nor is `DELETE`, nor is
a request the platform rejects. A device retrying a malformed payload in a loop burns network and
battery but produces no messages; only the attempt that succeeds does.

**Updates cost exactly what creates cost.** An alarm that is raised and later cleared is two
messages. A managed object touched daily is thirty messages a month. Nothing about a `PUT` is
cheaper than a `POST`.

**Payload size is irrelevant; object count is everything.** One `POST` carrying forty series costs
the same as one carrying a single value. So **how a customer groups values into objects is the single
biggest lever on volume** — §4.

**Batching does not reduce the count.** Posting ten measurements in one batch request counts as ten
messages, not one. Batch for the network — fewer connections, less radio time, better throughput —
but understand that it buys nothing commercially. The distinction is worth teaching in one line:

> **Batch for the network. Bundle for the count.**

Batching packs many measurements into one request and saves transport. Bundling packs many series
into one measurement and saves messages. Only the second one changes the number.

**Operations are in scope, and they are outbound.** Every other counter is device-to-platform.
Operations run the other way, and both the command and each status transition the device reports
back are billed. §3.

### Where this tool stops

**Messages per calendar month. That is the whole output.**

Commercially, messages are bought in units of 100,000 per month, and a billing system attached to the
platform takes care of withdrawal against whatever the customer has committed. None of that is
modelled here — no unit rounding, no utilisation percentage, no overage warning, no commit
recommendation. The estimate goes into the Configurator and into the billing system's hands, and the
line between the two is exactly where this tool ends.

Being disciplined about that line is what keeps the tool honest. It cannot get a bill wrong if it
never computes one.

### A calendar month is not a fixed length

Billing is per calendar month, and that has a consequence worth stating on its own.

February is 28 days and January is 31 — an **11 % swing** in message volume on identical behaviour,
with no change to the fleet at all. An estimate presented as one number per month is therefore
misleading in both directions: too high for eleven months if quoted on January, too low for seven if
quoted on an average.

So the engine works in real calendar months and reports a **range**, with the longest month named
explicitly:

```
messagesInMonth(y, m) = ratePerSecond × daysInMonth(y, m) × 86400
peakMonth             = the 31-day month     // the honest upper bound
```

This is the one place where being average-correct is the wrong answer.

---

## 3. The five elements — choosing the right one

The customer describes a *metric* — something the machine knows, or something Cumulocity sends it —
and the tool routes it to an element. This is the part customers most often get wrong, and it is why
kind selection (§5) is the centre of the interface rather than a dropdown in a corner.

| The metric | Example | Element | Counter | Send when |
|---|---|---|---|---|
| A number that changes every time you read it, and that you want to chart | Temperature, pressure, RPM, kWh | **Measurement** | Created | Fixed interval, **bundled** |
| A number or code that holds steady for long stretches, then changes | Status flag 0/1, mode, error code | **Measurement** | Created | Fixed interval, at the rate it actually moves (§4.4) |
| Something happened, worth recording, nobody needs to act | Door opened, GPS fix, config applied, shift started | **Event** | Created | On occurrence |
| Something is wrong and somebody must act | Sensor failure, threshold breach, offline | **Alarm** | Created, then Updated on clear or re-raise | On raise / clear |
| Something simply true about the machine, not a reading over time | Firmware version, serial, location, config, capability | **Inventory** | Created once at onboarding, Updated on change | On change only |
| Something Cumulocity sends *to* the machine | Firmware update, restart, setpoint change | **Operations** | Created, then Updated per status transition | Per command |

### Guard-rails the tool enforces

- **Operations cost more than they look.** Both `Operations Created` and `Operations Updated` bill. A
  machine acknowledging a command through `PENDING → EXECUTING → SUCCESSFUL` costs one create plus
  two or three updates, so a single command is realistically **3–4 messages**. Fleet-wide firmware
  campaigns and any polling-style control pattern have to be modelled explicitly, and the tool asks
  for the transition count rather than assuming one.
- **Inventory is not a time series store.** Repeatedly `PUT`ting a changing value onto a managed
  object bills every time, overwrites the previous value, and leaves nothing to chart. If it changes
  and the history matters, it is a measurement or an event.
- **Every `PUT` counts, including the ones that change nothing.** The platform does not diff the
  payload. Firmware that re-sends its full managed object on every boot, or on a heartbeat timer,
  bills for every one of those writes while storing no new information. This is the most common
  invisible line in a real tenant, it is entirely avoidable in device code, and the tool asks about it
  directly rather than waiting to be surprised by it (L10). Note the boundary: a *successful* write
  that changes nothing still counts, while a *rejected* write does not count at all.
- **Inventory creates are a one-off, not a rate.** Onboarding 10,000 machines is 10,000
  `Inventories Created` in whichever period the rollout lands — a spike, not a monthly cost. The tool
  models registration separately from steady-state traffic, because putting it in the monthly rate
  overstates every later period.
- **Alarms are not events.** An alarm is a state with a lifecycle; re-raising an active alarm of the
  same type updates it — which still bills, as `Alarms Updated` — rather than creating a duplicate.
  Using alarms for "something happened" produces noise; using events for "something is wrong" loses
  the workflow.
- **Events are not measurements.** Events hold non-numeric data. A number buried in an event body
  cannot be aggregated or plotted the way a series can.

---

## 4. The core lesson: the Measurement API

### 4.1 One measurement, many series

A measurement is *one timestamp, one source, and a tree of fragments and series*:

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

**One `POST` = one message, carrying four datapoints.** The naive alternative — one request per
sensor — is four messages for exactly the same information: four times the volume, four times the
write load, four documents in the database instead of one.

The constraint that makes this work is the shared timestamp: **everything in one measurement is
asserted to have been sampled at the same instant.** Bundling is only valid for readings that
genuinely share a sampling moment.

### 4.2 Bundling rule

> Group series into one measurement when they share **the same sampling interval** and **the same
> semantics**. Send that bundle as one request.

A measurement carries exactly one `source`, so bundling is scoped to one source by construction. It
is not a criterion the customer has to satisfy, and stating it as one only makes the rule sound more
restrictive than it is. What they have to get right is the interval and the semantics.

Same interval is a hard requirement — a shared timestamp is a claim about simultaneity. Same
semantics is a modelling judgement: a climate bundle and a power bundle on the same 60 s tick could
technically be one request, but keeping them apart keeps dashboards, retention rules and access
control clean. The tool proposes interval-based bundles, lets the customer split them by semantic
group, and shows the volume cost of each split so the trade-off is explicit rather than moral.

### 4.3 Stability rule — the one that breaks databases

> **A bundle's series set must be identical on every single send. Never send a partial bundle, never
> conditionally add or drop a series.**

If `acme_Climate` sometimes carries four series and sometimes two, the platform is storing documents
of differing shape under one type. That inflates the stored representation, churns indexes, and
degrades both write throughput and query performance — and it worsens over the tenant's lifetime, on
data that is expensive to reshape after the fact. It is the kind of mistake that is invisible in a
pilot and painful at 100,000 machines.

Practical corollaries the tool surfaces:

- A temporarily unavailable sensor should still send its bundle. Omit a series only when the omission
  is permanent for that machine type.
- Two machine variants with different sensor sets need **two bundle types**, not one variable bundle.
- A firmware release that adds a sensor introduces a **new** bundle type. It does not widen the old
  one.

### 4.4 A status is a series, and its interval is the whole question

A status flag that flips a handful of times a day is a series like any other. What decides its cost
is the interval it is read at, and that is the only question the tool asks about it.

There used to be a second answer here. A `state` kind existed, sent **on change**: one message per
transition, carrying the exact moment the value moved. It is gone, and the measurements table asks
one thing — how often — of every row. What that costs and what it buys is worth recording, because
the argument for the old design was a good one:

**What the tool lost.** An on-change send carried the transition timestamp. Read on a tick instead,
the moment the compressor started is quantised to the sampling interval — you can tell which
72-minute window it happened in, not which second. That is a functional loss, not an economic one,
and no interval recovers it.

**What the tool gained.** One question instead of two. The rhythm column was a second dropdown above
the rate, and the two together were the most-explained control in the wizard: a customer had to
decide what kind of thing their flag *was* before they could say how often it moved. The screen now
asks how often, once, in the same shape for every row.

**What did not change: the arithmetic.** A flag changing 20 times a day billed 20 messages a day. A
series read every 4,320 s bills 2,678,400 / 4,320 = 620 in a 31-day month, which is the same 20 a
day. So the conversion is exact, `normalise` performs it on load, and no saved scenario moved
(§8.1). The interval a status is given **is** its change rate, stated the other way round.

**Where the mistake now lives.** The old design made the expensive answer hard to express: a flag
could not join an interval bundle, so it could not be dragged onto the fleet's tick. Now it can, and
a compressor on/off left at 60 s costs 44,640 readings a machine a month to learn something that
moves two dozen times a day — a 72× over-estimate on a line a customer signs. Nothing structural
prevents it, so the tool says it instead: **L2** fires on a series whose name reads as a status and
whose interval is under 15 minutes, and the teach panel on the step makes the same point with the
same numbers. That is a warning where there used to be an impossibility, and it is the real cost of
this simplification.

**What is still not an option** is a bundle whose series set varies from send to send — §4.3 stands
untouched, and L3 still reports a non-measurement sharing a measurement type. But the specific
violation this section used to name, a flag both bundled and sent on change, cannot be expressed any
more, so the tool has no hard error left of its own making.

### 4.5 Sampling faster than you need

Sub-second sampling is where estimates explode, and it is almost always solvable at the edge.

Three vibration axes at 1 Hz, 1,000 machines, bundled correctly, in a 31-day month:
**2,678,400,000 messages.**

The same signal aggregated on the gateway to min / max / avg / RMS per axis per minute — 12 series in
one 60 s bundle: **44,640,000 messages.** A 60× reduction, and for most condition-monitoring
use cases a *better* dataset. The tool flags any interval below 1 s and offers to model the aggregated
alternative side by side.

### 4.6 Operational storage — a range, and why it stays one

The Operational Data Store is a real line in the Configurator (row 37) that somebody has to fill in.
Two questions decide what goes in it: **what is measured**, and **how big a stored value is**. The
first is a billing rule; the second comes from `StorageCalculation.txt` and is a range.

**What is measured: the end of each month, added up.** The platform captures what the database holds
when a calendar month closes. That capture happens every month, and a contract period's quantity is
those captures **added up** — so the unit is **GiB-months**, and the figure for a twelve-month period
is roughly twelve times what the database holds at any one time.

Two plausible readings of "storage for the period" are both wrong, and worth naming because each is
wrong in an expensive direction. The **fullest month** over-states a period that spent most of itself
filling up: quoting a year at the level it reached in month twelve charges for eleven months the
customer did not have. The **last month** does the reverse, and under-states a fleet that shrank. The
sum is neither, and it is what is billed.

| Assumption | Value | Provenance |
|---|---|---|
| Bytes per stored value in MongoDB | **100–400 B** | 100 B from independent tests on Edge and a rule of thumb; 400 B from one proof of concept. Marked *"needs to be verified"* at source. |
| DataHub extract, relative to MongoDB | **20–25 %** | Rule of thumb, tested on Edge. Also *"to be verified"*. |
| Retention | **asked**, per measurement type, over a scenario default (30 days to start) | Not in the source at all. Retention rules are a tenant setting, and the tool cannot read them. |

**Both ends are always reported, and no midpoint is ever computed.** Averaging two unverified figures
produces something that looks like a measurement. A fourfold spread *is* the finding, and the tool
hands it over intact — summed the same way as the quoted figure, so the range arrives at the period
as a range rather than being re-derived from a total that has already lost it.

**But a cell needs one number, so the tool writes one.** `D37` is filled in from the month-end values
at the assumed **bytes per value**, which defaults to **400 B — the top of the range**. Not a midpoint,
and not the bottom: on a commit-to-consume contract, under-stating usage saves the customer nothing,
it depletes the commitment early and triggers an automatic top-up. The assumption is a scenario
setting beside the default retention, the whole range travels in the note column next to the cell, and
a customer who has measured their own tenant overrides it in the deployment panel — their figure wins.

That makes storage the tool's only `estimated` line item, a third kind alongside `calculated` and
`asked`: derived, but on assumptions worth overriding. `calculated` would claim the fleet implies it;
`asked` would waste a figure the tool can produce.

A well-bundled fleet has room *below* the quoted figure and none above it: the 100–400 B was measured
on values stored one per measurement, and a measurement carrying four values pays for its envelope
once rather than four times. That is another reason the top of the range is the safe end to write.

#### Retention is a rule per type

**Retention decides the size, not the traffic.** What survives to the end of the month is what is
still inside its retention window, so identical traffic held for 90 days occupies three times what it
does at 30. It moves no counter.

**And a retention rule is attached to a type**, which is where the tool asks for it: a column on the
row that owns the type. A tenant keeping `acme_Climate` for 90 days and `acme_Vibration` for 7 is the
ordinary case, and a single scenario-wide number cannot express it — a fleet with one long-lived type
and one short-lived one would be quoted at whichever of the two somebody typed. The scenario setting
survives as the **tenant default**, for every type with no rule of its own, and an empty field means
exactly that.

Which row owns a type differs by element, and so does what a rule has to act on:

| Element | Stores | Where the rule is asked | Counted as |
|---|---|---|---|
| **Measurement** | one document, N series values | the measurements table, on the row naming the type — once per bundle, not once per series | values |
| **Event** | one document per occurrence | the events table, every row | documents |
| **Alarm** | one document per raise; the clear **updates** it | the alarms table, every row | documents |
| **Operation** | one document per command; the status transitions **update** it | the commands table, every row | documents |
| **Inventory** | **nothing new** — a write overwrites the managed object in place | not asked, and the panel says why | — |

Two of those rows are the reason the table is worth writing down. An alarm bills twice per incident
and stores once; an operation bills three or four times and stores once. Counting the updates as
documents would have doubled the alarms and tripled the operations.

And **inventory is the exception that proves retention is not universal**: an update overwrites, so
nothing accumulates to age out, and a managed object is not one of the types a retention rule covers.
Every device registered stays in the inventory, and counts towards storage, until somebody deletes
it — so registrations accumulate over the whole term and are the one component that never shrinks.
Offering a retention field there would be offering a control that changes no number.

So the engine hands the storage model one bucket per window rather than a single total, and walks
each bucket back through its own window. Types kept for the same time share a bucket, because they
age out together and nothing downstream needs their names. Zero is a real answer — "we do not keep
this" — and has to survive every layer that might read it as absent and refill it with 30.

**The ramp means the period is not full yet.** A fleet three months into a rollout has three months of
history, not thirty days of steady state at its final size. Each window is walked backwards day by
day through the months the ramp actually produced, so period 1 reads truthfully — and storage keeps
climbing for months after the message count has levelled off, which is a property no single-month
calculation can show. That behaviour is enforced by test, and it is also why the period is a sum:
the months genuinely differ from one another.

**What it covers: everything that is stored, and it says which half is which.** The tool used to
count measurements alone, on the grounds that they outnumber everything else by three orders of
magnitude — under 1 % of documents for the §9 fleet. **Per-type retention destroys that argument.**
The ratio held only while everything was kept for the same time; a tenant keeping measurements for a
week and alarms for five years has an ODS bill the alarms dominate, and no fleet-wide document ratio
would have predicted it. So documents are counted, and the estimate reports how much of itself they
are. The 100–400 B was measured on datapoints, so applying it to a document is the weaker half of
the assumption — but leaving them out is a silent understatement, and on a commit-to-consume contract
understating is the expensive direction (§6.6).

**Bundling shows up here too.** The source notes that putting several datapoints in one measurement
"can reduce required diskspace significantly", because the envelope is paid once per measurement
rather than once per value. The tool reports values-per-measurement next to the range and says which
end of it a fleet is nearer. It does **not** split the envelope cost from the value cost: the source
measures the two together, and inventing the split would be inventing precision.

---

## 5. Machine types and metric kinds — the centre of the tool

This is the interaction everything else serves.

### The flow

A customer builds up a fleet the way they think about it: **machine type → metrics → kind**.

```
Add machine type          "Rooftop HVAC unit"     how many · % online · rollout per period
  └─ Add metric           "Supply air temp"       name · unit
       └─ Choose kind     ▸ Series                → interval, bundled
                          ▸ Occurrence            → Event
                          ▸ Condition             → Alarm
                          ▸ Inventory entry       → Inventory
                          ▸ Command               → Operations
```

Repeat per machine type. Presets prefill common archetypes — HVAC unit, meter, tracker, gateway,
production machine — so the first screen is never empty.

### The kind selector

Five kinds cover the nine counters. Each is chosen by a plain-language question, never by naming an
API, because a customer who already knows which API to use does not need this tool.

| Kind | The question the UI asks | Element | Counter(s) | Cadence asked for |
|---|---|---|---|---|
| **Series** | "Is it a value you read off the machine and want to chart?" — a status flag included, since it is read like anything else | Measurement | Created | Sampling interval |
| **Occurrence** | "Did something happen that's worth recording, with nobody needing to act?" | Event | Created (+ Updated if amended) | Occurrences per day |
| **Condition** | "Is something wrong that somebody has to act on?" | Alarm | Created + Updated on clear | Raises per day |
| **Inventory entry** | "Is it simply true about the machine rather than a reading over time?" | Inventory | Updated (+ one Created at onboarding) | Changes per month |
| **Command** | "Does Cumulocity send this *to* the machine?" | Operations | Created + N × Updated | Commands per month, transitions each |

Two things the selector does that a plain dropdown would not:

- **It asks for the cadence the kind implies**, not a generic rate. A series is asked for an
  interval; an event is asked how many happen a day; a command is asked how many go out a month and
  how many statuses come back. Asking "how many per second" for a firmware campaign is how estimates
  end up out by a factor of four.
- **It only offers bundling where bundling is valid** — series, and only those. Occurrence,
  condition, inventory and command metrics never enter an interval bundle, which is what makes L3
  reachable only through an imported file.

### Data model

Framework-agnostic TypeScript, unit-tested independently of the UI, structured so the nine counters
fall out directly.

```
Scenario
  name, notes
  settings:    startYear, startMonth, retentionDays, bytesPerValue, fragmentPrefix
               // retentionDays here is the tenant default; a measurement type overrides it
  periods:     Period[]                  // 1-5, mirrors the Configurator
  machineTypes: MachineType[]

Period
  index, months, machineCountOverrides   // the ramp, expressed the way the quote is

MachineType
  name, machineCount, onlinePct          // duty cycle / connectivity availability
  metrics: Metric[]
  bundles: Bundle[]

Metric
  name, unit
  kind:    'continuous' | 'occurrence' | 'condition' | 'inventory' | 'command'
           // 'state' was a sixth, sent on change; converted to an interval on load (§4.4)
  cadence: { mode: 'interval',  seconds }        // continuous
         | { mode: 'onChange',  perDay }         // occurrence, condition, inventory
         | { mode: 'perMonth',  count }          // inventory
         | { mode: 'command',   perMonth, transitions }   // command
  semanticGroup                          // free text; drives bundle proposal
  bundleId?                              // continuous only; null = own measurement
  fragmentName?                          // the type it sends in when it travels alone
  retentionDays?                         // this metric's own type; absent = the scenario default
                                         // ignored for 'inventory': a write stores nothing new

Bundle
  fragmentName, intervalSeconds, metricIds[]
  retentionDays?                         // the type's rule; absent = the scenario default
  // invariant: every member is kind 'continuous' with identical intervalSeconds
  // invariant: metricIds.length <= 100   -- platform recommendation, §11
```

### The arithmetic

```
// billing is per calendar month, so every figure is computed per real month
DPM = daysInMonth(year, month)      // 28 | 29 | 30 | 31
SPM = DPM × 86400
online = onlinePct / 100
N = machineCount × online

bundle      → N × SPM / intervalSeconds        → Measurements Created
occurrence  → N × perDay × DPM                 → Events Created
condition   → N × perDay × DPM × 2             → Alarms Created + Alarms Updated
inventory   → N × count                        → Inventories Updated   // quoted per month
            → N × perDay × DPM                 → Inventories Updated   // quoted per day
command     → N × perMonth × (1 + transitions) → Operations Created + Updated
onboarding  → machineCount, once, in its period → Inventories Created

// storage, separately: not a counter, and the only figure retention touches
values[w]   = measurement series values written this month into types kept w days
docs[w]     = event + alarm + operation documents likewise -- from the CREATES only,
              since a clear or a transition updates the document it belongs to
objects     = machines registered so far          // no retention rule removes one
retained    = Σ over w of walkBack(values[w]) + Σ over w of walkBack(docs[w]) + objects
period ODS  = Σ over the period's months of retained, at bytesPerValue   // GiB-months

counters[9]        = each counter summed independently, for one calendar month
messagesInMonth    = Σ counters
storedValues       = Σ (sends × seriesCount)     // a count, not bytes -- §4.4
avgMessagesPerSec  = messagesInMonth / SPM     // averaged; no burst multiplier (§7)

// evaluated across every calendar month in every period
peakMonth          = MAX(messagesInMonth over all months)
leanMonth          = MIN(messagesInMonth over all months)
```

There is no month-basis setting, because billing is per calendar month and the engine simply uses real
month lengths. What replaces it is more useful: results carry a **range** across the months in each
period, with the peak month named. There is no headroom or commit setting either — see §2.

**Naive baseline.** Every result is shown against the unbundled counterfactual — **every series in
its own measurement**, at the interval it was given. That delta is the tool's headline: *"your design
produces 134 million fewer messages in your peak month — 74 % less volume — than the obvious
implementation."* It used to carry a second clause, every state metric interval-sampled at the
fleet's fastest tick, which put the §9 figure at 222 million and 83 %. That clause went with the
on-change rhythm (§4.4): there are no flags left to re-sample, only series read at the rate they were
given, so the counterfactual is smaller and the whole delta is now the bundling.

---

## 6. User flow — a guided wizard

Five steps, in the order a customer can actually answer them: what the machines are, what they
measure, everything else that travels between machine and platform, and then the contract — its
periods, the ramp across them, and what is deployed in each. A running total stays pinned to the screen throughout, so
every input visibly moves the number.

| # | Key | Screen | What it asks, and what it teaches |
|---|---|---|---|
| 1 | `fleet` | **Machines** | Machine types, counts, online %, and what each one **talks** — a catalogue of shop-floor protocols that can always be escaped. A type is a group that behaves identically; split only where the *data* differs. |
| 2 | `series` | **Measurements** | One table, one row per **series**, and one question about each: how often it is read. The interactive explainer sits here. The tool groups series by interval and puts each group in one **measurement type**, automatically, under a suggested fragment name the customer can overwrite in the row. A **retention** column sits beside it, asked once per measurement type rather than once per row, because that is what a retention rule attaches to (§4.6). A status flag is a row like any other — the interval a customer gives it is the rate they intend to read it at, and L2 is what catches one left on the fleet's tick (§4.4). |
| 3 | `discrete` | **Events, alarms, inventory & commands** | Everything that is not a measurement, one panel each, with the mistake each one invites. An event is something that happened; an alarm is something that is wrong; inventory is something true about the machine right now; a command is something you want the machine to do. Commands come last and state the status-transition count, because one command is three or four messages — and because putting them beside the three inbound elements is what makes the direction the point. Events, alarms and commands each carry a **retention** column, since each row is a type of its own; inventory carries none, and says why (§4.6). |
| 4 | `contract` | **Contract & deployment** | Two panels, in dependency order. **Periods and the ramp:** how many periods, how long each is, how many machines are live in each, where the term starts on the calendar, and the two tenant facts the storage estimate needs — the default retention and the bytes per value. Then **Deployment & add-ons:** every Configurator line item the fleet cannot imply, one column per period, with its cell reference. Quantities only. |
| 5 | `results` | **Results** | §7. |

**An input is asked once, in the place it is used.** Deployment & add-ons and Rollout were two
screens, and the first asked for a quantity per contract period while the second was where periods
were created — so adding a fifth period meant leaving the screen that needed it, adding it, and
walking back. They are one step, periods first.

The **key** is the handle: it is what `steps.ts` stores, what the tests are named after, and what
everything outside this table refers to. The number is a property of this table only, so reordering
the wizard is a change to one row here and nothing else.

**The protocol is asked, and deliberately does not count.** The **Machines** step asks what each type talks
— OPC UA, Modbus TCP, BACnet/IP, native MQTT, a custom agent, or something the customer types in
themselves. It is the first question anyone asks of a finished estimate, it travels to the Design
sheet of the workbook, and it appears on the machine type's folded header. It appears in **no
counter**: a message is one request to the platform however the reading was produced, and attaching a
multiplier to a protocol would be inventing arithmetic the price list does not have. What it does
change is who builds what — and one answer carries a consequence the payload examples already state,
since SmartREST's static measurement templates carry one series per row, so bundling several series
into one message needs a custom template. Advice, not arithmetic.

**The vocabulary is the platform's.** What the industry calls a "datapoint" is a **series** — one
named value over time — and the fragment that carries a set of series under one timestamp is a
**measurement type**. **Measurements** says series and measurement type in its column headings, its dropdowns
and its prose, because a customer who leaves with the wrong words models the wrong thing.

**One table, one question, because a flag is not a different kind of thing.** A status is a
measurement with one series in it; giving it its own section, its own heading and its own noun said
otherwise. It briefly had a column instead — `How often` carried a rhythm dropdown above the rate,
one answer for a tick and one for the moment the value moved — and that column is gone too (§4.4).
Every row is now asked the same thing in the same shape: the interval it is read at. The catalogue is
one list, its `Status` and `Connectivity` groups sitting under the reading groups, and picking
`Door open/closed` no longer moves the row anywhere — it fills the unit and leaves the interval the
customer chose alone.

Naming works one way for everything: a bundled series takes the name from its bundle, a series
travelling alone carries one on the metric (`Metric.fragmentName`), and one derivation —
`ownFragmentName` — resolves either to a stored name or to the suggestion, so the table, the diagram,
the payload examples and the workbook cannot disagree about what a device sends. An empty box means
the suggested name, which is what the placeholder in it shows. The measurement type's name is
editable in the row that first uses it, once per type rather than once per series: the name belongs
to the group, and four identical boxes for one value would invite an edit in row three that silently
rewrites row one. Choosing *a measurement type of its own* creates that type on the spot, named after
the series and editable immediately — a series never travels in a measurement type that does not
exist, and a type left with no series in it is dropped, because a measurement type is its members.

**Bundling is the default, not a feature.** The grouping happens as the customer types: a new
series drops straight into the measurement type for its interval, and one is created if there is
none.
Splitting is the deliberate act. This inverts the usual failure mode, where the good design is
something you have to know to ask for.

The proposal is driven by **interval**, because that is what the Measurement API rewards — one
timestamp per measurement means readings on the same tick can share a message and readings on
different ticks never can. Semantics *refine* the proposal afterwards (L6), they do not drive it.

Design principle for every step that describes the fleet: **the customer describes physical reality;
the tool designs the payload.** Asking a customer to invent fragment names up front is how bad models get built. Asking
"how often is this sampled?" is a question they can answer without knowing anything about Cumulocity.

### Machine types fold to a summary

**Measurements** and the elements step each edit every machine type, so a fleet with six types meant
six full-height blocks per step and a page nobody reads. Each block is a disclosure, and its header answers the two
questions you would otherwise have to open it for: **what did I model here, and how much of the
volume is it.**

```
▸ Rooftop HVAC unit  1,000 machines    4 time series, 2 states, 1 event, 1 alarm,               46 M
                                       1 inventory entry, 1 command · every 1 min ·      MESSAGES / MONTH ·
                                       3 measurement types                              45,977 PER MACHINE
                                       Measurements 45.9 M · Events 31 k · Alarms 31 k
```

One machine type stays open; the rest start folded, and after that it follows whatever the reader
did. Three things this pins down:

- **The parts come before the measurement count.** "10 datapoints in 3 measurement types" would be
  false — the event, alarm, inventory entry and command are not inside a measurement at all.
- **A series alone in its measurement type counts as a type**, per §4.2. The §9 HVAC unit sends
  three, not one — one 60 s bundle plus its two 72-minute statuses — and the summary agrees with the
  diagram directly beneath it.
- **Messages are grouped by element, not by counter.** The nine counters split created from updated,
  which matters when pasting into the Configurator and nowhere else; an alarm's raise and clear are
  one line in a summary.

Figures are per 31-day month at the type's own count and online percentage — deliberately not the
peak-month total in the header, because a summary has to compare machine types like with like. The
same call produces the one-line description on **Machines**, so the two cannot drift.

### The commercial line items in more detail

The Configurator repeats an identical block per period, offset by **30 rows**: period 1 occupies rows
21–49, period 2 rows 51–79, and so on. Knowing that, the tool returns an exact cell address for every
number it produces, which is the difference between "here are some figures" and "type these into
these cells".

**The workbook does not copy that shape.** Five vertical blocks of the same twenty-five line items is
150 rows in which nothing can be compared, and comparing periods is the whole reason a ramp is
modelled. So the workbook puts **one row per line item and one column per period**. The rows stay at
the Configurator's own period-1 addresses, so column D still pastes cell for cell; each later column
is the same list of values pasted at its own period's `D` cell, and the column heading names it
(`Period 2 -> D51`). Rows 6–20 are left empty because the Configurator keeps its own period summary
and commitment formulas there.

| Group | Line items | Base row |
|---|---|---|
| Deployment | Public/Shared Cloud · Dedicated Production · Development · Testing | 23–26 |
| Core Metrics | Messages (**calculated**, = sum of the nine counters) · Operational Data Store | 27, 37 |
| Add-Ons | Streaming Analytics · DataHub Standard + data queried · DataHub Dedicated · Microservice Hosting · Enterprise Functions · Tenants · Data Broker · VPN Services | 38–46 |
| Support | Gold (Public Cloud Upgrade) | 47 |

One of these is **calculated** (messages). One is **estimated** — the Operational Data Store, filled
in from §4.6 with its assumptions in the note column and overridable in the wizard. **Everything else
is asked.**

**DataHub Standard is a yes/no that the tool records and does not act on.** It applies an uplift to
the message *rate* in the Configurator. It does not change the message *count*, so it changes nothing
this tool computes — and the uplift percentage is commercial information that has no business being
in a bundle a customer may be shown (§1).

### What the wizard deliberately never asks

Discounts, currency, margin, minimum commitments and approval thresholds. Those are the
Configurator's, and a tool that may be put in front of a customer must not carry them.

### 6.6 The commit-to-consume commitment

Cumulocity is **commit-to-consume**: a customer commits to a spend amount rather than to quantities,
there is no bill of materials, usage is metered daily and drawn down against the commitment, and
unused commitment is forfeited at expiry rather than carried forward. One number decides the deal, and
the Configurator computes it at `E18` as

```
commitment = Σ periods ( Σ line items ( billable quantity × unit price ) ) × months
```

**The tool computes every factor in that except the price**, and stops there. The Quote sheet carries
the multiplication as a live formula over an empty price column, so the commitment exists in the file
without a price ever existing in the tool — the same trick that lets the workbook be a quote without
carrying a price list (§1). No money is ever cached in a cell: every money cell is a formula whose
cached value is zero, which is enforced by test.

Two quantities, deliberately both reported:

- **As quoted.** Each period at its peak month's billable units × its length, summed. This is what the
  Configurator does and it is the right way to quote a period: a period is sold at one monthly number.
- **Month by month.** Every month at its own volume, rounded up to whole billing units individually,
  summed across the term. This is what the fleet will actually consume.

The second is always the smaller, because a ramping fleet spends most of the term below its peak and
because February is short. **The gap is reported as its own figure**, and it matters commercially in
one direction only: unused commitment is forfeited, so a commitment sized on peak × months is money
the customer pays for and does not use. That is an argument to have before signature, which is why the
tool puts a number on it rather than leaving it implicit.

Rounding order is not cosmetic here. Messages are sold per 100,000 **per month**, so each month's
part-block is paid for; rounding the term total up once at the end would under-count by up to one
block per month. The workbook's formula rounds per period column before multiplying by the months, and
a test pins the order.

---

## 7. Output

**The hand-off table** — the primary artefact. Every number the tool produces, next to the exact
Configurator cell it belongs in, per period: the nine counters, the period length, and every
deployment and add-on quantity collected in the **Deployment & add-ons** panel. Two copy actions per period — the nine counters
as one pasteable column for `D28:D36`, and everything as cell/value pairs. Everything else on the
page supports this table.

**Volume figures**
- **The calendar-month range, with the peak month named.** Every period reports its leanest and
  peak month. A single averaged number is misleading in both directions (§2).
- Total messages/month split by counter and by machine type, with the naive baseline alongside.
- The per-machine-per-month figure — the number architects actually reason with.
- Average messages/second: a throughput sanity check, and only that.

  It used to be reported twice, the second time multiplied by a **peak factor** the wizard asked for.
  That number is gone. Nobody knows their fleet's burstiness at quoting time, so the answer was
  always the default; a figure that only ever repeats the input is not evidence, and printing it
  beside a computed one lends it authority it has not earned. Burstiness is a device-design question
  and it changes no counter — billing is a monthly total.
- Stored values per month, as a count, and the operational storage they imply as a **range** with its
  assumptions attached (§4.6): what the database holds at each month's end, added up over the period,
  in GiB-months. Both ends, never a midpoint.
- A per-period ramp of message volume as the fleet rolls out.

Deliberately absent: billable units, utilisation, headroom, commit recommendations, overage warnings.
A billing system handles withdrawal (§2).

**Payload design** — for every measurement type, event, alarm and inventory fragment, a
copy-pasteable example: REST JSON plus
the MQTT equivalents (JSON-over-MQTT and a SmartREST template sketch). This is what turns an estimate
into an implementation brief.

Grouped by **namespace**, because measurement fragments, event types, alarm types and inventory
fragments are four separate namespaces that never collide. Listed flat they read as one long list of
fragments, which makes a well-modelled machine look far more complicated than it is: the HVAC example
needs six names, but only **three** are measurement fragments — one interval bundle plus one per
status, because each status is read on a tick no other series shares. Two series *can* share a
fragment once they share an interval, and the tool proposes exactly that whenever they do.

Every generated name uses the customer's own prefix. **Never `c8y_`** — that is Cumulocity's reserved
namespace, and a payload example that writes into it is telling the customer to collide with the
platform. A fragment name the customer has already typed is never rewritten, prefix change or not:
that name is in their firmware.

**Guidance report** — each rule carries its volume delta, so advice is quantified rather than
asserted.

| # | Rule | Severity |
|---|---|---|
| L1 | Two or more continuous metrics share an interval and semantic group but sit in different bundles | Suggestion — shows saving |
| L2 | A series whose name reads as a status is sampled faster than every 15 min | Warning — paying for identical readings (§4.4) |
| L3 | A non-measurement metric has been forced into a measurement type | **Error** — violates §4.3; reachable only by import |
| L4 | Bundle interval below 1 s | Warning — offer edge-aggregation model |
| L5 | Inventory updates exceed 1 per machine per minute | Warning — wrong element (§3) |
| L6 | Bundle exceeds **100 series** — the platform recommendation — or mixes semantic groups | Warning — split the bundle |
| L7 | One fragment name, two different series sets — bundled or solo, since a lone series carries a fragment name the customer can type | **Error** — variable bundle |
| L8 | Alarm rate implies repeatedly re-raising the same alarm type | Suggestion — use alarm lifecycle |
| L9 | Command transitions unmodelled, or more than 4 per command | Warning — each update bills (§3) |
| L10 | An inventory entry is re-sent on a timer or at every boot rather than on change | Warning — every successful `PUT` counts, even a no-op |

**Copy to clipboard.** The hand-off table offers two copies per period: the nine counters as one
column, ready to paste into that period's `D28:D36` in one action, and every line as *cell, value,
label* — a checklist rather than a paste target, since those cells are not contiguous. Both report
what happened. `navigator.clipboard` exists only in a secure context, so a build opened by
double-clicking `dist/index.html` has no clipboard API at all; the copy falls back to
`document.execCommand` and the button says **Copied** or **Blocked** rather than leaving a reader to
guess whether it is wired up.

**Export** — JSON that round-trips back into the tool, and an **Excel workbook** of six sheets.

The workbook is what makes the hand-off work in the direction it actually flows: **the customer fills
in the wizard and sends the file to their account team, who price it up.** So it carries the quantities
*and* the price columns, and no prices:

| Sheet | For | Contents |
|---|---|---|
| **Configurator** | transfer | every quantity on the row the Configurator keeps for it, **one column per period**, so column D pastes at the same cell and each later column pastes at the cell its heading names. The Messages row is left blank in every period column on purpose — it is the one formula in that column (`=SUM(D28:D36)`) and a pasted constant would destroy it |
| **Quote** | the account team | quantities referenced from the Configurator sheet, periods side by side, billable units over the whole term, a shaded unit-price column, and **the CTC commitment** as a formula (§6.6). Messages are rounded into blocks of 100,000 per month before being multiplied by the months |
| **Storage** | review | the operational-storage range month by month plus each period's sum, with its assumptions and their provenance (§4.6) |
| **Design** | the device team | every reading, its cadence, and the measurement it travels in |
| **Months** | evidence | all nine counters for every calendar month, so the range is demonstrable rather than asserted |
| **Guidance** | review | every finding with its volume delta |

**Every price cell ships empty.** This is what lets §1 hold while still producing a quote: the tool
contains no price list, the file the customer sends contains no price list, and the numbers arrive
from the person doing the quoting. Discounts beyond a single catalog field, approval thresholds and
currency conversion stay in the Configurator, which remains the source of truth for an approved quote.

Written by a dependency-free `.xlsx` writer (`/lib/xlsx`) in the browser: nothing is uploaded, and no
scenario leaves the tenant.

---

## 8. Architecture

```
/lib/engine       pure TS: the nine counters, bundle proposal, lint rules, payload generator,
                  and the Configurator cell map. Unit tested, imports nothing but itself.
/lib/presets      machine archetypes — HVAC, meter, tracker, gateway, production machine
/lib/i18n         every word the user reads, in English and German
/src/ui           the wizard. Currently preact + esbuild (see below); one Scenario in a store.
/src/ui/wizard    the five step components and the hand-off table
```

### 8.1 The string catalogue

Two languages, one file each, and the components hold no prose at all. `en.ts` is the source of
truth: `de.ts` is typed `Record<Key, string>` against it, so a string added without a translation
does not compile — which matters more than it sounds, because the failure mode of a half-translated
tool is an English paragraph appearing in the middle of a German explanation, and nobody reports it.

**No framework.** The whole surface is `t(key, params)` plus a two-branch plural rule, which is all
English and German need. A dependency that has to be learned before a sentence can be corrected is a
dependency that stops sentences being corrected. The Angular port swaps this file for
`@ngx-translate` and keeps every word (§8, the port table).

**The prose keeps its emphasis.** Half the teaching in this tool is in the bold: *"one **POST** is
**one message**"*. Taking the JSX out meant putting something back that a translator can retype, so
the catalogue carries four marks — `**bold**`, `*emphasis*`, `` `code` `` and a blank line for a
paragraph — and `rich.ts` turns them into elements. Deliberately not Markdown: a link or a heading
inside a UI string is a sign the string should have been a component.

**What stays English in every language**, and why — asserted by test as `NOT_TRANSLATED`:

| Kept | Reason |
|---|---|
| Configurator row labels (`Public/Shared Cloud`) and their unit column | They name a row in an English workbook. Translating them breaks the only thing they are for |
| Counter names (`Measurements Created`) | The platform's own, and what a tenant's usage screen shows |
| The metric catalogue (`Filter blocked`, `Firmware version`) | Not UI text: a chosen name becomes the metric's name, travels into fragment names, payload examples and the workbook. Otherwise a scenario would mean different things depending on the language it was built in |
| The generated workbook | It mirrors an English Configurator. It renders the findings from the English catalogue rather than keeping a second copy of them |
| REST paths and MQTT topics | API surface |

Numbers and month names come from `Intl`, not from the catalogue: 1,000.5 and 1.000,5 are the same
number, and the browser already knows every language's months. The lint findings travel as keys plus
parameters rather than sentences (`Finding.titleKey`, `titleParams`), so the guidance panel is not
the one English island left on a German screen.

**On the UI framework.** The first draft is preact so it could be built and clicked immediately
rather than after an Angular install. The target remains Angular + `@c8y/ngx-components`; when that
is scaffolded, `/lib` moves across unchanged and only `/src/ui` is rewritten. Keeping the engine free
of every framework, SDK and DOM reference is what makes that a port rather than a rewrite, and it is
enforced by test — `lib/ imports nothing but itself` in `test/engine.test.ts` walks every source
under `/lib` and fails on a non-relative import, on anything resolving outside `/lib`, and on
`document`, `window`, `localStorage`, `navigator`, `fetch`, `Blob`, `process`, `@angular/`, `@c8y/`
or `preact`.

### The Angular port, evaluated

Checked against `@c8y/ngx-components` 1023.14.208 (`y2026-lts`). Every wizard construct has an SDK
component; nothing here needs inventing.

| What this app does | What the SDK gives it |
|---|---|
| The seven-step rail | `c8y-stepper` + `cdk-step`. Extends the CDK stepper, renders the `(1)—(2)—(3)` progress itself, `linear` forces the order, `onStepChange` for navigation, `c8yStepperIcon` to override per-step icons |
| Per-step validation, which the draft does not have | `[stepControl]` on a `cdk-step` takes a `FormGroup`, sync or async, and a linear stepper refuses to advance while it is invalid |
| Back / Next | `c8y-stepper-buttons` |
| Every labelled field | `c8y-form-group`, plus `@ngx-formly/core` 6.1.3 for schema-driven forms if the datapoint tables are worth generating |
| Inline validation text | `c8y-messages` / `c8y-message` |
| The results and hand-off tables | `c8y-data-grid` (`DataGridComponent`, `hookDataGridActionControls`) |
| Guidance findings | `AlertService`, or `c8y-messages` where they belong inline |
| Page chrome the draft fakes with its own topbar | `c8y-title`, `c8y-action-bar-item`, `c8y-breadcrumb`, `c8y-help`, `c8y-list-group` |
| Placement in the shell | `hookNavigator` and `hookRoute` |
| The `.xlsx` download | `file-saver` 2.0.5 is already an SDK dependency |
| The zip inside the `.xlsx` | `@zip.js/zip.js` 2.7.71 is already an SDK dependency, so `lib/xlsx/zip.ts` could go — or stay, since it is tested and has no cost |
| The ramp and bar visuals | `echarts` 6 + `ngx-echarts`, both already dependencies |
| i18n | `@ngx-translate/core` 17 and the `translate` directive; extraction via the devkit's gettext tooling |
| Scenario persistence (P3) | `InventoryService` from `@c8y/client` — managed objects, as §8 already intends |

Three things the SDK does **not** cover, all known and none blocking:

- **`WizardComponent` is the wrong primitive.** It is built on `BsModalRef` — it is the modal
  "Add device" pattern with hookable entries, not a full-page flow. The stepper is the right one.
- **The explainer and configuration diagrams stay hand-written SVG.** There is no SDK equivalent, nor
  should there be. The geometry already lives in `lib/engine/diagram.ts`; only the rendering moves.
- **Most of `src/ui/styles.css` goes away.** It exists because there is no `@c8y/style` in a preact
  build, so it copies that package's tokens by hand. In an Angular app the real package replaces it.

The costs are version coupling and weight, not capability:

- **The SDK version has to match the tenant's.** Angular is pinned per line: `y2025-lts` (1021.22)
  wants Angular 18, `y2026-lts` (1023.14) Angular 20.3, `y2027-lts` (1024.15) Angular 21. Pick the
  line the target tenant runs, not `latest`.
- **The tooling moved.** `@c8y/cli` stops at 1018.x (`y2024-lts`); current builds use `@c8y/devkit`.
- **Weight.** `@c8y/ngx-components` unpacks to 40 MB over 1,094 files and pulls `three`,
  `monaco-editor`, `leaflet`, `@xterm/xterm` and `@novnc/novnc` transitively. Today's whole
  application is a 222 kB bundle in a 330 kB zip. Tree-shaking decides how much of that survives, and
  it is the one number in this table that cannot be read off a manifest — it has to be measured.

So: possible, with no gaps. The question it turns on is not capability but whether the platform
navigator, the shared form and grid components and the i18n pipeline are worth an Angular toolchain
and an order-of-magnitude larger bundle for a presales calculator that already runs.

- **Client-side only.** All arithmetic in the browser. No microservice, nothing to operate, no
  customer data leaves the tenant.
- **One build, two deploy targets.** Uploaded as a `HOSTED` web application, and usable as a plain
  static bundle for public presales use. Because the bundle contains no pricing data (§1), these are
  literally the same artifact — the reason that constraint is worth keeping. The tenant upload needs
  no `c8ycli`: a hosted application is a zip with `index.html` and `cumulocity.json` in its root,
  which is what `npm run package` builds. `c8ycli` becomes relevant when the Angular shell does.
- **Persistence.** Scenarios as managed objects (`type: acme_PricingScenario`) so a tenant's
  scenarios are shared and versioned by the platform; `localStorage` for the standalone build; JSON
  import/export in both.
- **i18n** through the Web SDK translate pipeline from day one — this will be asked for.

### Phasing

| Phase | Content | Rough size |
|---|---|---|
| P0 | ~~`/lib/engine`: the nine counters, kind→counter mapping, lint rules, payload generator, tests, validated against §9~~ **done** — plus the bundle proposal and the Configurator cell map | — |
| P1 | ~~The wizard steps and results~~ · ~~deployable into a tenant~~ **done** — `npm run package` produces the hosted-application zip; manifest at `cumulocity.json` | — |
| P2 | ~~Explainer, quantified guidance report, machine presets~~ **done** | — |
| P3 | Persistence, export, standalone build | ~1 week |
| P4 | Pre-fill from tenant statistics; A/B scenario comparison | later |
| P5 | Write the counters straight into a Configurator copy, so nobody retypes nine numbers per period | later |

---

## 9. Worked example — the engine's acceptance test

1,000 rooftop HVAC units, steady state. Because billing is per calendar month, the example is stated
for a **31-day peak month** with the February figure alongside.

| Counter | Metric and kind | 31-day month | 28-day month |
|---|---|---|---|
| Measurements Created | `acme_Climate` — T, humidity, CO₂, pressure — 4 continuous, 1 bundle @ 60 s | 44,640,000 | 40,320,000 |
| Measurements Created | compressor on/off, filter status — 2 series @ 4,320 s, one type each | 1,240,000 | 1,120,000 |
| Events Created | service events — occurrence, 1/machine/day | 31,000 | 28,000 |
| Alarms Created | condition, 0.5/machine/day | 15,500 | 14,000 |
| Alarms Updated | the matching clears | 15,500 | 14,000 |
| Inventories Updated | firmware + config — inventory, 1/machine/day | 31,000 | 28,000 |
| Operations Created | 1 command/machine/month | 1,000 | 1,000 |
| Operations Updated | 3 status transitions per command | 3,000 | 3,000 |
| **Total messages** | | **45,977,000** | **41,528,000** |

Plus a one-off **1,000 `Inventories Created`** in the period the fleet is onboarded — not a monthly
figure.

The same fleet, doing exactly the same thing, spans **41.5 M to 46.0 M messages — an 11 % range** —
purely on month length. Reporting one number would be wrong eleven months out of twelve, which is why
the output is a range with the peak named.

### Against the naive baseline

Every series in its own measurement, at the interval it was given, same 31-day month:

| | Messages |
|---|---|
| As designed | 45,977,000 |
| Naive | 179,897,000 |
| **Difference** | **133,920,000** |

**3.9× less volume** — 74 % — for identical information. That is the product, and the whole of it is
the climate bundle: three of its four readings stop being messages of their own, 3 × 44,640 × 1,000.

It read 5.8× and 83 % until rev 24. The baseline then had a second clause — both statuses sampled at
60 s, the fleet's fastest tick — which went with the on-change rhythm (§4.4). Nothing about the
design changed and the designed figure did not move; the counterfactual it is measured against got
smaller, because the tool no longer has a rhythm to model that mistake in. **L2** warns about it
instead.

### The one caveat the tool should still carry

A 74 % reduction in messages is not automatically a 74 % reduction in what the customer pays. How
volume converts to money depends on commercial terms — commit blocks, floors, whatever the billing
system withdraws against — and none of that lives here.

So the tool states what it knows and stops: **this is a volume estimate.** The commercial consequence
is for the Configurator and the billing system to work out. That restraint is not a limitation to
apologise for; it is why the number can be trusted.

Worth saying out loud to a customer anyway: 222 million fewer writes a month is worth having whatever
the invoice does, because it buys query latency, headroom and a database that still behaves at
100,000 machines.

## 10. Risks

- **Garbage in.** Customers do not know their change rates, and they certainly do not know their
  command transition counts. Mitigation: presets, ranges rather than point values, and a sensitivity
  view showing which input moves the total most.
- **Wrong kind chosen.** The whole model rests on kind selection, and a mis-classified metric is
  invisible in the output. Mitigation: the §5 plain-language questions, an inline example per kind,
  and L2/L5 catching the two common mistakes after the fact.
- **Over-optimisation.** Bundling purely for volume can produce fragments that make no sense to a
  dashboard builder. Mitigation: the semantic-group split on **Measurements**, and L6.
- **Overselling savings.** A volume reduction is not automatically a cost reduction. Mitigation: the
  §9 caveat, and the discipline of never computing a bill (§2).
- **Definition drift.** The Configurator changes yearly. Mitigation: counting rules in one module,
  versioned against a named workbook revision — and no prices to go stale.

---

## 11. Open questions

### Answered — the counting rules are now settled

| Question | Answer | What it changed here |
|---|---|---|
| Are reads counted? | **No.** `POST` and `PUT` only; `GET` and `DELETE` are outside the commit. | — |
| Alarm and inventory updates? | **Counted**, at the same rate as creates. | — |
| Operations? | **Counted** — the command and every status update. | Added as the fifth element |
| Can measurements be updated? | **No.** Created only. | Eight counters plus one |
| **Does a batch help?** | **No.** Ten measurements in one batch request counts as **ten messages**. | Removed the `bulkCounting` switch. Added the *batch for the network, bundle for the count* rule (§2) |
| **What is a month?** | **Calendar month.** | Removed the month-basis setting; the engine works in real month lengths and sizes on the longest month (§2, §9) |
| **Do no-op `PUT`s count?** | **Yes. Every `PUT` counts.** | New guard-rail (§3) and lint rule L10 |
| **Bytes per stored value?** | **100–400 B in MongoDB, unverified** (StorageCalculation.txt). | §4.6 reports the full range and its provenance, and writes the top of it into the ODS cell where a single number is required; §4.4 still rests on message count and transition timing, not on a storage saving, because a 4x spread cannot carry an argument |
| **Maximum series per measurement?** | **Do not exceed 100.** | L6 now fires above 100, as a platform recommendation rather than our guess |
| **Do failed requests count?** | **No.** Only successful writes. | A retry loop costs network, not messages (§2). The no-op `PUT` rule stands — a *successful* write that changes nothing still counts |
| **Reads?** | **Confirmed not counted.** | — |
| **Who handles withdrawal against the commit?** | **An attached billing system.** | Removed billable units, utilisation, headroom, commit sizing and overage from the tool entirely (§2, §7) |

Six of those answers *removed* things from the design — a switch, a setting, a claim we could not
support, and an entire output section. The concept is materially smaller and more defensible than it
was two revisions ago, and every removal made the remaining number easier to trust.

### One question restated

**Where do the nine counters come from in a live tenant?** My earlier phrasing was unclear, so more
precisely:

When a customer is already running on Cumulocity, is there a place in the tenant — a usage or
statistics endpoint, a billing report, an admin screen — that reports these same nine numbers for a
past calendar month? Two reasons it matters:

1. **Validation.** If we can read a real tenant's actual counters and compare them against what this
   calculator predicts for that same fleet, the engine gets a ground-truth test. Without that, every
   number it produces is unverified arithmetic.
2. **Pre-fill.** An existing customer planning expansion should not re-describe a fleet the platform
   already knows about. Reading last month's counters and letting them model the *delta* is a far
   better experience than starting from an empty form — and it is the difference between "estimate the
   future" and "explain the present bill".

If no such view exists, that is a useful answer too: it means the calculator is the only source of
these numbers, which raises the bar on its testing and removes P4 from the roadmap.

Both questions raised in the previous revision are now closed: overage is the billing system's
concern, not ours, and failed requests do not count. **This is the only open item left.**

---

## 12. Decisions requested

Only one open question remains, and only one decision is genuinely hard to reverse.

1. **Answer §11's restated question** — where a live tenant reports these nine counters. It is the
   difference between a tested engine and an untested one, and it decides whether P4 exists.
2. **Confirm the six kinds (§5)** are the right vocabulary to put in front of a customer. This is the
   decision that is hard to change later, because the data model and every lint rule hang off it.
3. **Confirm the output contract** — the nine counters per calendar month per period, shaped for
   `D28:D36`, and nothing downstream of that.
4. **Confirm the scope line (§2).** Messages only: no billable units, no utilisation, no headroom, no
   commit sizing, no prices. Easier to hold from the start than to retrofit, and it is what lets one
   build serve customers, prospects and presales alike.
5. **Start P0.** The counting rules are settled, so the engine can be built against a fixed
   specification rather than a switch per ambiguity.

---

*Message definition per the Cumulocity domain model and `[CTC] Sales Configurator (2026 Update).xlsx`
— `Configurator!D28:D36` (the nine counters). Read with [tools/xlsx_dump.py](tools/xlsx_dump.py). This
document contains no pricing data by design, and models nothing downstream of message volume.*
