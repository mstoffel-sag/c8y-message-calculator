/**
 * Step 5: deployment and add-ons.
 *
 * These are the Configurator line items the fleet cannot imply. The tool
 * collects quantities and hands them back with their cell references so nobody
 * retypes the quote from memory. It does not price them, rank them or
 * recommend one -- CONCEPT.md section 1.
 */

import { ASKED_LINE_ITEMS, cellFor, type LineItem, type Scenario } from '../../../lib/engine/index.js';
import { commercialBool, commercialNumber, copyCommercialAcross, setCommercial } from '../store.js';
import { Teach } from '../parts.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

const GROUPS = ['Deployment', 'Core Metrics', 'Add-Ons', 'Support'] as const;

export function StepCommercial({ scenario, onChange }: Props) {
  return (
    <>
      <Teach title="The parts of the quote the fleet cannot tell you">
        <p>
          Message volume comes out of the machines. Everything on this page does not: how many
          deployments, which add-ons, how many tenants. Somebody has to state them, so the wizard
          asks rather than guessing.
        </p>
        <p>
          Cumulocity is <b>commit-to-consume</b>. A customer commits to a spend amount, not to
          quantities &mdash; there is no bill of materials, usage is metered daily and drawn down
          against the commitment. So nothing here is an order; it is the shape of the estimate.
        </p>
        <p>
          <b>This tool shows no prices.</b> It collects the quantities and tells you which cell each
          one belongs in. What they cost is the Sales Configurator&rsquo;s job.
        </p>
      </Teach>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th style="min-width:280px">Line item</th>
              <th>Unit</th>
              {scenario.periods.map((p) => (
                <th class="num" key={p.index} style="min-width:110px">
                  Period {p.index}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const items = ASKED_LINE_ITEMS.filter((i) => i.group === group);
              if (items.length === 0) return null;
              return (
                <>
                  <tr key={group}>
                    <td colSpan={2 + scenario.periods.length} class="group-row">
                      {group}
                    </td>
                  </tr>
                  {items.map((item) => (
                    <Row key={item.key} item={item} scenario={scenario} onChange={onChange} />
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {scenario.periods.length > 1 && (
        <div class="row" style="margin-top:14px">
          <button onClick={() => onChange(copyCommercialAcross(scenario, 1))}>
            Copy period 1 across all periods
          </button>
          <span class="hint" style="margin:0">
            Most quotes repeat the same deployment every period; the fleet is what ramps.
          </span>
        </div>
      )}

      <p class="hint" style="margin-top:16px">
        <b>Not asked for, deliberately:</b> discounts, currency, minimum commitments and approval
        thresholds. Those live in the Configurator and are nobody&rsquo;s business inside a tool that
        may be shown to a customer.
      </p>
    </>
  );
}

function Row({ item, scenario, onChange }: Props & { item: LineItem }) {
  return (
    <tr>
      <td>
        <div style="font-weight:500">{item.label}</div>
        {item.help && <div class="hint" style="margin:3px 0 0;max-width:60ch">{item.help}</div>}
      </td>
      <td class="hint" style="white-space:nowrap">{item.unit}</td>
      {scenario.periods.map((p) => (
        <td class="num" key={p.index}>
          {item.source === 'choice' ? (
            <label class="check" style="justify-content:flex-end">
              <input
                type="checkbox"
                checked={commercialBool(p, item.key)}
                onChange={(e) =>
                  onChange(setCommercial(scenario, p.index, item.key, (e.target as HTMLInputElement).checked))
                }
              />
              {commercialBool(p, item.key) ? 'Yes' : 'No'}
            </label>
          ) : (
            <input
              type="number"
              min={0}
              step="any"
              value={commercialNumber(p, item.key)}
              onInput={(e) =>
                onChange(
                  setCommercial(
                    scenario,
                    p.index,
                    item.key,
                    Math.max(0, Number((e.target as HTMLInputElement).value) || 0),
                  ),
                )
              }
            />
          )}
          <div class="cell" style="text-align:right;margin-top:3px">{cellFor(item.baseRow, p.index)}</div>
        </td>
      ))}
    </tr>
  );
}
