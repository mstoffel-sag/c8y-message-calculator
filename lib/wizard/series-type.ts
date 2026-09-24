/**
 * "Where does this row send?" -- the measurement-type dropdown, decided once.
 *
 * Both wizards drew this list themselves, from two copies of the same filter,
 * and the copies agreed: a row could only be offered a measurement type that
 * already existed as a `Bundle`. A series in no bundle is in no `mt.bundles`
 * entry, so two lone series on the same tick could not see each other and
 * neither dropdown had anything in it but "a measurement type of its own" --
 * one option, nothing to change it to. The guidance meanwhile told the customer
 * to put them together (L1), which is advice the screen made impossible to
 * take. The HVAC preset ships in exactly that state.
 *
 * So the options are built here, from the whole machine type rather than from
 * its bundles, and the answer is applied here too. One list, one resolver, two
 * apps that cannot drift again.
 */

import {
  type MachineType,
  type Metric,
  type Scenario,
  ownFragmentName,
  seriesCountOf,
  seriesIn,
} from '../engine/index.js';
import { assignBundle, assignOwnBundle, assignTypePerSeries, shareWithSeries } from '../scenario/edits.js';
import type { T } from '../i18n/index.js';

/**
 * Sentinels, not ids. `\0` is not a character any id or fragment name carries,
 * so neither can collide with a real option's value.
 */
export const PER_SERIES = '\u0000per-series';
const WITH = '\u0000with:';

/** One entry in the dropdown. Shaped for both apps' Choice control. */
export interface TypeChoice {
  value: string;
  label: string;
  group: string;
}

/** The interval a series is read on. Anything else is 60 s by convention. */
function intervalOf(metric: Metric): number {
  return metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
}

/** Continuous series only: the rest are not in measurements at all. */
function seriesOf(machineType: MachineType): Metric[] {
  return machineType.metrics.filter((m) => m.kind === 'continuous');
}

/**
 * A row alone in its own measurement type is not something to be bundled
 * *with*: offering it under "shares a message" would make the heading a lie and
 * choosing it would be a no-op. Its answer is "a measurement type of its own".
 */
function soloBundleOf(machineType: MachineType, metric: Metric) {
  const bundle = machineType.bundles.find((b) => b.id === metric.bundleId);
  return bundle !== undefined && bundle.metricIds.length === 1 ? bundle : undefined;
}

/** Which option is selected, given what the row is actually doing. */
export function typeChoiceOf(machineType: MachineType, metric: Metric): string {
  if (Boolean(metric.typePerSeries) && seriesCountOf(metric) > 1) return PER_SERIES;
  if (soloBundleOf(machineType, metric)) return '';
  return metric.bundleId ?? '';
}

export function seriesTypeChoices(
  t: T,
  machineType: MachineType,
  metric: Metric,
  prefix: string,
): TypeChoice[] {
  const seconds = intervalOf(metric);
  const count = seriesCountOf(metric);
  const solo = soloBundleOf(machineType, metric);
  const series = seriesOf(machineType);
  const sharing = t('series.typesOnInterval');

  const options: TypeChoice[] = [];

  // Measurement types that exist, on this tick, that this row is not alone in.
  for (const bundle of machineType.bundles) {
    if (bundle.intervalSeconds !== seconds || bundle.id === solo?.id) continue;
    options.push({
      value: bundle.id,
      label: t('series.typeOption', {
        name: bundle.fragmentName.trim() || t('series.typeUnnamed'),
        series: t.plural('series.count', seriesIn(series.filter((m) => m.bundleId === bundle.id))),
      }),
      group: sharing,
    });
  }

  // Lone series on the same tick. They have no Bundle to point at yet, so they
  // are offered by the name the type they would mint is going to have, and
  // choosing one mints it. A row sending one type per series is left out: it
  // cannot be in a shared type, which is the whole of what it means.
  for (const other of series) {
    if (other.id === metric.id || other.bundleId || other.typePerSeries) continue;
    if (intervalOf(other) !== seconds) continue;
    options.push({
      value: WITH + other.id,
      label: t('series.typeOption', {
        name: ownFragmentName(prefix, other),
        series: t.plural('series.count', seriesCountOf(other)),
      }),
      group: sharing,
    });
  }

  options.push({ value: '', label: t('series.ownType'), group: t('series.onItsOwn') });
  // Only where it would mean something different: for a single series, one type
  // per series and a type of its own are the same answer.
  if (count > 1) {
    options.push({ value: PER_SERIES, label: t('series.typePerSeries'), group: t('series.onItsOwn') });
  }
  return options;
}

/** The chosen option, as an edit. */
export function applySeriesTypeChoice(
  scenario: Scenario,
  machineTypeId: string,
  metricId: string,
  choice: string,
): Scenario {
  if (choice === PER_SERIES) return assignTypePerSeries(scenario, machineTypeId, metricId);
  if (choice.startsWith(WITH)) {
    return shareWithSeries(scenario, machineTypeId, metricId, choice.slice(WITH.length));
  }
  if (choice) return assignBundle(scenario, machineTypeId, metricId, choice);
  return assignOwnBundle(scenario, machineTypeId, metricId);
}
