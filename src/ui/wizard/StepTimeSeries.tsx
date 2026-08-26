/**
 * Step 2: measurements. The core lesson lives here (CONCEPT.md section 4).
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
  derivedTypeName,
  fragmentNameFor,
  measurementView,
  perMonthEquivalent,
  proposalIsApplied,
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
  setCadence,
  patchUnit,
  setDatapointName,
  setRhythm,
  setSeriesFragmentName,
  setInterval as setMetricInterval,
} from '../store.js';
import { Choice, Duration, Every, Teach, Txt, Empty } from '../parts.js';
import { Machine } from '../Machine.js';
import { useCollapse, type Collapse } from '../collapse.js';
import { compact, interval as fmtInterval, nf1 } from '../format.js';
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
const SERIES_OPTIONS = nameOptions([...DATAPOINTS, ...STATES], 'Choose a series…');

/** What decides the timestamp. The whole difference, asked once per row. */
const RHYTHMS = [
  { value: 'interval' as const, label: 'On a timer' },
  { value: 'onChange' as const, label: 'When it changes' },
];

export function StepTimeSeries({ scenario, onChange }: Props) {
  const collapse = useCollapse(scenario.machineTypes.map((mt) => mt.id));

  if (scenario.machineTypes.length === 0) {
    return <Empty>Add a machine type first &mdash; a series belongs to a machine.</Empty>;
  }

  return (
    <>
      <Teach title="One measurement, one timestamp, one message">
        <p>
          A measurement carries <b>one timestamp</b> and any number of series underneath it. One{' '}
          <code>POST</code> is <b>one message</b> whether it carries one series or forty. So the
          question that decides your volume is not how much data you send &mdash; it is{' '}
          <b>how many requests you spread it across</b>.
        </p>
        <p>
          That makes the sampling interval the natural grouping: everything sampled on the same tick
          shares a timestamp, so it can share a measurement. Readings on <em>different</em> intervals
          can never share one, however related they are.
        </p>
        <p>
          <b>A flag or a state is a measurement too</b> &mdash; one series, sent when the value moves
          instead of on a tick. That is the only difference, so it is a column here rather than a
          section of its own. <b>Do not put one on a timer:</b> sent on change, the timestamp is the
          moment it flipped, which is the information you wanted; sampled every minute, that moment
          is lost between two ticks and you pay for thousands of identical readings. It also travels
          alone &mdash; its timestamps are its own and can never line up with a shared tick.
        </p>
        <p>
          <b>So tell the tool the rhythm and it will design the measurement type.</b> Every timed
          series you add drops into the measurement type for its interval automatically, under a
          suggested name. Both halves of that are yours to change in the <em>Measurement type</em>{' '}
          column: rename the fragment your devices actually send, or move one series into a
          measurement type of its own.
        </p>
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
  // Both rhythms, one list: everything this machine measures.
  const series = mt.metrics.filter((m) => m.kind === 'continuous' || m.kind === 'state');
  const proposals = proposeBundles(mt, scenario.settings.fragmentPrefix);
  const applied = proposalIsApplied(mt);

  const prefix = scenario.settings.fragmentPrefix;
  const view = measurementView(mt, prefix);
  const apart = proposals.reduce((s, p) => s + p.messagesApart, 0);
  const together = proposals.reduce((s, p) => s + p.messagesTogether, 0);
  const saving = (apart - together) * mt.machineCount * (mt.onlinePct / 100);

  return (
    <Machine
      machineType={mt}
      collapsed={collapse.isCollapsed(mt.id)}
      onToggle={(collapsed) => collapse.toggle(mt.id, collapsed)}
    >
      <h4>Series &mdash; what this machine measures</h4>
      {series.length === 0 ? (
        <p class="hint">
          None yet. A series is one named value over time: a temperature, a pressure, a motor
          current, a compressor on/off. Sampled on a timer or sent when it moves &mdash; either way
          it travels in a measurement.
        </p>
      ) : (
        <>
        <div class="scroll">
          <table class="dp">
            <thead>
              <tr>
                <th style="min-width:190px">Series</th>
                <th style="min-width:150px">Unit</th>
                <th style="min-width:230px">How often</th>
                <th style="min-width:250px">Measurement type</th>
                <th style="width:34px" />
              </tr>
            </thead>
            <tbody>
              {series.map((metric) => {
                const timed = metric.kind === 'continuous';
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
                        options={SERIES_OPTIONS}
                        placeholder="Name it yourself"
                        onChange={(name) => onChange(setDatapointName(scenario, mt.id, metric.id, name))}
                      />
                    </td>
                    <td>
                      <Choice
                        value={metric.unit}
                        options={UNITS}
                        placeholder="Unit"
                        onChange={(unit) => onChange(patchUnit(scenario, mt.id, metric.id, unit))}
                      />
                    </td>
                    <td>
                      <Choice
                        value={timed ? 'interval' : 'onChange'}
                        allowOther={false}
                        options={RHYTHMS}
                        onChange={(rhythm) => onChange(setRhythm(scenario, mt.id, metric.id, rhythm))}
                      />
                      <div style="margin-top:5px">
                        {timed ? (
                          <Duration
                            seconds={seconds}
                            prefix="every"
                            hint={`${compact(2_678_400 / seconds)} samples / machine / month`}
                            onChange={(s) => onChange(setMetricInterval(scenario, mt.id, metric.id, s))}
                          />
                        ) : (
                          <Every
                            cadence={metric.cadence}
                            kind="state"
                            hint={`${nf1.format(perMonthEquivalent(metric.cadence))} messages / machine / month`}
                            onChange={(cadence) => onChange(setCadence(scenario, mt.id, metric.id, cadence))}
                          />
                        )}
                      </div>
                    </td>
                    <td>
                      {/* An on-change series has nothing to choose between: its
                          timestamp is the moment the value moved, so no tick can
                          carry it and no other series can share the message. It
                          still has a measurement type, though, and the customer
                          still gets to name it. */}
                      {!timed ? (
                        <Solo
                          metric={metric}
                          prefix={prefix}
                          hint="one message per change; nothing can share an on-change timestamp"
                          onChange={(name) => onChange(setSeriesFragmentName(scenario, mt.id, metric.id, name))}
                        />
                      ) : (
                        <>
                          <Choice
                            value={metric.bundleId ?? ''}
                            allowOther={false}
                            options={[
                              ...siblings.map((b) => ({
                                value: b.id,
                                label: `${b.fragmentName.trim() || 'unnamed'} · ${b.metricIds.length} series`,
                                group: 'Measurement types on this interval',
                              })),
                              ...(alone
                                ? []
                                : [{ value: '', label: 'A measurement type of its own', group: 'On its own' }]),
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
                              hint="one message per sample, on its own"
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
                                  ? `one message for all ${bundle.metricIds.length} series in it`
                                  : 'one message per sample'}
                              </div>
                            </div>
                          ) : (
                            <div class="hint" style="margin:3px 0 0">in that same message</div>
                          )}
                        </>
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
          A measurement type is the fragment your device sends. Pick something a dashboard builder
          will recognise &mdash; and then <b>do not change the series inside it</b>: a fragment whose
          shape varies from one message to the next is what degrades write and query performance.
        </p>
        </>
      )}

      <div class="row" style="margin-top:14px">
        <button onClick={() => onChange(addDatapoint(scenario, mt.id, 'continuous'))}>+ Series</button>
      </div>

      {/* The configuration, in the same shape as the explainer's example. */}
      {view.groups.length > 0 && (
        <>
          <h4 style="margin-top:18px">What one of these machines sends</h4>
          <MeasurementDiagram view={view} />
        </>
      )}

      {proposals.length > 0 && (
        <div class={`proposal ${applied ? 'ok' : ''}`}>
          <div>
            <b>
              {applied
                ? `Bundled into ${proposals.length} measurement type${proposals.length === 1 ? '' : 's'}, one per interval`
                : `Suggestion: ${proposals.length} measurement type${proposals.length === 1 ? '' : 's'}, one per interval`}
            </b>
            <div class="hint" style="margin-top:4px">
              {proposals.map((p) => (
                <div key={p.intervalSeconds}>
                  <code>{p.fragmentName}</code> &middot; {fmtInterval(p.intervalSeconds)} &middot;{' '}
                  {p.metrics.length} series &rarr; {compact(p.messagesTogether)} messages/machine/month
                  {p.metrics.length > 1 && <> instead of {compact(p.messagesApart)}</>}
                </div>
              ))}
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            {saving > 0 && (
              <div class="delta saves" style="margin-bottom:6px">
                &minus;{compact(saving)}
                <div class="hint" style="margin:0">messages / month</div>
              </div>
            )}
            {!applied && (
              <button class="primary" onClick={() => onChange(applyBundleProposal(scenario, mt.id))}>
                Apply
              </button>
            )}
          </div>
        </div>
      )}

    </Machine>
  );
}
