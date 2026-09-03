/**
 * Measurements. The core lesson of the wizard lives here (CONCEPT.md section 4).
 *
 * The vocabulary is the platform's, because a customer who leaves with the wrong
 * words models the wrong thing: a *series* is one named value over time -- what
 * the rest of the industry calls a datapoint -- and a *measurement type* is the
 * fragment that carries a set of series under one timestamp.
 *
 * The customer says what is measured and how often. The tool groups by interval
 * and puts each group in one measurement type, because a measurement carries one
 * timestamp -- so readings on the same tick can share one message, and readings
 * on different ticks never can.
 *
 * There is one table, not one per rhythm. A flag sent when it changes is a
 * measurement with one series in it; giving it a section and a name of its own
 * said it was a different kind of thing, which it is not. What differs is what
 * decides the timestamp -- a tick, or the moment the value moved -- so that is a
 * column, and the consequence of the two answers is explained once at the top.
 *
 * Every column is a dropdown, bar one: the measurement type's name. The tool
 * suggests it, and the customer overwrites it in place when their devices
 * already send something else. A guided wizard that hands out blank number boxes
 * is not guiding anybody, and the interval and change-rate labels carry the
 * consequence of the choice rather than leaving it to be inferred.
 */

import {
  DEFAULT_RETENTION_DAYS,
  derivedTypeName,
  fragmentNameFor,
  measurementView,
  perMonthEquivalent,
  proposalApplied,
  proposeBundles,
  type MachineType,
  type Metric,
  type Scenario,
} from '../../../lib/engine/index.js';
import { DATAPOINTS, STATES, UNITS } from '../../../lib/presets/catalog.js';
import {
  addDatapoint,
  applyBundleProposal,
  assignBundle,
  assignOwnBundle,
  patchBundle,
  removeMetric,
  setBundleRetentionDays,
  setCadence,
  patchUnit,
  setDatapointName,
  setSeriesFragmentName,
  setMetricRetentionDays,
  setInterval as setMetricInterval,
} from '../store.js';
import { Choice, Duration, Every, Retention, Teach, Txt, Empty } from '../parts.js';
import { Machine } from '../Machine.js';
import { useCollapse, type Collapse } from '../collapse.js';
import { compact, interval as fmtInterval, nf1 } from '../format.js';
import { Prose, Rich, useT } from '../i18n.js';
import { Explainer } from '../Explainer.js';
import { MeasurementDiagram } from '../MeasurementDiagram.js';

interface Props {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}

/**
 * Catalogue entries become dropdown options; the group headings come along.
 *
 * The empty first entry matters: a series that has just been added has no name,
 * and without a placeholder that empty value would look like a custom one and
 * open the free-text field instead of inviting a pick from the list.
 */
const nameOptions = (seeds: typeof DATAPOINTS, prompt: string) => [
  { value: '', label: prompt },
  ...seeds.map((seed) => ({ value: seed.name, label: seed.name, group: seed.group })),
];

/**
 * One list, both rhythms. The catalogue's own groups keep them apart on the
 * page -- Climate, Electrical, then Status and Connectivity -- and picking a
 * name from the on-change end moves the row's rhythm with it, because a door
 * open/closed left on a one-minute timer is the mistake this step exists to
 * prevent.
 */
const SERIES_SEEDS = [...DATAPOINTS, ...STATES];

export function StepTimeSeries({ scenario, onChange }: Props) {
  const t = useT();
  const collapse = useCollapse(scenario.machineTypes.map((mt) => mt.id));

  if (scenario.machineTypes.length === 0) {
    return <Empty>{t('series.empty')}</Empty>;
  }

  return (
    <>
      <Teach title={t('series.teach.title')}>
        <Prose k="series.teach.body" />
      </Teach>

      <Explainer />

      {scenario.machineTypes.map((mt) => (
        <MachineBlock
          key={mt.id}
          machineType={mt}
          scenario={scenario}
          onChange={onChange}
          collapse={collapse}
        />
      ))}
    </>
  );
}

/**
 * The measurement type of a series that travels alone.
 *
 * Same control as a bundle's name, because it is the same thing: the fragment
 * the device sends. The difference is only where it is stored -- a bundle has a
 * name of its own, a solo series carries it on the metric -- and the placeholder
 * carries the derived name so an empty box reads as "the one the tool suggests"
 * rather than as nothing at all.
 */
