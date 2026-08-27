/**
 * Everything that is not a measurement: events, alarms, inventory, commands.
 * CONCEPT.md section 3.
 *
 * Events, alarms and inventory get confused with each other constantly, and each
 * confusion has a cost: alarms used as events produce noise, events used for
 * numbers produce data nobody can chart, and inventory used as a time series
 * bills every write while overwriting the value it just stored.
 *
 * Commands close the step from `Commands.tsx`. They are the same subject seen
 * from the other end -- the platform talking to the machine rather than the
 * machine talking to the platform -- and that contrast is easier to teach on one
 * screen than across two.
 */

import type { ComponentChildren } from 'preact';
import { perMonthEquivalent, type MachineType, type MetricKind, type Scenario } from '../../../lib/engine/index.js';
import { catalogFor } from '../../../lib/presets/catalog.js';
import {
  addDatapoint,
  removeMetric,
  setCadence,
  setDatapointName,
  setResentOnTimer,
} from '../store.js';
import { Choice, Every, Teach, Empty } from '../parts.js';
import { Machine } from '../Machine.js';
import { useCollapse, type Collapse } from '../collapse.js';
import { Commands } from './Commands.js';
import { nf1 } from '../format.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

interface KindSpec {
  kind: MetricKind;
  heading: string;
  element: string;
  counters: string;
  question: string;
  teach: ComponentChildren;
  rateLabel: string;
  placeholder: string;
  addLabel: string;
}

const SPECS: KindSpec[] = [
  {
    kind: 'occurrence',
    heading: 'Events',
    element: 'Event',
    counters: 'Events Created',
    question: 'Something happened worth recording, and nobody has to act on it.',
    rateLabel: 'Per machine / day',
    placeholder: 'Door opened',
    addLabel: '+ Event',
    teach: (
      <>
        <p>
          An event is a <b>non-numeric</b> thing that happened, with a timestamp: a door opened, a
          trip started, a service was performed, a login occurred. One <code>POST</code>, one message.
        </p>
        <p>
          <b>Do not put numbers in events.</b> A value buried in an event body cannot be aggregated,
          plotted or queried the way a series can. If it is a number you will want to chart, it is a
          datapoint &mdash; go back a step.
        </p>
      </>
    ),
  },
  {
    kind: 'condition',
    heading: 'Alarms',
    element: 'Alarm',
    counters: 'Alarms Created + Alarms Updated',
    question: 'Something is wrong and somebody has to act on it.',
    rateLabel: 'Raises / machine / day',
    placeholder: 'Filter blocked',
    addLabel: '+ Alarm',
    teach: (
      <>
        <p>
          An alarm is a <b>state with a lifecycle</b>, not a notification. It is raised, it stays
          active while the condition persists, and it is cleared when the condition ends.
        </p>
        <p>
          <b>That is two messages per incident, not one:</b> the raise counts as Alarms Created and
          the clear counts as Alarms Updated. The tool counts both automatically.
        </p>
        <p>
          Raising an alarm type that is <em>already active</em> does not create a second alarm
          &mdash; Cumulocity updates the existing one, which still counts. So a device re-raising the
          same alarm every minute while a fault persists bills every minute and tells an operator
          nothing new. If what you mean is &ldquo;this happened again&rdquo;, that is an event.
        </p>
      </>
    ),
  },
  {
    kind: 'inventory',
    heading: 'Inventory &mdash; what the machine is, right now',
    element: 'Inventory',
    counters: 'Inventories Updated',
    question: 'Something that is simply true about the machine, rather than a reading over time.',
    rateLabel: 'Changes',
    placeholder: 'Firmware version',
    addLabel: '+ Inventory entry',
    teach: (
      <>
        <p>
          The managed object is where a machine&rsquo;s <b>current state of being</b> lives: firmware
          version, serial number, configuration, location, which asset it belongs to. Writing one is
          a <code>PUT</code>, and a <code>PUT</code> counts exactly like a <code>POST</code>.
        </p>
        <p>
          <b>Inventory is not a time series store.</b> Writing a changing value here bills every
          time, overwrites what was there, and leaves nothing to chart. If it changes and the history
          matters, it is a datapoint.
        </p>
        <p>
          <b>The expensive habit:</b> the platform does not compare payloads, so a successful write
          that changes nothing still counts. Firmware that re-sends its whole managed object at every
          boot, or on a heartbeat, pays for every one of those writes and stores no new information.
          Tick the box below if that is what your devices do &mdash; it is the most common invisible
          line in a real tenant, and it is entirely fixable in device code.
        </p>
        <p class="hint">
          Registering a machine for the first time is <b>Inventories Created</b>, counted once per
          machine from your rollout numbers. You do not enter it here.
        </p>
      </>
    ),
  },
];

