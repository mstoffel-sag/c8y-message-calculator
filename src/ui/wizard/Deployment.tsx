/**
 * Deployment and add-ons: the second section of StepContract.
 *
 * These are the Configurator line items the fleet cannot imply. The tool
 * collects quantities and hands them back with their cell references so nobody
 * retypes the quote from memory. It does not price them, rank them or
 * recommend one -- CONCEPT.md section 1.
 *
 * Every column here is a contract period, which is why this is a section and not
 * a screen: the periods it is asking about are defined immediately above it.
 * Asked on its own page, it wanted a number per period while the periods
 * themselves were still one screen further on.
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
import { Prose, Rich, useT } from '../i18n.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

/** The estimated line items need the numbers the fleet produced. */
type RowProps = Props & { item: LineItem; result: ScenarioResult };

const GROUPS = ['Deployment', 'Core Metrics', 'Add-Ons', 'Support'] as const;

export function Deployment({ scenario, onChange, result }: Props & { result: ScenarioResult }) {
  const t = useT();
  return (
    <section class="panel sub">
      <header>
        <h3>{t('deployment.heading')}</h3>
        <span class="sub">{t('deployment.sub')}</span>
      </header>
      <div class="body">
        <Teach title={t('deployment.teach.title')}>
          <Prose k="deployment.teach.body" />
        </Teach>

        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th style="min-width:280px">{t('deployment.col.item')}</th>
                <th>{t('deployment.col.unit')}</th>
                {scenario.periods.map((p) => (
                  <th class="num" key={p.index} style="min-width:110px">
                    {t('contract.periodN', { index: p.index })}
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
              {t('deployment.copyAcross')}
            </button>
            <span class="hint" style="margin:0">{t('deployment.copyAcross.hint')}</span>
          </div>
        )}

        <p class="hint" style="margin-top:16px">
          <Rich k="deployment.notAsked" />
        </p>
      </div>
    </section>
  );
}

function Row({ item, scenario, onChange, result }: RowProps) {
  const t = useT();
  return (
    <tr>
      <td>
        <div style="font-weight:500">{item.label}</div>
        {item.helpKey && (
          <div class="hint" style="margin:3px 0 0;max-width:60ch">{t(item.helpKey)}</div>
        )}
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
              {commercialBool(p, item.key) ? t('deployment.yes') : t('deployment.no')}
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
  const t = useT();
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
          {stated > 0
            ? t('deployment.estimate', { value: estimate })
            : t('deployment.estimatedAt', {
                bytes: storage.bytesPerValue,
                low: storage.lowGiB.toFixed(1),
                high: storage.highGiB.toFixed(1),
              })}
        </div>
      )}
    </>
  );
}

