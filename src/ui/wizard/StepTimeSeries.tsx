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
  MAX_SERIES_PER_BUNDLE,
  derivedTypeName,
  fragmentNameFor,
  measurementView,
  ownFragmentName,
  perMonthEquivalent,
  seriesCountOf,
  seriesIn,
  typesIn,
  type MachineType,
  type Metric,
  type Scenario,
} from '../../../lib/engine/index.js';
import { DATAPOINTS, STATES, UNITS } from '../../../lib/presets/catalog.js';
import {
  addDatapoint,
  assignBundle,
  assignOwnBundle,
  assignTypePerSeries,
  patchBundle,
  removeMetric,
  setBundleRetentionDays,
  setCadence,
  patchUnit,
  setDatapointName,
  setSeriesCount,
  setSeriesFragmentName,
  setMetricRetentionDays,
  setInterval as setMetricInterval,
} from '../store.js';
import { Choice, Duration, Every, Num, Retention, Teach, Txt, Empty } from '../parts.js';
import { Machine } from '../Machine.js';
import { useCollapse, type Collapse } from '../collapse.js';
import { compact, n } from '../format.js';
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

/**
 * The measurement-type dropdown's third answer, which is not a bundle id.
 *
 * A sentinel rather than a second control: the three answers are mutually
 * exclusive -- a row cannot both ride in `acme_Climate` and send each of its
 * series separately -- so one dropdown makes the contradiction unrepresentable.
 * Empty string already means "a measurement type of its own", so this needs a
 * value no bundle id can collide with.
 */
const PER_SERIES = '\u0000per-series';

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
  const prefix = scenario.settings.fragmentPrefix;
  const defaultRetention = scenario.settings.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const view = measurementView(mt, prefix);
  // What a measurement type actually carries. The dropdown and the naming hint
  // both say it, and both used to count rows -- which stopped being the same
  // number the moment a row could stand for 450 tags.
  const seriesInBundle = (bundleId: string) =>
    seriesIn(series.filter((m) => m.bundleId === bundleId));
  const bundleTypes = (bundleId: string) =>
    typesIn(series.filter((m) => m.bundleId === bundleId));

  return (
    <Machine
      machineType={mt}
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
      // Measurements only. This step edits series, so a header totalling the
      // events, alarms, inventory writes and operations as well is a figure
      // that barely moves when you change what the step is for -- and a reader
      // who switches a 10-series daily row to one type per series, watches
      // 15,159 become 15,438, and concludes the arithmetic is broken is
      // reading it correctly. The number was answering another question.
      only="continuous"
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
                {/* The other columns gave up 60 px between them to make room
                    for the count, so the row is exactly as wide as it was. It
                    was already the widest in the wizard: add to it and the
                    retention column falls off the end, which is the column a
                    reader is least likely to go looking for behind a
                    horizontal scrollbar. */}
                <th style="min-width:160px">{t('series.col.series')}</th>
                {/* Narrow on purpose: it holds 1 on nearly every row, and the
                    one row where it holds 450 is the one worth noticing. */}
                <th style="min-width:70px">{t('series.col.count')}</th>
                <th style="min-width:130px">{t('series.col.unit')}</th>
                <th style="min-width:220px">{t('series.col.howOften')}</th>
                <th style="min-width:250px">{t('series.col.type')}</th>
                <th style="width:120px">{t('retention.col')}</th>
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {series.map((metric) => {
                const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
                const count = seriesCountOf(metric);
                const perSeries = Boolean(metric.typePerSeries) && count > 1;
                const types = typesIn([metric]);
                const bundle = mt.bundles.find((b) => b.id === metric.bundleId);
                // A measurement type this row is alone in is not something it
                // can be bundled *with* -- offering it under "Bundled" would
                // make the heading a lie, and choosing it would be a no-op. Its
                // answer is "a measurement type of its own", below, and its
                // name is still editable in the field under the dropdown.
                const soloBundle = bundle !== undefined && bundle.metricIds.length === 1;
                const siblings = mt.bundles.filter(
                  (b) => b.intervalSeconds === seconds && !(soloBundle && b.id === bundle?.id),
                );
                // The name belongs to the measurement type, not to the row, so only
                // the first series in it gets the field. Four identical boxes for
                // one value would invite an edit in row three and change row one.
                const names = bundle !== undefined
                  && series.find((m) => m.bundleId === bundle.id)?.id === metric.id;
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
                      <Num
                        value={count}
                        min={1}
                        title={t('series.countTitle')}
                        onChange={(next) => onChange(setSeriesCount(scenario, mt.id, metric.id, next))}
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
                            value={
                              perSeries ? PER_SERIES : soloBundle ? '' : (metric.bundleId ?? '')
                            }
                            allowOther={false}
                            options={[
                              ...siblings.map((b) => ({
                                value: b.id,
                                label: t('series.typeOption', {

                                  name: b.fragmentName.trim() || t('series.typeUnnamed'),

                                  series: t.plural('series.count', seriesInBundle(b.id)),

                                }),
                                group: t('series.typesOnInterval'),
                              })),
                              { value: '', label: t('series.ownType'), group: t('series.onItsOwn') },
                              // Only where it would mean something different:
                              // for a single series, one type per series and a
                              // type of its own are the same answer.
                              ...(count > 1
                                ? [{ value: PER_SERIES, label: t('series.typePerSeries'), group: t('series.onItsOwn') }]
                                : []),
                            ]}
                            onChange={(id) =>
                              onChange(
                                id === PER_SERIES
                                  ? assignTypePerSeries(scenario, mt.id, metric.id)
                                  : id
                                    ? assignBundle(scenario, mt.id, metric.id, id)
                                    : assignOwnBundle(scenario, mt.id, metric.id),
                              )
                            }
                          />
                          {!bundle ? (
                            <Solo
                              metric={metric}
                              prefix={prefix}
                              hint={
                                perSeries
                                  ? t('series.solo.perSeries', {
                                      count: n(count),
                                      name: ownFragmentName(prefix, metric),
                                    })
                                  : count > MAX_SERIES_PER_BUNDLE
                                    ? t('series.solo.overRecommended', {
                                        count: n(count),
                                        max: n(MAX_SERIES_PER_BUNDLE),
                                      })
                                    : t('series.oneMessagePerSample')
                              }
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
                                {/* The split belongs to the measurement type,
                                    not to the row that happens to carry the
                                    count: a 450-tag row sharing a type with two
                                    named readings splits on 452, not on 450. So
                                    it is said here, where the type is named. */}
                                {seriesInBundle(bundle.id) > MAX_SERIES_PER_BUNDLE
                                  ? t('series.overRecommended', {
                                      count: n(seriesInBundle(bundle.id)),
                                      max: n(MAX_SERIES_PER_BUNDLE),
                                    })
                                  : seriesInBundle(bundle.id) > 1
                                    ? t('series.oneMessageForAll', { count: n(seriesInBundle(bundle.id)) })
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
          <Rich k="series.countNote" p={{ max: String(MAX_SERIES_PER_BUNDLE) }} />
        </p>
        <p class="hint" style="margin:6px 0 0">
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

    </Machine>
  );
}
