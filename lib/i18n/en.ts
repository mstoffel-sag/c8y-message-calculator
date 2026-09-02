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
  'app.tagline': 'Message calculator — a volume estimate, never a quote',
  'app.scenarioName': 'Scenario name',
  'app.stat.peakMonth': 'messages / peak month',
  'app.stat.vsUnbundled': 'vs unbundled',
  'app.stat.findings': 'findings',
  'app.stat.toFix': '{count} to fix',
  'app.expert': 'Expert mode',
  'app.expert.title': 'Shows the raw JSON payloads for whoever writes the device code.',
  'app.language': 'Language',

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
  'kind.state.one': 'on-change series',
  'kind.state.other': 'on-change series',
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
  'fleet.teach.body': 'A **machine type** is a group of machines that behave the same way — same sensors, same firmware, same reporting. Every machine of a type produces identical traffic, so the whole estimate scales from the count.\n\nSplit into separate types only where the *data* differs. Two hundred pumps in Hamburg and two hundred in Lisbon are one type; a pump and a gateway are two.',
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
  'machine.perMachine': '{count} per machine',
  'machine.intervals': '{count} intervals',

  /* --------------------------------- events, alarms, inventory */
  'discrete.teach.title': 'Four different things, and the difference matters',
  'discrete.teach.body': 'Everything so far was a number over time. What is left is everything else that travels between a machine and Cumulocity: three places to put what the machine reports, and one for what gets sent back to it. Picking the wrong one is not just a modelling nicety — it changes what you can do with the data afterwards, and it changes what you pay.\n\nThe one-line test: **an event is something that happened**, **an alarm is something that is wrong**, **inventory is something that is true about the machine right now**, and **a command is something you want the machine to do**.',
  'discrete.none': 'None.',
  'discrete.occurrence.heading': 'Events',
  'discrete.occurrence.element': 'Event',
  'discrete.occurrence.question': 'Something happened worth recording, and nobody has to act on it.',
  'discrete.occurrence.rate': 'Per machine / day',
  'discrete.occurrence.placeholder': 'Door opened',
  'discrete.occurrence.add': '+ Event',
  'discrete.occurrence.teach': 'An event is a **non-numeric** thing that happened, with a timestamp: a door opened, a trip started, a service was performed, a login occurred. One `POST`, one message.\n\n**Do not put numbers in events.** A value buried in an event body cannot be aggregated, plotted or queried the way a series can. If it is a number you will want to chart, it is a series — go back a step.',
  'discrete.condition.heading': 'Alarms',
  'discrete.condition.element': 'Alarm',
  'discrete.condition.question': 'Something is wrong and somebody has to act on it.',
  'discrete.condition.rate': 'Raises / machine / day',
  'discrete.condition.placeholder': 'Filter blocked',
  'discrete.condition.add': '+ Alarm',
  'discrete.condition.teach': 'An alarm is a **state with a lifecycle**, not a notification. It is raised, it stays active while the condition persists, and it is cleared when the condition ends.\n\n**That is two messages per incident, not one:** the raise counts as Alarms Created and the clear counts as Alarms Updated. The tool counts both automatically.\n\nRaising an alarm type that is *already active* does not create a second alarm — Cumulocity updates the existing one, which still counts. So a device re-raising the same alarm every minute while a fault persists bills every minute and tells an operator nothing new. If what you mean is “this happened again”, that is an event.',
  'discrete.inventory.heading': 'Inventory — what the machine is, right now',
  'discrete.inventory.element': 'Inventory',
  'discrete.inventory.question': 'Something that is simply true about the machine, rather than a reading over time.',
  'discrete.inventory.rate': 'Changes',
  'discrete.inventory.placeholder': 'Firmware version',
  'discrete.inventory.add': '+ Inventory entry',
  'discrete.inventory.teach': 'The managed object is where a machine’s **current state of being** lives: firmware version, serial number, configuration, location, which asset it belongs to. Writing one is a `PUT`, and a `PUT` counts exactly like a `POST`.\n\n**Inventory is not a time series store.** Writing a changing value here bills every time, overwrites what was there, and leaves nothing to chart. If it changes and the history matters, it is a series.\n\n**The expensive habit:** the platform does not compare payloads, so a successful write that changes nothing still counts. Firmware that re-sends its whole managed object at every boot, or on a heartbeat, pays for every one of those writes and stores no new information. Tick the box below if that is what your devices do — it is the most common invisible line in a real tenant, and it is entirely fixable in device code.',
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
  'commands.teach.title': 'This one runs outbound, and it costs more than it looks',
  'commands.teach.body': 'Everything above is the machine talking to Cumulocity. An **operation** goes the other way: a firmware update, a configuration push, a reboot, a setpoint change.\n\n**One command is not one message.** Creating the operation counts, and then every status the device reports back counts as well — `PENDING`, `EXECUTING`, `SUCCESSFUL` is three more. A single command is realistically **three or four messages**, which is why an estimate that models a firmware campaign as one message per machine is out by a factor of four.\n\nIf your device reports fine-grained progress through the operation status, count those too. That pattern gets expensive quickly, and progress usually belongs in an event.',
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
  'contract.teach.body': 'February is 28 days and January is 31 — an **11 % swing** in messages for a fleet doing exactly the same thing. The tool works in real month lengths rather than averaging them away, and reports a range with the peak month named. A single number would be wrong eleven months out of twelve.\n\n**Registration is derived from the ramp.** Each period contributes *Inventories Created* only for the machines it *adds*, once, in its first month. A period that adds nobody registers nobody — putting onboarding into the monthly rate overstates every later period.',
  'contract.rampStarts': 'Ramp starts',
  'contract.year': 'Year',
  'contract.retention': 'Data kept',
  'contract.retention.suffix': 'days',
  'contract.retention.title': 'Days of data the tenant’s retention rules keep. Decides the operational storage estimate on the Results step; it does not change the message count.',
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
  'deployment.teach.body': 'Message volume comes out of the machines. Everything in this section does not: how many deployments, which add-ons, how many tenants. Somebody has to state them, so the wizard asks rather than guessing.\n\nCumulocity is **commit-to-consume**. A customer commits to a spend amount, not to quantities — there is no bill of materials, usage is metered daily and drawn down against the commitment. So nothing here is an order; it is the shape of the estimate.\n\n**This tool shows no prices.** It collects the quantities and tells you which cell each one belongs in. What they cost is the Sales Configurator’s job.',
  'deployment.col.item': 'Line item',
  'deployment.col.unit': 'Unit',
  'deployment.copyAcross': 'Copy period 1 across all periods',
  'deployment.copyAcross.hint': 'Most quotes repeat the same deployment every period; the fleet is what ramps.',
  'deployment.notAsked': '**Not asked for, deliberately:** discounts, currency, minimum commitments and approval thresholds. Those live in the Configurator and are nobody’s business inside a tool that may be shown to a customer.',
  'deployment.yes': 'Yes',
  'deployment.no': 'No',
  'deployment.estimate': 'estimate {value} GiB',
  'deployment.estimatedAt': 'estimated at {bytes} B / value · {low}–{high} GiB across the range',
} as const;

export type Key = keyof typeof en;
