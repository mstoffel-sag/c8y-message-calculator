/**
 * Commands: the closing section of step 3. CONCEPT.md section 3.
 *
 * The one element that runs the other way, and the one people leave out of
 * estimates entirely. It sits with events, alarms and inventory rather than in a
 * step of its own -- the four together are "everything that is not a
 * measurement", and putting commands last is what makes the direction visible:
 * three sections of the machine talking, then one of the platform talking back.
 */

import { perMonthEquivalent, type MachineType, type Scenario } from '../../../lib/engine/index.js';
import { COMMANDS, TRANSITIONS } from '../../../lib/presets/catalog.js';
import { addDatapoint, patchCadence, removeMetric, setCadence, setDatapointName } from '../store.js';
import { Choice, Every, Teach } from '../parts.js';
import { Machine } from '../Machine.js';
import { type Collapse } from '../collapse.js';
import { nf1 } from '../format.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

const COMMAND_OPTIONS = [
  { value: '', label: 'Choose a command…' },
  ...COMMANDS.map((seed) => ({ value: seed.name, label: seed.name, group: seed.group })),
];

/**
 * Rendered by StepDiscrete, and given its collapse state, so a machine type
 * folded away in one section of the step is folded away in all four.
 */
export function Commands({ scenario, onChange, collapse }: Props & { collapse: Collapse }) {
  return (
    <section class="panel sub">
      <header>
        <h3>Commands</h3>
        <span class="sub">Operation &rarr; Operations Created + Operations Updated</span>
      </header>
      <div class="body">
        <Teach title="This one runs outbound, and it costs more than it looks">
          <p>
            Everything above is the machine talking to Cumulocity. An <b>operation</b> goes the other
            way: a firmware update, a configuration push, a reboot, a setpoint change.
          </p>
          <p>
            <b>One command is not one message.</b> Creating the operation counts, and then every
            status the device reports back counts as well &mdash; <code>PENDING</code>,{' '}
            <code>EXECUTING</code>, <code>SUCCESSFUL</code> is three more. A single command is
            realistically <b>three or four messages</b>, which is why an estimate that models a
            firmware campaign as one message per machine is out by a factor of four.
          </p>
          <p>
            If your device reports fine-grained progress through the operation status, count those
            too. That pattern gets expensive quickly, and progress usually belongs in an event.
          </p>
        </Teach>

        {scenario.machineTypes.map((mt) => (
          <CommandTable
            key={mt.id}
            machineType={mt}
            scenario={scenario}
            onChange={onChange}
            collapse={collapse}
          />
        ))}
      </div>
    </section>
  );
}

function CommandTable({
  machineType: mt, scenario, onChange, collapse,
}: Props & { machineType: MachineType; collapse: Collapse }) {
  const rows = mt.metrics.filter((m) => m.kind === 'command');

  return (
    <Machine
      machineType={mt}
      only="command"
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
    >
      <div class="row" style="margin-bottom:6px">
        <button onClick={() => onChange(addDatapoint(scenario, mt.id, 'command'))}>
          + Command
        </button>
      </div>

      {rows.length === 0 ? (
        <p class="hint" style="margin:0">
          None. If Cumulocity never sends anything to these machines, that is a legitimate answer
          &mdash; but firmware updates count, and almost every fleet has those.
        </p>
      ) : (
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                <th style="min-width:200px">Command</th>
                <th style="min-width:230px">How often</th>
                <th style="min-width:280px">Status transitions reported back</th>
                <th class="num" style="width:130px">Messages each</th>
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {rows.map((metric) => {
                const transitions = metric.cadence.mode === 'command' ? metric.cadence.transitions : 0;
                const perMonth = perMonthEquivalent(metric.cadence);
                return (
                  <tr key={metric.id}>
                    <td>
                      <Choice
                        value={metric.name}
                        options={COMMAND_OPTIONS}
                        placeholder="Name it yourself"
                        onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                      />
                    </td>
                    <td>
                      <Every
                        cadence={metric.cadence}
                        kind="command"
                        hint={`${nf1.format(perMonth)} per machine / month`}
                        onChange={(cadence) => onChange(setCadence(scenario, mt.id, metric.id, cadence))}
                      />
                    </td>
                    <td>
                      <Choice
                        value={transitions}
                        kind="number"
                        options={TRANSITIONS}
                        suffix="transitions"
                        onChange={(v) => onChange(patchCadence(scenario, mt.id, metric.id, { transitions: v }))}
                      />
                    </td>
                    <td class="num">
                      <b>{1 + transitions}</b>
                      <div class="hint" style="margin:0">1 create + {transitions} updates</div>
                    </td>
                    <td>
                      <button class="ghost" onClick={() => onChange(removeMetric(scenario, mt.id, metric.id))}>
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Machine>
  );
}
