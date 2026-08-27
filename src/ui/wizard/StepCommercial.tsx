/**
 * Deployment and add-ons.
 *
 * These are the Configurator line items the fleet cannot imply. The tool
 * collects quantities and hands them back with their cell references so nobody
 * retypes the quote from memory. It does not price them, rank them or
 * recommend one -- CONCEPT.md section 1.
 */

import {
  ASKED_LINE_ITEMS,
  cellFor,
  peakStorageForPeriod,
  type LineItem,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { commercialBool, commercialNumber, copyCommercialAcross, setCommercial } from '../store.js';
import { Teach } from '../parts.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

/** The estimated line items need the numbers the fleet produced. */
type RowProps = Props & { item: LineItem; result: ScenarioResult };

const GROUPS = ['Deployment', 'Core Metrics', 'Add-Ons', 'Support'] as const;

export function StepCommercial({ scenario, onChange, result }: Props & { result: ScenarioResult }) {
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
                    <Row
                      key={item.key}
                      item={item}
                      scenario={scenario}
                      onChange={onChange}
                      result={result}
                    />
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

function Row({ item, scenario, onChange, result }: RowProps) {
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
            <Quantity item={item} scenario={scenario} onChange={onChange} result={result} period={p.index} />
          )}
          <div class="cell" style="text-align:right;margin-top:3px">{cellFor(item.baseRow, p.index)}</div>
        </td>
      ))}
    </tr>
  );
}

/**
 * A quantity, with the tool's own figure in it where the tool has one.
 *
 * The estimated lines -- storage, today -- carry the estimate as a placeholder
 * rather than as a value. An empty box that shows what will be used says two
 * things a pre-filled box cannot: that nobody has stated this, and what happens
 * if nobody does. Typing over it wins, because a customer who has measured
 * their own storage knows more than a rule of thumb does.
 */
function Quantity({
  item, scenario, onChange, result, period,
}: RowProps & { period: number }) {
  const stated = commercialNumber(scenario.periods.find((p) => p.index === period)!, item.key);
  const storage = item.source === 'estimated' ? peakStorageForPeriod(result.storage, period) : undefined;
  const estimate = storage === undefined ? undefined : Number(storage.quotedGiB.toFixed(2));

  return (
    <>
      <input
        type="number"
        min={0}
        step="any"
        value={estimate !== undefined && stated === 0 ? '' : stated}
        placeholder={estimate !== undefined ? String(estimate) : undefined}
        onInput={(e) =>
          onChange(
            setCommercial(
              scenario,
              period,
              item.key,
              Math.max(0, Number((e.target as HTMLInputElement).value) || 0),
            ),
          )
        }
      />
      {estimate !== undefined && storage !== undefined && (
        <div class="hint" style="margin:3px 0 0;text-align:right">
          {stated > 0 ? (
            <>estimate {estimate} GiB</>
          ) : (
            <>
              estimated at {storage.bytesPerValue} B / value &middot;{' '}
              {storage.lowGiB.toFixed(1)}&ndash;{storage.highGiB.toFixed(1)} GiB across the range
            </>
          )}
        </div>
      )}
    </>
  );
}

