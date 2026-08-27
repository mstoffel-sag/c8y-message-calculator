/** Step 1: machine types and counts. */

import { machineTypeSummary, type Scenario } from '../../../lib/engine/index.js';
import { PRESETS, blankMachineType } from '../../../lib/presets/index.js';
import { PROTOCOLS } from '../../../lib/presets/catalog.js';
import { addMachineType, patchMachineType, removeMachineType } from '../store.js';
import { Choice, Num, Teach, Txt, Empty } from '../parts.js';
import { machineStructure } from '../Machine.js';
import { n } from '../format.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

export function StepFleet({ scenario, onChange }: Props) {
  const total = scenario.machineTypes.reduce((sum, mt) => sum + mt.machineCount, 0);

  return (
    <>
      <Teach title="Start with the machines, not the data">
        <p>
          A <b>machine type</b> is a group of machines that behave the same way &mdash; same sensors,
          same firmware, same reporting. Every machine of a type produces identical traffic, so the
          whole estimate scales from the count.
        </p>
        <p>
          Split into separate types only where the <em>data</em> differs. Two hundred pumps in
          Hamburg and two hundred in Lisbon are one type; a pump and a gateway are two.
        </p>
      </Teach>

      {scenario.machineTypes.length === 0 ? (
        <Empty>Add a machine type below to begin.</Empty>
      ) : (
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Machine type</th>
                <th style="width:230px">Talks</th>
                <th class="num" style="width:150px">How many</th>
                <th class="num" style="width:150px">Online %</th>
                <th style="width:90px" />
              </tr>
            </thead>
            <tbody>
              {scenario.machineTypes.map((mt) => (
                <tr key={mt.id}>
                  <td>
                    <Txt
                      value={mt.name}
                      placeholder="Rooftop HVAC unit"
                      onChange={(name) => onChange(patchMachineType(scenario, mt.id, { name }))}
                    />
                    {/* The same sentence the collapsed header on step 2 shows,
                        from the same helper, so the two never disagree about
                        how many measurements a machine actually sends. */}
                    <div class="hint" style="margin-top:4px">
                      {mt.metrics.length === 0
                        ? 'nothing modelled yet'
                        : machineStructure(machineTypeSummary(mt))}
                    </div>
                  </td>
                  <td>
                    {/* Descriptive, and the dropdown says so: no counter reads
                        this field. It is here because it is the first thing the
                        person who receives the finished workbook asks. */}
                    <Choice
                      value={mt.protocol ?? ''}
                      options={PROTOCOLS}
                      placeholder="Name the protocol"
                      otherLabel="Something else…"
                      onChange={(protocol) => onChange(patchMachineType(scenario, mt.id, { protocol }))}
                    />
                  </td>
                  <td class="num">
                    <Num
                      value={mt.machineCount}
                      onChange={(machineCount) => onChange(patchMachineType(scenario, mt.id, { machineCount }))}
                    />
                  </td>
                  <td class="num">
                    <Num
                      value={mt.onlinePct}
                      max={100}
                      suffix="%"
                      title="Duty cycle or connectivity availability. A machine that is offline sends nothing."
                      onChange={(onlinePct) => onChange(patchMachineType(scenario, mt.id, { onlinePct }))}
                    />
                  </td>
                  <td>
                    <button class="ghost" onClick={() => onChange(removeMachineType(scenario, mt.id))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              <tr class="total">
                <td>{scenario.machineTypes.length} types</td>
                <td />
                <td class="num">{n(total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div class="row" style="margin-top:16px">
        <span class="lbl">Add</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            title={preset.blurb}
            onClick={() => onChange(addMachineType(scenario, preset.create()))}
          >
            {preset.label}
          </button>
        ))}
        <button class="primary" onClick={() => onChange(addMachineType(scenario, blankMachineType()))}>
          Blank machine type
        </button>
      </div>
      <p class="hint">
        Presets arrive fully modelled and are meant to be edited &mdash; each one is built the way the
        tool recommends, so starting from one starts you from a good design.
      </p>
    </>
  );
}
