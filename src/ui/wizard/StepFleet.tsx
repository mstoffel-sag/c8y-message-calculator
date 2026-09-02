/** Machines: types, counts, online share, and the protocol each one talks. */

import { machineTypeSummary, type Scenario } from '../../../lib/engine/index.js';
import { PRESETS, blankMachineType } from '../../../lib/presets/index.js';
import { PROTOCOLS } from '../../../lib/presets/catalog.js';
import { addMachineType, patchMachineType, removeMachineType } from '../store.js';
import { Choice, Num, Teach, Txt, Empty } from '../parts.js';
import { machineStructure } from '../Machine.js';
import { n } from '../format.js';
import { Prose, useT } from '../i18n.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

export function StepFleet({ scenario, onChange }: Props) {
  const t = useT();
  const total = scenario.machineTypes.reduce((sum, mt) => sum + mt.machineCount, 0);

  return (
    <>
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
