/**
 * English, and the source of truth for what keys exist.
 *
 * `de.ts` is typed against this object, so adding a string here without
 * translating it is a compile error. Keys are namespaced by the screen or
 * component that shows them; `.one`/`.other` pairs are plural forms picked by
 * `t.plural`.
 *
 * The markup is the four marks `rich.ts` understands: `**bold**`, `*emphasis*`,
 * `` `code` ``, and a blank line between paragraphs. Punctuation is literal --
 * em dashes, curly quotes -- because an HTML entity in a catalogue is a thing a
 * translator has to know about.
 */

export const en = {
  /* ------------------------------------------------------- app chrome */
  // The page's own title, shown by the shell's `c8y-title` in the Web SDK
  // build. The standalone build has no header to put it in -- it is the browser
  // tab there -- so this key belongs to one of the two apps.
  'app.tagline': 'Message calculator — a volume estimate, never a quote',
  'app.scenarioName': 'Scenario name',
  'app.stat.peakMonth': 'messages / peak month',
  'app.stat.vsUnbundled': 'vs unbundled',
  'app.stat.findings': 'findings',
  'app.stat.toFix': '{count} to fix',
  'app.expert': 'Expert mode',
  'app.expert.title': 'Shows the raw JSON payloads for whoever writes the device code.',
  'app.language': 'Language',
  'library.label': 'Scenario',
  'library.add': 'New scenario',
  'library.delete': 'Delete this scenario',
  'library.untitled': 'Untitled scenario',
  'library.confirmDelete': 'Delete “{name}”? This cannot be undone.',

  'nav.back': 'Back',
  'nav.progress': 'Step {step} of {total}',
  'nav.loadExample': 'Load example',
  'nav.reset': 'Reset',
  'io.import': 'Import',
  'io.export': 'Export scenario',
  'io.unreadable': 'That file is not a scenario this tool can read.',

  /* ------------------------------------------------------- the wizard */
  'steps.fleet.title': 'Machines',
  'steps.fleet.lead': 'What kinds of machine are there, and how many of each?',
  'steps.series.title': 'Measurements',
  'steps.series.lead': 'What does each machine measure, and how often?',
  'steps.discrete.title': 'Events, alarms, inventory & commands',
  'steps.discrete.lead':
    'What else does a machine report, what is simply true about it, and what gets sent back to it?',
  'steps.contract.title': 'Contract & deployment',
  'steps.contract.lead':
    'How long each period is, how the fleet ramps across them, and what is deployed in each.',
  'steps.results.title': 'Results',
  'steps.results.lead': 'Messages per calendar month, and where each number goes.',

  /* ------------------------------------------------- shared controls */
  'copy.done': 'Copied',
  'copy.blocked': 'Blocked',
  'copy.refused': 'The browser refused the clipboard',
  'choice.other': 'Other…',
  'every.prefix': 'every',

  /* --------------------------------------------------------- numbers */
  // Suffixes on a headline figure. Symbols, not words, in both languages -- a
  // stat tile is read at a glance and "46.0 million" does not fit in one.
  'format.thousand': 'k',
  'format.million': 'M',
  'format.billion': 'bn',
  'format.gibMonths': '{amount}-months',
  'format.interval': 'every {duration}',

  /* ----------------------------------------------------------- units */
  // Both forms for every unit, so one helper covers the dropdown and the prose.
  // The SI symbols are the same in both languages and are still keys, because a
  // language that abbreviates differently should not need a code change.
  'unit.ms.one': 'ms',
  'unit.ms.other': 'ms',
  'unit.s.one': 's',
  'unit.s.other': 's',
  'unit.min.one': 'min',
  'unit.min.other': 'min',
  'unit.h.one': 'h',
  'unit.h.other': 'h',
  'unit.day.one': 'day',
  'unit.day.other': 'days',
  'unit.week.one': 'week',
  'unit.week.other': 'weeks',
  'unit.month.one': 'month',
  'unit.month.other': 'months',
  'unit.year.one': 'year',
  'unit.year.other': 'years',

  /* ------------------------------------------------- the metric kinds */
  // The words each screen uses for what a customer added. A state is a series
  // too -- one sent when the value moves rather than on a tick -- so it is named
  // as one.
  'kind.continuous.one': 'time series',
  'kind.continuous.other': 'time series',
  'kind.occurrence.one': 'event',
  'kind.occurrence.other': 'events',
  'kind.condition.one': 'alarm',
  'kind.condition.other': 'alarms',
  'kind.inventory.one': 'inventory entry',
  'kind.inventory.other': 'inventory entries',
  'kind.command.one': 'command',
  'kind.command.other': 'commands',
  'measurementType.one': 'measurement type',
  'measurementType.other': 'measurement types',

  /* -------------------------------------- machine-type presets */
  'preset.hvac.blurb': 'Four climate readings on one tick, two states that sit still for hours.',
  'preset.meter.blurb': 'Register reads on a 15-minute interval; almost nothing else.',
  'preset.tracker.blurb': 'Position and battery together; movement start and stop as events.',
  'preset.gateway.blurb': 'Aggregates a line and forwards a summary — the biggest volume lever there is.',
  'preset.machine.blurb': 'Fast process readings, a shift state, and alarms an operator has to act on.',

  /* ----------------------------------------------------- fleet */
  'fleet.teach.title': 'Start with the machines, not the data',
  'fleet.teach.body': 'A **machine type** is a group of machines that behave the same way — same sensors, same firmware, same reporting. Every machine of a type produces identical traffic, so the estimate scales from the count.\n\nSplit into separate types only where the *data* differs. Two hundred pumps in Hamburg and two hundred in Lisbon are one type; a pump and a gateway are two.',
  'fleet.empty': 'Add a machine type below to begin.',
  'fleet.col.type': 'Machine type',
  'fleet.col.talks': 'Talks',
  'fleet.col.count': 'How many',
  'fleet.col.online': 'Online %',
  'fleet.namePlaceholder': 'Rooftop HVAC unit',
  'fleet.nothingModelled': 'nothing modelled yet',
  'fleet.protocolPlaceholder': 'Name the protocol',
  'fleet.protocolOther': 'Something else…',
  'fleet.online.title': 'Duty cycle or connectivity availability. A machine that is offline sends nothing.',
  'fleet.remove': 'Remove',
  'fleet.total.one': '{count} type',
  'fleet.total.other': '{count} types',
  'fleet.add': 'Add',
  'fleet.addBlank': 'Blank machine type',
  'fleet.presetNote': 'Presets arrive fully modelled and are meant to be edited — each one is built the way the tool recommends, so starting from one starts you from a good design.',

  /* ------------ platform elements, and the machine-type header */
  'element.measurements': 'Measurements',
  'element.events': 'Events',
  'element.alarms': 'Alarms',
  'element.inventory': 'Inventory',
  'element.operations': 'Operations',
  'machine.unnamed': 'Unnamed machine type',
  'machine.machines': '{count} machines',
  'machine.onlinePct': '{pct} % online',
  'machine.none': 'none',
  'machine.nothingModelled': 'nothing modelled yet',
  'machine.messagesPerMonth': 'messages / month',
  // Used where the header counts one element rather than all five, so the
  // figure says which. "messages / month" alone was read as the whole machine
  // type on a step that only edits part of it.
  'machine.elementPerMonth': '{element} / month',
  'machine.perMachine': '{count} per machine',
  'machine.intervals': '{count} intervals',

  /* --------------------------------- events, alarms, inventory */
  'discrete.teach.title': 'Four different things, and the difference matters',
  'discrete.teach.body': 'Everything so far was a number over time. What is left is everything else that travels between a machine and Cumulocity: three places for what the machine reports, one for what is sent back to it. The wrong choice changes what you can do with the data afterwards, and what you pay.\n\nThe one-line test: **an event is something that happened**, **an alarm is something that is wrong**, **inventory is something that is true right now**, and **a command is something you want the machine to do**.',
  'discrete.none': 'None.',
  'discrete.occurrence.heading': 'Events',
  'discrete.occurrence.element': 'Event',
  'discrete.occurrence.question': 'Something happened worth recording, and nobody has to act on it.',
  'discrete.occurrence.rate': 'Per machine / day',
  'discrete.occurrence.placeholder': 'Door opened',
  'discrete.occurrence.add': '+ Event',
  'discrete.occurrence.teach': 'An event is a **non-numeric** thing that happened, with a timestamp: a door opened, a trip started, a service was performed. Creating one is one message.',
  'discrete.condition.heading': 'Alarms',
  'discrete.condition.element': 'Alarm',
  'discrete.condition.question': 'Something is wrong and somebody has to act on it.',
  'discrete.condition.rate': 'Raises / machine / day',
  'discrete.condition.placeholder': 'Filter blocked',
  'discrete.condition.add': '+ Alarm',
  'discrete.condition.teach': 'An alarm is a **state with a lifecycle**, not a notification. It is raised, it stays active while the condition persists, and it is cleared when the condition ends.\n\n**That is two messages per incident:** the raise counts as Alarms Created, the clear as Alarms Updated. The tool counts both.\n\nRaising an alarm type that is *already active* does not create a second alarm — Cumulocity updates the existing one, which still counts. A device re-raising the same alarm every minute bills every minute and tells an operator nothing new. If you mean “this happened again”, that is an event.',
  'discrete.inventory.heading': 'Inventory — what the machine is, right now',
  'discrete.inventory.element': 'Inventory',
  'discrete.inventory.question': 'Something that is simply true about the machine, rather than a reading over time.',
  'discrete.inventory.rate': 'Changes',
  'discrete.inventory.placeholder': 'Firmware version',
  'discrete.inventory.add': '+ Inventory entry',
  'discrete.inventory.teach': 'The managed object holds a machine’s **current state**: firmware version, serial number, configuration, location. Updating one counts exactly like creating a measurement.\n\n**Inventory is not a time series store.** Writing a changing value here bills every time, overwrites what was there and leaves nothing to chart. If the history matters, it is a series.',
  'discrete.inventory.registrationNote': 'Registering a machine for the first time is **Inventories Created**, counted once per machine from your rollout numbers. You do not enter it here.',
  'discrete.inventory.timerColumn': 'Sent on a timer?',
  'discrete.inventory.timerLabel': 're-sent even when unchanged',
  'discrete.chooseOne': 'Choose one…',
  'discrete.perMachineMonth': '{count} per machine in a 31-day month',

  /* ------------------------------------- shared wizard strings */
  'wizard.addMachineFirst': 'Add a machine type first.',

  /* ----------------------------------- dropdown group headings */
  'group.access': 'Access',
  'group.buildingAndMetering': 'Building and metering',
  'group.climate': 'Climate',
  'group.configuration': 'Configuration',
  'group.connectivity': 'Connectivity',
  'group.control': 'Control',
  'group.deviceHealth': 'Device health',
  'group.diagnostics': 'Diagnostics',
  'group.electrical': 'Electrical',
  'group.fault': 'Fault',
  'group.general': 'General',
  'group.identity': 'Identity',
  'group.lifecycle': 'Lifecycle',
  'group.lowPowerWan': 'Low-power WAN',
  'group.maintenance': 'Maintenance',
  'group.mechanical': 'Mechanical',
  'group.movement': 'Movement',
  'group.physical': 'Physical',
  'group.position': 'Position',
  'group.process': 'Process',
  'group.production': 'Production',
  'group.security': 'Security',
  'group.shopFloor': 'Shop floor',
  'group.somethingElse': 'Something else',
  'group.status': 'Status',
  'group.straightToCumulocity': 'Straight to Cumulocity',
  'protocol.undecided': 'Not decided yet',

  /* -------------------------------- command status transitions */
  'transitions.0': 'none reported — 1 message per command',
  'transitions.1': '1 — SUCCESSFUL only — 2 messages',
  'transitions.2': '2 — EXECUTING, SUCCESSFUL — 3 messages',
  'transitions.3': '3 — PENDING, EXECUTING, SUCCESSFUL — 4 messages',
  'transitions.4': '4 — with a retry or a failure — 5 messages',
  'transitions.6': '6 — progress reported through status — 7 messages',
  'transitions.10': '10 — fine-grained progress — 11 messages',

  /* -------------------------------------------------- commands */
  'commands.heading': 'Commands',
  'commands.element': 'Operation',
  'commands.teach.title': 'One command is more than one message',
  'commands.teach.body': 'Everything above is the machine talking to Cumulocity. An **operation** goes the other way: a firmware update, a configuration push, a reboot, a setpoint change.\n\nCreating the operation counts, and every status the device reports back counts too — `PENDING`, `EXECUTING`, `SUCCESSFUL` is three more. Count four messages per command, not one.\n\nIf your devices report fine-grained progress through the operation status, count those as well. Progress usually belongs in an event.',
  'commands.add': '+ Command',
  'commands.none': 'None. If Cumulocity never sends anything to these machines, that is a legitimate answer — but firmware updates count, and almost every fleet has those.',
  'commands.col.command': 'Command',
  'commands.col.howOften': 'How often',
  'commands.col.transitions': 'Status transitions reported back',
  'commands.col.each': 'Messages each',
  'commands.namePlaceholder': 'Name it yourself',
  'commands.chooseOne': 'Choose a command…',
  'commands.perMachineMonth': '{count} per machine / month',
  'commands.breakdown': '1 create + {count} updates',
  'commands.transitionsSuffix': 'transitions',

  /* ----------------------------- contract periods and the ramp */
  'contract.ramp.heading': 'Periods and the ramp',
  'contract.ramp.sub': 'Months → D21 · machines per period',
  'contract.teach.title': 'Billing runs on real calendar months',
  'contract.teach.body': 'February is 28 days and January is 31 — an **11 % swing** for a fleet doing exactly the same thing. The tool works in real month lengths and names the peak month. A single number would be wrong eleven months out of twelve.\n\n**Registration follows the ramp.** Each period contributes *Inventories Created* only for the machines it *adds*, once, in its first month. Putting onboarding into the monthly rate overstates every later period.',
  'contract.rampStarts': 'Ramp starts',
  'contract.year': 'Year',
  'contract.retention': 'Data kept, default',
  'contract.retention.suffix': 'days',
  'contract.retention.title': 'Days of data the tenant keeps by default. A measurement type with a retention rule of its own — set on the Measurements step — overrides this. Decides the operational storage estimate on the Results step; it does not change the message count.',
  'contract.bytesPerValue': 'Bytes / value',
  'contract.bytesPerValue.title': 'Bytes per stored value, for the storage figure that goes in the Configurator’s ODS cell. The evidence is 100-400 B and unverified, so the Results step and the workbook always show the whole range beside whatever this is set to.',
  'contract.col.period': 'Period',
  'contract.col.months': 'Months',
  'contract.periodN': 'Period {index}',
  'contract.remove': 'Remove',
  'contract.addPeriod': 'Add period',
  'contract.addPeriod.hint': 'The Configurator allows five. A contract auto-renews on a 12-month term if it ends without a new agreement, and unused commitment is forfeited rather than carried forward.',

  /* -------------------------------------------- unnamed things */
  'machine.unnamedShort': 'Unnamed',

  /* ------------------------------------ deployment and add-ons */
  'deployment.heading': 'Deployment & add-ons',
  'deployment.sub': 'One column per period → Configurator rows 23–26',
  'deployment.teach.title': 'The parts of the quote the fleet cannot tell you',
  'deployment.teach.body': 'Message volume comes out of the machines. Nothing in this section does: how many deployments, which add-ons, how many tenants. Somebody has to state them, so the wizard asks.\n\nCumulocity is **commit-to-consume**: a customer commits to a spend amount, not to quantities. So nothing here is an order; it is the shape of the estimate.\n\n**This tool shows no prices.** It collects the quantities and names the cell each one belongs in.',
  'deployment.col.item': 'Line item',
  'deployment.col.unit': 'Unit',
  'deployment.copyAcross': 'Copy period 1 across all periods',
  'deployment.copyAcross.hint': 'Most quotes repeat the same deployment every period; the fleet is what ramps.',
  'deployment.notAsked': '**Not asked for, deliberately:** discounts, currency, minimum commitments and approval thresholds. Those live in the Configurator and are nobody’s business inside a tool that may be shown to a customer.',
  'deployment.yes': 'Yes',
  'deployment.no': 'No',
  'deployment.estimate': 'estimate {value} GiB-months',
  'deployment.estimatedAt': 'estimated at {bytes} B / value · {low}–{high} GiB-months across the range',

  /* ---------------------------------------------- measurements */
  'series.count.one': '{count} series',
  'series.count.other': '{count} series',
  'series.empty': 'Add a machine type first — a series belongs to a machine.',
  'series.teach.title': 'One measurement, one timestamp, one message',
  'series.teach.body': 'A measurement carries **one timestamp** and any number of series. Creating one is **one message**, whether it carries one series or forty — so what decides your volume is not how much data you send, but how many requests you spread it across.\n\nThe interval does the grouping: everything read on the same tick can share a measurement. Readings on *different* intervals never can.\n\n**A flag is a series too**, and the interval you give it is the interval you pay for. Say how often each row is read; the *Measurement type* column is where you rename or split what the tool designs.',
  'series.choose': 'Choose a series…',
  'series.heading': 'Series — what this machine measures',
  'series.none': 'None yet. A series is one named value over time — a temperature, a pressure, a compressor on/off.',
  'series.col.series': 'Series',
  'series.col.unit': 'Unit',
  'series.col.howOften': 'How often',
  'series.col.type': 'Measurement type',
  'series.col.count': 'How many',
  'series.countTitle': 'How many series this row stands for. Leave it at 1 for a reading you have named; type the tag count when a machine exposes hundreds you will not list one by one.',
  'retention.col': 'Kept for',
  'retention.title': 'Days the tenant’s retention rule keeps this type. Empty uses the scenario default from the Contract step. It moves no message count — only how much is still in the database when the month closes.',
  'retention.inherited': 'scenario default',
  'retention.shared': 'as its measurement type',
  'series.retentionNote': 'A **retention rule belongs to the measurement type**, so it is set once per type and every series inside is kept as long. Empty means the scenario default of **{days} days**, set on the Contract step. Retention moves no counter — only how much is still in the database when the month closes, which is what storage is billed on.',
  'discrete.retentionNote': 'Every row here is a type of its own, so each carries **its own retention rule** — empty meaning the scenario default of **{days} days**. This is where retention earns its keep: measurements kept for a week beside alarms kept for five years is an ODS bill the alarms dominate, and no fleet-wide ratio would have told you that.',
  'discrete.inventory.retentionNote': '**Retention does not apply here.** A write overwrites the managed object in place, so nothing accumulates to age out — and a managed object is not one of the types a retention rule covers. Every device you register stays in the inventory, and counts towards storage, until somebody deletes it.',
  'series.namePlaceholder': 'Name it yourself',
  'series.unitPlaceholder': 'Unit',
  'series.samplesPerMonth': '{count} samples / machine / month',
  'series.typeOption': '{name} · {series}',
  'series.typeUnnamed': 'unnamed',
  // The two headings lead with what the choice does to the message count,
  // because that is the question a reader brings to this column -- "bundled or
  // not". The group is still only the types on this row's interval, since a
  // measurement carries one timestamp; the heading says the consequence and the
  // option names say which type.
  'series.typesOnInterval': 'Shares a message',
  'series.onItsOwn': 'On its own',
  'series.ownType': 'One measurement for all series',
  'series.typePerSeries': 'One measurement per series',
  'series.solo.perSeries': '{count} messages per sample — {name}1 to {name}{count}',
  'series.overRecommended': 'one message for all {count} series — over the {max} recommended',
  'series.solo.overRecommended': 'one message per sample — {count} series is over the {max} recommended',
  'series.oneMessageForAll': 'one message for all {count} series',
  'series.oneMessagePerSample': 'one message per sample',
  'series.sameMessage': 'in that same message',
  'series.countNote': 'A row can stand for **more than one series** — 450 PLC tags on one scan is one row reading *450*, not 450 rows. The platform recommends at most **{max} series per measurement**, so a larger count travels in several, each one a message per sample.',
  'series.namingNote': 'A measurement type is the fragment your device sends, so pick a name a dashboard builder will recognise. **Do not change the series inside it afterwards** — a fragment whose shape varies degrades write and query performance.',
  'series.add': '+ Series',
  'series.whatItSends': 'What one of these machines sends',

  /* ------------------------------------------ payload examples */
  'payload.heading': 'Payloads to hand the device team',
  'payload.sub': 'Every name this design needs, and the JSON for each',
  'payload.copy': 'Copy',
  'payload.oneMessage': '1 message.',
  'payload.messages': '{count} messages.',
  'payload.mqttTopic': 'MQTT topic: {topic}',
  'payload.ns.measurement': 'measurement fragment',
  'payload.ns.measurement.plural': 'measurement fragments',
  'payload.ns.event': 'event type',
  'payload.ns.event.plural': 'event types',
  'payload.ns.alarm': 'alarm type',
  'payload.ns.alarm.plural': 'alarm types',
  'payload.ns.inventory': 'inventory fragment',
  'payload.ns.inventory.plural': 'inventory fragments',
  'payload.blurb.measurement': 'One per interval bundle, plus one per state or flag. A state needs its own because two flags that change independently cannot share a fragment — sending one would mean omitting the other, and that is the varying-shape problem again.',
  'payload.blurb.event': 'A separate namespace from measurements. Event types never collide with fragment names.',
  'payload.blurb.alarm': 'Also its own namespace. One type per condition, raised and cleared through its lifecycle.',
  'payload.blurb.inventory': 'Fragments on the managed object. Separate again from measurement fragments, even where the name looks alike.',
  'payload.title.bundle': '{series} every {seconds} s',
  'payload.title.alone': 'its own measurement, every {seconds} s',
  'payload.title.counted': '{count} series in measurements of their own, every {seconds} s',
  'payload.title.perSeries': 'one of {count} measurement types, every {seconds} s',
  'payload.title.raiseAndClear': '{name} — raise and clear',
  'payload.note.bundle': 'One message, one timestamp — regardless of how many series it carries. Send exactly this series set every time: a fragment whose shape varies from message to message is what degrades write and query performance.',
  'payload.note.smartrest': 'Over MQTT, the JSON above goes to the topic shown. The SmartREST static measurement template carries one series per row, so bundling several series into one measurement needs a custom SmartREST 2.0 template that renders this whole fragment in a single request.',
  'payload.note.perSeries': 'One series, one measurement, one message — and {count} of these go out on every tick, named {name}1 to {name}{count}. This is the shape the tool measures its baseline against: the same readings on one timestamp would be {types} messages a tick instead of {count}. Send it this way only if the device genuinely cannot batch the series into one request.',
  'payload.note.overRecommended': '{count} series in one measurement is over the {max} the platform recommends. It is still one message — the cost is that a very wide measurement is slower to write and to query. Split it if the dashboards suffer; the message count is what goes up when you do.',
  'payload.note.alone': 'This reading travels alone, so it costs one message per sample on its own. If anything else is sampled on the same tick, they belong in one measurement.',
  'payload.note.event': 'Events hold non-numeric data. A number buried in an event body cannot be aggregated or plotted the way a series can.',
  'payload.note.alarm': 'Two messages per incident: the raise creates and the clear updates, and both count. Raising an alarm type that is already active updates the existing alarm rather than creating a duplicate — which still counts.',
  'payload.note.inventory': 'Send this when it changes, not on a timer. The platform does not compare payloads, so an update that changes nothing still counts.',

  /* --------------------- the results step: workbook and design */
  'results.empty': 'Nothing to compute yet — go back and describe a machine.',
  'design.heading': 'What each machine sends',
  'design.sub': 'The design behind the counters',
  'design.measurements.one': '{count} measurement',
  'design.measurements.other': '{count} measurements',
  'workbook.heading': 'Take it away',
  'workbook.sub': 'Five sheets, and a Quote sheet ready to be priced',
  'workbook.download': 'Download Excel workbook',
  'workbook.sendIt': '**Send this to your account team.** It carries the quantities and the price columns they need, and no prices — so it is safe to email either way.',
  'workbook.sheet.quote': 'Quote',
  'workbook.sheet.quote.what': 'Where the account team works. Quantities are already filled in; they type their own unit prices into the shaded column and the line totals, monthly total and period total compute themselves. Messages come pre-rounded into blocks of 100,000.',
  'workbook.sheet.configurator': 'Configurator',
  'workbook.sheet.configurator.what': 'Every quantity on the row the Sales Configurator keeps for it, so column D can be copied for a period and pasted at the same cell.',
  'workbook.sheet.design': 'Design',
  'workbook.sheet.design.what': 'Every reading, its cadence, and the measurement it travels in.',
  'workbook.sheet.months': 'Months',
  'workbook.sheet.months.what': 'All nine counters for every calendar month — where the range comes from.',
  'workbook.sheet.guidance': 'Guidance',
  'workbook.sheet.guidance.what': 'What the tool flagged, and what each finding is worth.',
  'workbook.builtHere': 'Built in your browser: nothing is uploaded and no scenario leaves the tenant. The tool holds no price list, so the file cannot carry one — the numbers arrive from whoever does the quoting. Discounts beyond the single catalog field, approval thresholds and currency conversion stay in the Sales Configurator, which remains the source of truth for an approved quote.',
  'payload.hidden': 'The exact JSON each machine should send — one example per measurement, event, alarm and inventory write — is ready for whoever writes the device code. Turn on **Expert mode** in the header to see it.',

  /* --------------------------------- engine prose the UI shows */
  'engine.naiveBaselineRule': 'Every series in its own measurement, at the interval it was given, instead of sharing one with everything on the same tick. Events, alarms, inventory writes and operations are identical in both models — the whole difference is in the Measurement API.',
  'engine.storageSourceNote': '100–400 bytes a stored value, unverified at source. The spread is the evidence, not a rounding.',

  /* -------------------------------------- results: the figures */
  'results.stat.peakMonth': 'Peak month',
  'results.stat.peakMonth.sub': '{month}, {days} days',
  'results.stat.peakMonth.registrations': ' · includes {count} registrations',
  'results.stat.range': 'Calendar-month range',
  'results.stat.range.swing': '{pct} % swing on month length alone, steady state',
  'results.stat.range.same': 'Same fleet, different month lengths',
  'results.stat.perMachine': 'Per machine / month',
  'results.stat.perMachine.sub': 'the figure architects reason with',
  'results.stat.perSecond': 'Messages / second',
  'results.stat.perSecond.sub': 'averaged across the month',
  'byType.heading': 'Where the volume comes from',
  'byType.empty': 'No machine types yet.',
  'ramp.heading': 'Month by month',
  'ramp.months.one': '{count} month',
  'ramp.months.other': '{count} months',
  'ramp.tooltip': '{month} · {count} messages · {days} days',
  'ramp.monthsFrom.one': '{count} month from {month}',
  'ramp.monthsFrom.other': '{count} months from {month}',
  'ramp.peak': 'peak {month}',
  'findings.heading': 'Guidance',
  'findings.nothing': 'nothing to flag',
  'findings.errors.one': '{count} error',
  'findings.errors.other': '{count} errors',
  'findings.warnings.one': '{count} warning',
  'findings.warnings.other': '{count} warnings',
  'findings.suggestions.one': '{count} suggestion',
  'findings.suggestions.other': '{count} suggestions',
  'findings.clean': 'Nothing to flag. Continuous readings are bundled by interval and semantics, states are sent on change, and no fragment carries a varying series set.',
  'findings.perMonth': 'msg / month',
  'results.disclaimer': 'This is a **volume estimate**, not a quote. It reports messages per calendar month and nothing else: no prices, no billable units, no commitment sizing. Usage is metered by the platform and drawn down by the billing system — what these numbers cost is for the Configurator and the commercial terms to settle.',

  /* ----------------------- results: storage and the commitment */
  'storage.heading': 'Operational storage',
  'storage.sub': 'What the database holds at each month’s end, added up — the quantity ODS bills',
  'storage.stat.ods': 'ODS, period {index} · GiB-months',
  'storage.stat.ods.sub': '{months} month-ends summed, at {bytes} B / value · {range} across the range',
  'storage.stat.fullest': 'Fullest month',
  'storage.stat.fullest.sub': 'kept {kept}',
  'storage.stat.fullest.partial': ' · only {days} days of history yet',
  'storage.stat.onDisk': 'Values on disk',
  'storage.stat.onDisk.sub': '{count} written that month',
  'storage.stat.perMeasurement': 'Values per measurement',
  'storage.stat.perMeasurement.shared': 'one envelope, not {count}',
  'storage.stat.perMeasurement.alone': 'one envelope per value: nothing shared',
  'storage.stat.dataHub': 'DataHub extract, period {index} · GiB-months',
  'storage.stat.dataHub.sub': '20–25 % of the same data',
  'storage.odsCell': '**{amount}** goes in the ODS cell for period {index}: {months} month-ends added up, at {bytes} B a value. One figure out of a range — {note} Override it in the deployment panel.',
  'storage.bundlingHelps': 'A measurement carrying {count} values pays for its envelope once, not {count} times, so a well-bundled fleet sits below the quoted figure rather than above it.',
  'storage.retentionDecides': '**Retention decides the size, not the traffic.** Kept **{kept}**{note} — a rule per type, over the default on the Contract step.',
  'storage.retentionDefault': ' (the starting assumption)',
  'storage.documentsToo': 'Events, alarms, operations and every registered device count too: **{share}** of what is kept. The byte figure was measured on datapoints, so that share is the weaker half.',
  'storage.kept.uniform': 'for {days} days',
  'storage.kept.mixed': 'for {from} to {to} days, by measurement type',
  'storage.perPeriod': 'By period:',
  'storage.under1pct': 'under 1 %',
  'commitment.heading': 'The commitment',
  'commitment.sub': '{months} months · every quantity a commit-to-consume total is built from',
  'commitment.stat.messages': 'Messages over the term',
  'commitment.stat.quoted': 'Billable units, as quoted',
  'commitment.stat.actual': 'Billable units, month by month',

  /* ---------------------------------------------- the hand-off */
  'handoff.heading': 'Hand-off to the Sales Configurator',
  'handoff.sub': 'Peak calendar month of each period',
  'handoff.col.item': 'Line item',
  // The column header carries the period's own length, because the figures
  // under it are per month and a reader who typed "12 months" and saw only
  // "31 days" reasonably concluded the length had been ignored. It has not:
  // the length is D21, and the Configurator multiplies by it.
  'handoff.periodHeading.one': '{label} · {count} month',
  'handoff.periodHeading.other': '{label} · {count} months',
  // "quoted at", not just the month: it says the month is the basis the
  // quantities are stated at rather than the span they cover.
  'handoff.periodPeak': 'quoted at {month} · {days} days',
  'handoff.periodLength': 'Period length',
  'handoff.months': 'months',
  // Replaces the Configurator's own unit on the Messages row. That unit reads
  // "per 100K per month", which describes how the row is PRICED, and sitting
  // under a raw 46,009,000 it was read as the unit the figure was in -- so the
  // row appeared to be out by a factor of 100,000. The blocks of 100,000 are
  // the Quote sheet's business; this row states what its number is.
  //
  // "sum of" was the first attempt and read as summed over the PERIOD -- every
  // row here is one calendar month, the period's peak, and 45,978,000 against
  // a 12-month period total of 541,344,000 is a difference worth not being
  // vague about. "Added together" names the nine rows underneath as what is
  // being added, which is the only axis this figure sums along.
  'handoff.messages.what': 'the nine counters below, added together · the Configurator computes it',
  'handoff.estimated': ' · estimated, overridable',
  'handoff.estimateTitle': 'the tool’s estimate; state a figure in the deployment panel to override it',
  'handoff.lengthLabel': 'Period {index} length in months',
  // The deployment and add-on rows nobody filled in. 13 of the 15 are dashes on
  // a typical estimate, and they bury the two that are not. Collapsed, never
  // dropped: the table is a checklist of Configurator cells, so a row that is
  // empty because nobody has decided yet still has to be findable.
  'handoff.unused.one': '{count} row at zero',
  'handoff.unused.other': '{count} rows at zero',
  'handoff.unused.show': 'Show',
  'handoff.unused.hide': 'Hide',
  'handoff.counters': 'Counters',
  'handoff.counters.explain': '**Counters** copies the nine numbers above as a single column, in Configurator order. Select that period’s counter block — `{range}` in period 1, and {stride} rows lower for each period after — and paste once.',
  'handoff.counters.title': 'Nine counters for period {index}, ready to paste at {cell}',
  'handoff.all': 'All',
  'handoff.all.explain': '**All** copies every row as *cell, value, label*, tab separated. Not a paste target — the cells are not contiguous — but a checklist to work down and tick off.',
  'handoff.all.title': 'Every cell, value and label for period {index}',

  /* --------------------------------- the guidance rules L1-L10 */
  'lint.L1.title': '{count} series share {interval} s and “{semantic}” but travel in {containers} measurements',
  // No semantic group on any of them, so there is none to name. Quoting the
  // placeholder read as “share 1 s and “(none)””, which claims a shared group
  // called none rather than no group at all.
  'lint.L1.titleNoGroup': '{count} series share {interval} s but travel in {containers} measurements',
  // The shared tick is the claim; whether they also share a semantic group is
  // the title's business, and repeating it here overclaimed for series nobody
  // put in a group at all.
  //
  // The series are the subject, not the row names. "{names} are read…" was
  // right only while L1 needed two rows to fire; one row sending a measurement
  // type per series now trips it too, and a single name read as "Reading are
  // read on the same tick".
  'lint.L1.detail': '{count} series on the same tick, spread across {containers} measurements: {names}. They can share one timestamp — one message instead of {containers}, for identical information.',
  'lint.L3.title': '“{name}” is a {kind} metric inside interval bundle {fragment}',
  'lint.L3.detail': 'Only continuous readings belong in an interval bundle. Anything sent on change makes the bundle send a different set of series from one message to the next, and a fragment whose shape varies is what degrades write and query performance. Give it its own measurement.',
  'lint.L2.title': '“{name}” reads like a status, sampled every {interval} s',
  'lint.L2.detail': 'A two-state value on a fast tick pays for every identical reading: **{sends} messages per machine per month** to learn something that may change a handful of times a day. Set its interval to how often it actually moves — a flag that changes twenty times a day is one reading every 72 minutes, and the message count falls in the same proportion.',
  'lint.L4.title': 'Bundle {fragment} is sampled faster than once a second',
  'lint.L4.detail': 'At {interval} s this is {messages} messages a month from {machines} machines. Sub-second sampling almost always belongs on an edge gateway that aggregates and forwards a summary; a gateway sending one message a second instead of sixty carries the same signal for a sixtieth of the volume.',
  'lint.L6.size.title': '{fragment} carries {count} series, over the {max} recommended',
  'lint.L6.size.detail': 'The platform recommends at most {max} series in one measurement. It accepts more, and this estimate counts it as you described it — one message per sample. The cost is document shape rather than volume: a very wide measurement is slower to write and to query, and it gets worse over the tenant’s life. Splitting it into {types} would fix that and add a message per sample for each one.',
  'lint.L6.mixed.title': 'Bundle {fragment} mixes {count} unrelated groups of readings',
  'lint.L6.mixed.detail': 'It holds {semantics} together across {units} units. Bundling purely for volume produces fragments that make no sense to whoever builds the dashboard. Sharing a tick is necessary but not sufficient — the series should also belong together.',
  'lint.L5.title': '“{name}” updates the managed object more than once a minute',
  'lint.L5.detail': 'Inventory is not a time series store. Each update bills, overwrites the previous value and leaves nothing to chart. If it changes this often and the history matters, it is a measurement or an event.',
  'lint.L10.title': '“{name}” is re-sent on a timer or at every boot',
  'lint.L10.detail': 'The platform does not compare payloads, so an update that changes nothing still counts. Re-sending the full managed object on a heartbeat bills every time and stores no new information. Sending it only when it changes removes the whole line. (A rejected write does not count at all — failures are free.)',
  'lint.L8.title': '“{name}” raises {count} alarms per machine per day',
  'lint.L8.detail': 'At that rate the same alarm type is being raised while it is still active. Cumulocity updates the existing alarm rather than creating a duplicate — which still bills, as Alarms Updated. If the point is “something happened” this is an event; if it is “something is wrong”, raise once and let the lifecycle carry it.',
  'lint.L9.none.title': '“{name}” is modelled with no status transitions',
  'lint.L9.none.detail': 'A machine acknowledging a command through PENDING, EXECUTING and SUCCESSFUL costs one create plus three updates. Both Operations Created and Operations Updated bill, so a command modelled as one message is understated by a factor of three or four.',
  'lint.L9.many.title': '“{name}” reports {count} status transitions per command',
  'lint.L9.many.detail': 'Every status write bills as Operations Updated. More than four suggests progress reporting through the operation status field — polling-style control patterns get expensive fast, and progress belongs in an event or a measurement.',
  'lint.L7.title': 'Fragment “{name}” holds a different series set on {machineTypes}',
  'lint.L7.detail': 'One fragment name has to mean one series set. When the same fragment arrives carrying different series depending on which machine sent it, the stored schema varies exactly as if a single device were sending partial payloads — which is the pattern that degrades database performance. Either align the series sets or give the fragments different names.',

  /* ----------------------- what each Configurator line item is */
  'item.sharedCloud.help': 'One tenant on public cloud, with Device Management, Digital Twin Manager, Cockpit, smart rules, the multi-tenant Analytics Builder and the device agents. Shared Cloud customers get a Tier 2 tenant.',
  'item.dedicatedProd.help': 'A dedicated environment with a management tenant plus one production tenant on a high SLA. Dedicated customers are granted access to the Management Tenant, the top of the three-level hierarchy.',
  'item.messages.help': 'The sum of the nine counters below. This is what the calculator exists to produce.',
  'item.ods.help': 'Storage, in GiB-months: what the database holds at the end of each calendar month, captured every month and added up over the period. Filled in from the storage estimate — the values still inside their retention windows when each month closes, at the assumed bytes per value — and overridable here. The underlying figure is a rule of thumb spanning 100 to 400 bytes and marked “to be verified” at source, so the Storage sheet carries the whole range beside whatever number lands in the cell.',
  'item.streamingAnalytics.help': 'The per-tenant edition. Note the multi-tenant Analytics Builder is already included with a deployment, and EPL Apps come with Dedicated.',
  'item.dataHubStandard.help': 'Answering yes applies an uplift to the message rate in the Configurator. It does not change the message count, so it does not change anything the calculator computes — it is carried through so the quote is complete.',
  'item.microserviceCcu.help': 'One CCU is 1 CPU and 4 GiB of RAM. Custom microservices only — the calculator itself runs entirely in the browser and needs none.',
  'item.enterpriseFunctions.help': 'Custom branding, custom domains and the user hierarchy.',
  'item.tenants.help': 'Additional tenants beyond the one the deployment includes. With the Multi-Tenancy add-on a customer can create these themselves. Tenants that have child tenants used to be called Enterprise Tenants; that name is no longer used for billing.',

  /* ----------------------------------- the measurement diagram */
  'diagram.alt': '{measurements} measurements carrying {readings} readings a month in {messages} messages, per machine.',
  'diagram.everyReading': 'EVERY READING',
  'diagram.travelsIn': 'TRAVELS IN',
  'diagram.unnamed': 'unnamed',
  'diagram.more.one': '+ {count} more reading',
  'diagram.more.other': '+ {count} more readings',
  'diagram.compact': '{cadence} · {messages} msg',
  'diagram.oneTimestamp.one': '{cadence} · one timestamp · {count} reading',
  'diagram.oneTimestamp.other': '{cadence} · one timestamp · {count} readings',
  'diagram.splitTimestamp': '{cadence} · {count} readings in {types} measurements',
  'diagram.times': '× {count}',
  'diagram.msgPerMonth': 'msg / month',
  'diagram.legend.shared': 'shared — readings on the same tick, one message',
  'diagram.legend.alone': 'alone — one message all to itself',
  'diagram.legend.total': '**{messages}** messages per machine per month, carrying **{readings}** readings',
  'diagram.onChange': 'on change',

  /* --------------------------------- the interactive explainer */
  'explain.summary': 'How volume actually works — 90 seconds',
  'explain.note': 'A measurement carries **one timestamp** and any number of readings underneath it. One request is **one message** however many readings it carries. So the question is never “how much data” — it is **how many requests the same data is spread across**.',
  'explain.slider': 'Readings per measurement — drag right to bundle',
  'explain.messages': 'Messages / month',
  'explain.messages.sub': '{machines} machines, every {interval} s, {days}-day month',
  'explain.stored': 'Readings stored',
  'explain.stored.sub': 'the same at every setting — the information never changes',
  'explain.picture.heading': 'What the picture says',
  'explain.picture.body': 'The dots never change. Drag the slider and the same four readings, on the same tick, arrive at the same platform — but the number of envelopes goes from one to four, and **you are billed per envelope**.\n\nThis is not compression and it is not batching. Putting ten measurements in one request is still ten messages: **batch for the network, bundle for the count.**',
  'explain.rule.heading': 'The one rule that comes with it',
  'explain.rule.body': '**Send the same readings every time.** An envelope whose contents change from one send to the next is what degrades write and query performance later.\n\nWhich is why a series read every 72 minutes does not belong in a bundle sampled every minute — it would force the envelope to change shape. Readings share a message only when they share a tick.',
  'explain.onTheMachine': 'ON THE MACHINE',
  'explain.sentTo': 'SENT TO CUMULOCITY',
  'explain.oneMessage': '1 message',
  'explain.oneReadingAt': '1 reading · {time}',
  'explain.oneTimestampAt': 'one timestamp · {time}',
  'explain.readings.one': '{count} reading',
  'explain.readings.other': '{count} readings',
  'explain.tally.one': 'message',
  'explain.tally.other': 'messages',
  'explain.perTick': 'per tick',
  'explain.alt.one': 'Four sensor readings on the same tick, travelling in {count} measurement, costing {count} message.',
  'explain.alt.other': 'Four sensor readings on the same tick, travelling in {count} measurements, costing {count} messages.',

  /* --------------------------------- the diagram’s saving line */
  'diagram.legend.saving': '— **{count} fewer** than one measurement per reading',
} as const;

export type Key = keyof typeof en;
