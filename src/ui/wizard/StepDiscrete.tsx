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
 *
 * The three panels differ only in their words, so the words are a table. They
 * are catalogue keys rather than strings: the counter names stay English,
 * because that is what a tenant's usage screen calls them, and everything a
 * customer reads is translated.
 */

import {
  DEFAULT_RETENTION_DAYS,
  perMonthEquivalent,
  type MachineType,
  type MetricKind,
  type Scenario,
} from '../../../lib/engine/index.js';
import type { Key } from '../../../lib/i18n/index.js';
import { catalogFor } from '../../../lib/presets/catalog.js';
import {
  addDatapoint,
  removeMetric,
  setCadence,
  setDatapointName,
  setResentOnTimer,
  setMetricRetentionDays,
} from '../store.js';
import { Choice, Every, Retention, Teach, Empty } from '../parts.js';
import { Machine } from '../Machine.js';
import { useCollapse, type Collapse } from '../collapse.js';
import { Prose, Rich, useT } from '../i18n.js';
import { nf1 } from '../format.js';
import { Commands } from './Commands.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

interface KindSpec {
  kind: MetricKind;
  headingKey: Key;
  elementKey: Key;
  /** Counter names, as the Configurator and the tenant both spell them. */
  counters: string;
  questionKey: Key;
  teachKey: Key;
  rateKey: Key;
  placeholderKey: Key;
  addKey: Key;
  /**
   * Whether a retention rule has anything to act on here.
   *
   * Events and alarms are documents: one per occurrence, kept until the rule
   * removes it. An inventory write is not -- a PUT overwrites the managed
   * object in place, so nothing accumulates to age out, and the object itself
   * is not one of the types a retention rule covers. Offering the field there
   * would be offering a control that changes no number.
   */
  retention: boolean;
}

const SPECS: KindSpec[] = [
  {
    kind: 'occurrence',
    headingKey: 'discrete.occurrence.heading',
    elementKey: 'discrete.occurrence.element',
    counters: 'Events Created',
    questionKey: 'discrete.occurrence.question',
    teachKey: 'discrete.occurrence.teach',
    rateKey: 'discrete.occurrence.rate',
    placeholderKey: 'discrete.occurrence.placeholder',
    addKey: 'discrete.occurrence.add',
    retention: true,
  },
  {
    kind: 'condition',
    headingKey: 'discrete.condition.heading',
    elementKey: 'discrete.condition.element',
    counters: 'Alarms Created + Alarms Updated',
    questionKey: 'discrete.condition.question',
    teachKey: 'discrete.condition.teach',
    rateKey: 'discrete.condition.rate',
    placeholderKey: 'discrete.condition.placeholder',
    addKey: 'discrete.condition.add',
    retention: true,
  },
  {
    kind: 'inventory',
    headingKey: 'discrete.inventory.heading',
    elementKey: 'discrete.inventory.element',
    counters: 'Inventories Updated',
    questionKey: 'discrete.inventory.question',
    teachKey: 'discrete.inventory.teach',
    rateKey: 'discrete.inventory.rate',
    placeholderKey: 'discrete.inventory.placeholder',
    addKey: 'discrete.inventory.add',
    retention: false,
  },
];

export function StepDiscrete({ scenario, onChange }: Props) {
  const t = useT();
  const collapse = useCollapse(scenario.machineTypes.map((mt) => mt.id));

  if (scenario.machineTypes.length === 0) {
    return <Empty>{t('wizard.addMachineFirst')}</Empty>;
  }

  return (
    <>
      <Teach title={t('discrete.teach.title')}>
        <Prose k="discrete.teach.body" />
        <p class="hint">
          <Rich
            k="discrete.retentionNote"
            p={{ days: String(scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS) }}
          />
        </p>
      </Teach>

      {SPECS.map((spec) => (
        <section key={spec.kind} class="panel sub">
          <header>
            <h3>{t(spec.headingKey)}</h3>
            <span class="sub">
              {t(spec.elementKey)} &rarr; {spec.counters}
            </span>
          </header>
          <div class="body">
            <Teach title={t(spec.questionKey)}>
              <Prose k={spec.teachKey} />
              {spec.kind === 'inventory' && (
                <>
                  <p class="hint">
                    <Rich k="discrete.inventory.registrationNote" />
                  </p>
                  <p class="hint">
                    <Rich k="discrete.inventory.retentionNote" />
                  </p>
                </>
              )}
            </Teach>
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
  const t = useT();
  const rows = mt.metrics.filter((m) => m.kind === spec.kind);
  // The panel heading carries an explanation after a dash; the column heading is
  // the same noun without it.
  const noun = t(spec.headingKey).replace(/—.*/, '').trim();

  return (
    <Machine
      machineType={mt}
      only={spec.kind}
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
    >
      <div class="row" style="margin-bottom:6px">
        <button onClick={() => onChange(addDatapoint(scenario, mt.id, spec.kind))}>
          {t(spec.addKey)}
        </button>
      </div>

      {rows.length === 0 ? (
        <p class="hint" style="margin:0">{t('discrete.none')}</p>
      ) : (
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                <th style="min-width:200px">{noun}</th>
                <th style="min-width:230px">{t(spec.rateKey)}</th>
                {spec.kind === 'inventory' && (
                  <th style="width:210px">{t('discrete.inventory.timerColumn')}</th>
                )}
                {spec.retention && <th style="width:130px">{t('retention.col')}</th>}
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {rows.map((metric) => (
                <tr key={metric.id}>
                  <td>
                    <Choice
                      value={metric.name}
                      options={nameOptions(spec.kind, t('discrete.chooseOne'))}
                      placeholder={t(spec.placeholderKey)}
                      onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                    />
                  </td>
                  <td>
                    <Every
                      cadence={metric.cadence}
                      kind={spec.kind}
                      hint={t('discrete.perMachineMonth', {
                        count: nf1.format(perMonthEquivalent(metric.cadence)),
                      })}
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
                        {t('discrete.inventory.timerLabel')}
                      </label>
                    </td>
                  )}
                  {spec.retention && (
                    <td>
                      <Retention
                        days={metric.retentionDays}
                        fallback={scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS}
                        onChange={(days) =>
                          onChange(setMetricRetentionDays(scenario, mt.id, metric.id, days))
                        }
                      />
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
function nameOptions(kind: MetricKind, prompt: string) {
  return [
    { value: '', label: prompt },
    ...catalogFor(kind).map((seed) => ({ value: seed.name, label: seed.name, group: seed.group })),
  ];
}