export function StepDiscrete({ scenario, onChange }: Props) {
  const collapse = useCollapse(scenario.machineTypes.map((mt) => mt.id));

  if (scenario.machineTypes.length === 0) {
    return <Empty>Add a machine type first.</Empty>;
  }

  return (
    <>
      <Teach title="Four different things, and the difference matters">
        <p>
          Everything so far was a number over time. What is left is everything else that travels
          between a machine and Cumulocity: three places to put what the machine reports, and one for
          what gets sent back to it. Picking the wrong one is not just a modelling nicety &mdash; it
          changes what you can do with the data afterwards, and it changes what you pay.
        </p>
        <p>
          The one-line test: <b>an event is something that happened</b>, <b>an alarm is something
          that is wrong</b>, <b>inventory is something that is true about the machine right now</b>,
          and <b>a command is something you want the machine to do</b>.
        </p>
      </Teach>

      {SPECS.map((spec) => (
        <section key={spec.kind} class="panel sub">
          <header>
            <h3 dangerouslySetInnerHTML={{ __html: spec.heading }} />
            <span class="sub">
              {spec.element} &rarr; {spec.counters}
            </span>
          </header>
          <div class="body">
            <Teach title={spec.question}>{spec.teach}</Teach>
            {scenario.machineTypes.map((mt) => (
              <KindTable
                key={mt.id}
                spec={spec}
                machineType={mt}
                scenario={scenario}
                onChange={onChange}
                collapse={collapse}
              />
            ))}
          </div>
        </section>
      ))}

      <Commands scenario={scenario} onChange={onChange} collapse={collapse} />
    </>
  );
}

function KindTable({
  spec, machineType: mt, scenario, onChange, collapse,
}: Props & { spec: KindSpec; machineType: MachineType; collapse: Collapse }) {
  const rows = mt.metrics.filter((m) => m.kind === spec.kind);

  return (
    <Machine
      machineType={mt}
      only={spec.kind}
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
    >
      <div class="row" style="margin-bottom:6px">
        <button onClick={() => onChange(addDatapoint(scenario, mt.id, spec.kind))}>
          {spec.addLabel}
        </button>
      </div>

      {rows.length === 0 ? (
        <p class="hint" style="margin:0">None.</p>
      ) : (
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                <th style="min-width:200px">{spec.heading.replace(/&mdash;.*/, '').trim()}</th>
                <th style="min-width:230px">{spec.rateLabel}</th>
                {spec.kind === 'inventory' && <th style="width:210px">Sent on a timer?</th>}
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {rows.map((metric) => (
                <tr key={metric.id}>
                  <td>
                    <Choice
                      value={metric.name}
                      options={nameOptions(spec.kind)}
                      placeholder={spec.placeholder}
                      onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                    />
                  </td>
                  <td>
                    <Every
                      cadence={metric.cadence}
                      kind={spec.kind}
                      hint={`${nf1.format(perMonthEquivalent(metric.cadence))} per machine in a 31-day month`}
                      onChange={(cadence) => onChange(setCadence(scenario, mt.id, metric.id, cadence))}
                    />
                  </td>
                  {spec.kind === 'inventory' && (
                    <td>
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={Boolean(metric.resentOnTimer)}
                          onChange={(e) =>
                            onChange(
                              setResentOnTimer(scenario, mt.id, metric.id, (e.target as HTMLInputElement).checked),
                            )
                          }
                        />
                        re-sent even when unchanged
                      </label>
                    </td>
                  )}
                  <td>
                    <button class="ghost" onClick={() => onChange(removeMetric(scenario, mt.id, metric.id))}>
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Machine>
  );
}

/** This kind's catalogue, as dropdown options, with a placeholder for unnamed rows. */
function nameOptions(kind: MetricKind) {
  return [
    { value: '', label: 'Choose one…' },
    ...catalogFor(kind).map((seed) => ({ value: seed.name, label: seed.name, group: seed.group })),
  ];
}
