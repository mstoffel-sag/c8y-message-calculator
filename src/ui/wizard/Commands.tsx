/**
 * Commands: the closing section of StepDiscrete. CONCEPT.md section 3.
 *
 * The one element that runs the other way, and the one people leave out of
 * estimates entirely. It sits with events, alarms and inventory rather than in a
 * step of its own -- the four together are "everything that is not a
 * measurement", and putting commands last is what makes the direction visible:
 * three sections of the machine talking, then one of the platform talking back.
 */

import {
  DEFAULT_RETENTION_DAYS,
  perMonthEquivalent,
  type MachineType,
  type Scenario,
} from '../../../lib/engine/index.js';
import { COMMANDS, TRANSITIONS } from '../../../lib/presets/catalog.js';
import {
  addDatapoint,
  patchCadence,
  removeMetric,
  setCadence,
  setDatapointName,
  setMetricRetentionDays,
} from '../store.js';
import { Choice, Every, Retention, Teach } from '../parts.js';
import { Machine } from '../Machine.js';
import { type Collapse } from '../collapse.js';
import { Prose, useT } from '../i18n.js';
import { nf1 } from '../format.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

const COMMAND_OPTIONS = [
  { value: '', labelKey: 'commands.chooseOne' as const },
  ...COMMANDS.map((seed) => ({ value: seed.name, label: seed.name, group: seed.group })),
];

/**
 * Rendered by StepDiscrete, and given its collapse state, so a machine type
 * folded away in one section of the step is folded away in all four.
 */
export function Commands({ scenario, onChange, collapse }: Props & { collapse: Collapse }) {
  const t = useT();
  return (
    <section class="panel sub">
      <header>
        <h3>{t('commands.heading')}</h3>
        <span class="sub">
          {t('commands.element')} &rarr; Operations Created + Operations Updated
        </span>
      </header>
      <div class="body">
        <Teach title={t('commands.teach.title')}>
          <Prose k="commands.teach.body" />
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
  const t = useT();
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
          {t('commands.add')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p class="hint" style="margin:0">{t('commands.none')}</p>
      ) : (
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                {/* Trimmed to make room for the retention column: the German
                    row was overflowing its wrapper and taking the delete button
                    off-screen with it. The transitions dropdown truncates its
                    longest option either way, so 280 px bought nothing. */}
                <th style="min-width:180px">{t('commands.col.command')}</th>
                <th style="min-width:230px">{t('commands.col.howOften')}</th>
                <th style="min-width:230px">{t('commands.col.transitions')}</th>
                {/* min-width, not width: the transitions dropdown is wide and
                    this was the only column that could give, so it collapsed
                    into three wrapped lines when the retention column arrived.
                    The row scrolls in its wrapper instead. */}
                <th class="num" style="min-width:130px">{t('commands.col.each')}</th>
                <th style="min-width:130px">{t('retention.col')}</th>
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
                        placeholder={t('commands.namePlaceholder')}
                        onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                      />
                    </td>
                    <td>
                      <Every
                        cadence={metric.cadence}
                        kind="command"
                        hint={t('commands.perMachineMonth', { count: nf1.format(perMonth) })}
                        onChange={(cadence) => onChange(setCadence(scenario, mt.id, metric.id, cadence))}
                      />
                    </td>
                    <td>
                      <Choice
                        value={transitions}
                        kind="number"
                        options={TRANSITIONS}
                        suffix={t('commands.transitionsSuffix')}
                        onChange={(v) => onChange(patchCadence(scenario, mt.id, metric.id, { transitions: v }))}
                      />
                    </td>
                    <td class="num">
                      <b>{1 + transitions}</b>
                      <div class="hint" style="margin:0">
                        {t('commands.breakdown', { count: transitions })}
                      </div>
                    </td>
                    <td>
                      {/* An operation is one document; its status transitions
                          update it as it runs rather than adding more. So the
                          rule governs one stored operation per command. */}
                      <Retention
                        days={metric.retentionDays}
                        fallback={scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS}
                        onChange={(days) =>
                          onChange(setMetricRetentionDays(scenario, mt.id, metric.id, days))
                        }
                      />
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