function Solo({
  metric, prefix, hint, onChange,
}: {
  metric: Metric;
  prefix: string;
  hint: string;
  onChange: (fragmentName: string) => void;
}) {
  return (
    <div style="margin-top:5px">
      <Txt
        value={metric.fragmentName ?? ''}
        placeholder={derivedTypeName(prefix, metric.name)}
        onChange={onChange}
      />
      <div class="hint" style="margin:3px 0 0">{hint}</div>
    </div>
  );
}

function MachineBlock({
  machineType: mt, scenario, onChange, collapse,
}: Props & { machineType: MachineType; collapse: Collapse }) {
  const t = useT();
  // Everything this machine measures. One kind now, so one filter.
  const series = mt.metrics.filter((m) => m.kind === 'continuous');
  const proposals = proposeBundles(mt, scenario.settings.fragmentPrefix);
  // Only the groupings still on offer: a fleet can be half-grouped, and
  // counting a saving already banked into the "apply this" figure overstates
  // it by whatever is already bundled.
  const pending = proposals.filter((p) => !proposalApplied(mt, p));
  const applied = pending.length === 0;
  const shown = applied ? proposals : pending;

  const prefix = scenario.settings.fragmentPrefix;
  const defaultRetention = scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const view = measurementView(mt, prefix);
  const apart = shown.reduce((s, p) => s + p.messagesApart, 0);
  const together = shown.reduce((s, p) => s + p.messagesTogether, 0);
  const saving = (apart - together) * mt.machineCount * (mt.onlinePct / 100);

  return (
    <Machine
      machineType={mt}
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
    >
      <h4>{t('series.heading')}</h4>
      {series.length === 0 ? (
        <p class="hint">{t('series.none')}</p>
      ) : (
        <>
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                <th style="min-width:190px">{t('series.col.series')}</th>
                <th style="min-width:150px">{t('series.col.unit')}</th>
                <th style="min-width:230px">{t('series.col.howOften')}</th>
                <th style="min-width:250px">{t('series.col.type')}</th>
                <th style="width:130px">{t('retention.col')}</th>
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {series.map((metric) => {
                const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
                const bundle = mt.bundles.find((b) => b.id === metric.bundleId);
                const siblings = mt.bundles.filter((b) => b.intervalSeconds === seconds);
                // The name belongs to the measurement type, not to the row, so only
                // the first series in it gets the field. Four identical boxes for
                // one value would invite an edit in row three and change row one.
                const names = bundle !== undefined
                  && series.find((m) => m.bundleId === bundle.id)?.id === metric.id;
                // Offered only where it would do something: a series that is
                // already the only one in its measurement type has one.
                const alone = bundle !== undefined && bundle.metricIds.length === 1;
                return (
                  <tr key={metric.id}>
                    <td>
                      <Choice
                        value={metric.name}
                        options={nameOptions(SERIES_SEEDS, t('series.choose'))}
                        placeholder={t('series.namePlaceholder')}
                        onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                      />
                    </td>
                    <td>
                      <Choice
                        value={metric.unit}
                        options={UNITS}
                        placeholder={t('series.unitPlaceholder')}
                        onChange={(unit) => onChange(patchUnit(scenario, mt.id, metric.id, unit))}
                      />
                    </td>
                    <td>
                      <Duration
                        seconds={seconds}
                        prefix={t('every.prefix')}
                        hint={t('series.samplesPerMonth', { count: compact(2_678_400 / seconds) })}
                        onChange={(s) => onChange(setMetricInterval(scenario, mt.id, metric.id, s))}
                      />
                    </td>
                    <td>
                      {/* Every row has a measurement type to choose now: with
                          one rhythm, anything sharing a tick can share a
                          message, so nothing is excluded from a bundle on
                          principle. */}
                      <>
                          <Choice
                            value={metric.bundleId ?? ''}
                            allowOther={false}
                            options={[
                              ...siblings.map((b) => ({
                                value: b.id,
                                label: t('series.typeOption', {

                                  name: b.fragmentName.trim() || t('series.typeUnnamed'),

                                  series: t.plural('series.count', b.metricIds.length),

                                }),
                                group: t('series.typesOnInterval'),
                              })),
                              ...(alone
                                ? []
                                : [{ value: '', label: t('series.ownType'), group: t('series.onItsOwn') }]),
                            ]}
                            onChange={(id) =>
                              onChange(
                                id
                                  ? assignBundle(scenario, mt.id, metric.id, id)
                                  : assignOwnBundle(scenario, mt.id, metric.id),
                              )
                            }
                          />
                          {!bundle ? (
                            <Solo
                              metric={metric}
                              prefix={prefix}
                              hint={t('series.solo.timed')}
                              onChange={(name) => onChange(setSeriesFragmentName(scenario, mt.id, metric.id, name))}
                            />
                          ) : names ? (
                            <div style="margin-top:5px">
                              {/* The tool's own name for the type is stored, not merely suggested, so
                                  it travels with the scenario and reads the same everywhere. The
                                  placeholder is what a cleared field falls back to. */}
                              <Txt
                                value={bundle.fragmentName}
                                placeholder={fragmentNameFor(prefix, mt.name, bundle.intervalSeconds)}
                                onChange={(fragmentName) =>
                                  onChange(patchBundle(scenario, mt.id, bundle.id, { fragmentName }))
                                }
                              />
                              <div class="hint" style="margin:3px 0 0">
                                {bundle.metricIds.length > 1
                                  ? t('series.oneMessageForAll', { count: bundle.metricIds.length })
                                  : t('series.oneMessagePerSample')}
                              </div>
                            </div>
                          ) : (
                            <div class="hint" style="margin:3px 0 0">{t('series.sameMessage')}</div>
                          )}
                      </>
                    </td>
                    <td>
                      {/* The rule belongs to the type, so the row that names
                          the type is the row that sets it -- a bundled series
                          is kept for as long as its bundle, whatever any
                          earlier scenario put on the metric. */}
                      {bundle ? (
                        names ? (
                          <Retention
                            days={bundle.retentionDays}
                            fallback={defaultRetention}
                            onChange={(days) =>
                              onChange(setBundleRetentionDays(scenario, mt.id, bundle.id, days))
                            }
                          />
                        ) : (
                          <span class="hint">{t('retention.shared')}</span>
                        )
                      ) : (
                        <Retention
                          days={metric.retentionDays}
                          fallback={defaultRetention}
                          onChange={(days) =>
                            onChange(setMetricRetentionDays(scenario, mt.id, metric.id, days))
                          }
                        />
                      )}
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
        <p class="hint" style="margin:8px 0 0">
          <Rich k="series.namingNote" />
        </p>
        <p class="hint" style="margin:6px 0 0">
          <Rich k="series.retentionNote" p={{ days: String(defaultRetention) }} />
        </p>
        </>
      )}

      <div class="row" style="margin-top:14px">
        <button onClick={() => onChange(addDatapoint(scenario, mt.id, 'continuous'))}>
          {t('series.add')}
        </button>
      </div>

      {/* The configuration, in the same shape as the explainer's example. */}
      {view.groups.length > 0 && (
        <>
          <h4 style="margin-top:18px">{t('series.whatItSends')}</h4>
          <MeasurementDiagram view={view} />
        </>
      )}

      {proposals.length > 0 && (
        <div class={`proposal ${applied ? 'ok' : ''}`}>
          <div>
            <b>
              {applied
                ? t.plural('series.bundled', shown.length)
                : t.plural('series.suggestion', shown.length)}
            </b>
            <div class="hint" style="margin-top:4px">
              {shown.map((p) => (
                <div key={p.intervalSeconds}>
                  <code>{p.fragmentName}</code> &middot; {fmtInterval(p.intervalSeconds)} &middot;{' '}
                  {t('series.proposalLine', {

                    series: t.plural('series.count', p.metrics.length),

                    messages: compact(p.messagesTogether),

                  })}
                  {p.metrics.length > 1 && (
                    <> {t('series.insteadOf', { count: compact(p.messagesApart) })}</>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            {saving > 0 && (
              <div class="delta saves" style="margin-bottom:6px">
                &minus;{compact(saving)}
                <div class="hint" style="margin:0">{t('series.messagesPerMonthShort')}</div>
              </div>
            )}
            {!applied && (
              <button class="primary" onClick={() => onChange(applyBundleProposal(scenario, mt.id))}>
                {t('series.apply')}
              </button>
            )}
          </div>
        </div>
      )}

    </Machine>
  );
}
