/** Machines: types, counts, online share, and the protocol each one talks. */

import { machineTypeSummary, type Scenario } from '../../../lib/engine/index.js';
import { PRESETS, blankMachineType } from '../../../lib/presets/index.js';
import { PROTOCOLS } from '../../../lib/presets/catalog.js';
import { addMachineType, patchMachineType, removeMachineType } from '../store.js';
import { Choice, Num, Teach, Txt, Empty } from '../parts.js';
import { machineStructure } from '../Machine.js';
import { n } from '../format.js';
import { Prose, useT } from '../i18n.js';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

export function StepFleet({ scenario, onChange }: Props) {
  const t = useT();
  const total = scenario.machineTypes.reduce((sum, mt) => sum + mt.machineCount, 0);

  return (
    <>
      {/* The scenario's own description, on the step where a scenario begins.
          The name is in the header because it labels the rail entry; this is
          the part nobody can reconstruct from the numbers -- whose fleet, whose
          figures, what was assumed -- and it travels in the exported JSON. */}
      <Describe
        notes={scenario.notes}
        onInput={(notes) => onChange({ ...scenario, notes })}
      />

      <Teach title={t('fleet.teach.title')}>
        <Prose k="fleet.teach.body" />
      </Teach>

      {scenario.machineTypes.length === 0 ? (
        <Empty>{t('fleet.empty')}</Empty>
      ) : (
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>{t('fleet.col.type')}</th>
                <th style="width:230px">{t('fleet.col.talks')}</th>
                <th class="num" style="width:150px">{t('fleet.col.count')}</th>
                <th class="num" style="width:150px">{t('fleet.col.online')}</th>
                <th style="width:90px" />
              </tr>
            </thead>
            <tbody>
              {scenario.machineTypes.map((mt) => (
                <tr key={mt.id}>
                  <td>
                    <Txt
                      value={mt.name}
                      placeholder={t('fleet.namePlaceholder')}
                      onChange={(name) => onChange(patchMachineType(scenario, mt.id, { name }))}
                    />
                    {/* The same sentence StepTimeSeries' collapsed header shows,
                        from the same helper, so the two never disagree about
                        how many measurements a machine actually sends. */}
                    <div class="hint" style="margin-top:4px">
                      {mt.metrics.length === 0
                        ? t('fleet.nothingModelled')
                        : machineStructure(t, machineTypeSummary(mt))}
                    </div>
                  </td>
                  <td>
                    {/* Descriptive, and the dropdown says so: no counter reads
                        this field. It is here because it is the first thing the
                        person who receives the finished workbook asks. */}
                    <Choice
                      value={mt.protocol ?? ''}
                      options={PROTOCOLS}
                      placeholder={t('fleet.protocolPlaceholder')}
                      otherLabel={t('fleet.protocolOther')}
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
                      title={t('fleet.online.title')}
                      onChange={(onlinePct) => onChange(patchMachineType(scenario, mt.id, { onlinePct }))}
                    />
                  </td>
                  <td>
                    <button class="ghost" onClick={() => onChange(removeMachineType(scenario, mt.id))}>
                      {t('fleet.remove')}
                    </button>
                  </td>
                </tr>
              ))}
              <tr class="total">
                <td>{t.plural('fleet.total', scenario.machineTypes.length)}</td>
                <td />
                <td class="num">{n(total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div class="row" style="margin-top:16px">
        <span class="lbl">{t('fleet.add')}</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            title={t(preset.blurbKey)}
            onClick={() => onChange(addMachineType(scenario, preset.create()))}
          >
            {preset.label}
          </button>
        ))}
        <button class="primary" onClick={() => onChange(addMachineType(scenario, blankMachineType()))}>
          {t('fleet.addBlank')}
        </button>
      </div>
      <p class="hint">{t('fleet.presetNote')}</p>
    </>
  );
}

/**
 * Past this the description stops growing and folds: about eight lines at the
 * field's type size. A long brief is worth keeping, but not worth pushing the
 * machine table off the first screen of the step every time it is opened.
 */
const DESCRIBE_CAP_PX = 160;

/**
 * The scenario's description, sized to what is in it.
 *
 * The height is set from `scrollHeight` on every change rather than left to
 * CSS: `field-sizing: content` would do it in one line, but Firefox does not
 * have it. Folded, the field stops at the cap and scrolls inside; unfolded it
 * shows everything. The toggle only exists while there is more than fits.
 */
function Describe({ notes, onInput }: { notes: string; onInput: (notes: string) => void }) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const over = full > DESCRIBE_CAP_PX;
    el.style.height = `${open || !over ? full : DESCRIBE_CAP_PX}px`;
    el.style.overflowY = over && !open ? 'auto' : 'hidden';
    setOverflows(over);
  }, [notes, open]);

  return (
    <div class="field describe">
      <label for="scenario-description">{t('app.description')}</label>
      <textarea
        id="scenario-description"
        ref={box}
        rows={2}
        value={notes}
        placeholder={t('app.description.placeholder')}
        onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)}
      />
      {overflows && (
        <button
          class="ghost describe-toggle"
          aria-expanded={open}
          aria-controls="scenario-description"
          onClick={() => setOpen(!open)}
        >
          {open ? t('app.description.less') : t('app.description.more')}
        </button>
      )}
    </div>
  );
}
