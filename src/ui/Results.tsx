/**
 * Output. CONCEPT.md section 7.
 *
 * The nine counters are the primary artefact; everything else on the page
 * supports them. Deliberately absent: billable units, utilisation, headroom,
 * commit recommendations, overage warnings. A billing system handles
 * withdrawal, and this tool cannot get a bill wrong if it never computes one.
 */

import {
  DEFAULT_RETENTION_DAYS,
  NAIVE_BASELINE_RULE,
  STORAGE_SOURCE_NOTE,
  formatMonth,
  type Finding,
  type MonthResult,
  type PeriodResult,
  commitmentFor,
  type Scenario,
  type ScenarioResult,
} from '../../lib/engine/index.js';
import { compact, gib, gibRange, n, nf1, pct, signed } from './format.js';

export function Results({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const peak = result.peakMonth;
  const steady = result.months.filter((m) => m.onboardingCreates === 0);
  const steadyPeak = steady.reduce<MonthResult | undefined>(
    (best, m) => (!best || m.total > best.total ? m : best),
    undefined,
  );
  const steadyLean = steady.reduce<MonthResult | undefined>(
    (best, m) => (!best || m.total < best.total ? m : best),
    undefined,
  );
  const saving = peak.naiveTotal - peak.total;

  return (
    <>
      <div class="grid four" style="margin-bottom:18px">
        <div class="stat">
          <span>Peak month</span>
          <b>{compact(peak.total)}</b>
          <small>
            {formatMonth(peak.year, peak.month)}, {peak.days} days
            {peak.onboardingCreates > 0 && ` · includes ${n(peak.onboardingCreates)} registrations`}
          </small>
        </div>
        <div class="stat">
          <span>Calendar-month range</span>
          <b>
            {steadyLean && steadyPeak
              ? `${compact(steadyLean.total)} – ${compact(steadyPeak.total)}`
              : '—'}
          </b>
          <small>
            {steadyLean && steadyPeak && steadyLean.total > 0
              ? `${nf1.format((steadyPeak.total / steadyLean.total - 1) * 100)} % swing on month length alone, steady state`
              : 'Same fleet, different month lengths'}
          </small>
        </div>
        <div class="stat">
          <span>Per machine / month</span>
          <b>{n(peak.perMachinePerMonth)}</b>
          <small>the figure architects reason with</small>
        </div>
        <div class="stat">
          <span>Messages / second</span>
          <b>{nf1.format(peak.avgMessagesPerSec)}</b>
          <small>averaged across the month</small>
        </div>
      </div>

      <section class="panel">
        <header>
          <h2>Against the obvious implementation</h2>
          <span class="sub">{formatMonth(peak.year, peak.month)}</span>
        </header>
        <div class="body">
          <div class="grid two">
            <div>
              <table>
                <tbody>
                  <tr>
                    <td>As designed</td>
                    <td class="num">{n(peak.total)}</td>
                  </tr>
                  <tr>
                    <td>Naive</td>
                    <td class="num">{n(peak.naiveTotal)}</td>
                  </tr>
                  <tr class="total">
                    <td>Difference</td>
                    <td class="num">{n(saving)}</td>
                  </tr>
                </tbody>
              </table>
              {peak.naiveTotal > 0 && peak.total > 0 && (
                <>
                  <div class="bar">
                    <i style={`width:${(peak.total / peak.naiveTotal) * 100}%`} />
                  </div>
                  <p style="margin-top:8px;font-size:13.5px">
                    <b>{nf1.format(peak.naiveTotal / peak.total)}&times; less volume</b> &mdash;{' '}
                    {n((1 - peak.total / peak.naiveTotal) * 100)} % &mdash; for identical information.
                  </p>
                </>
              )}
            </div>
            <div>
              <p class="note" style="margin:0">
                <b>The baseline.</b> {NAIVE_BASELINE_RULE}
              </p>
              <p style="font-size:13px;color:var(--ink-mute);margin-top:10px">
                A volume reduction is not automatically a cost reduction: how volume converts to money
                depends on commercial terms that do not live here. Worth saying anyway &mdash;{' '}
                {compact(saving)} fewer writes a month buys query latency, headroom and a database
                that still behaves at scale.
              </p>
              <p style="font-size:13px;color:var(--ink-mute)">
                <b>{compact(peak.storedValues)} values stored</b> in the peak month, as a count
                &mdash; and the input to the storage estimate below.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Storage result={result} />

      <Commitment scenario={scenario} result={result} />

      <div class="grid two">
        <ByMachineType peak={peak} />
        <Ramp periods={result.periods} />
      </div>

      <Findings findings={result.findings} />

      <p class="disclaimer">
        This is a <b>volume estimate</b>, not a quote. It reports messages per calendar month and
        nothing else: no prices, no billable units, no commitment sizing. Usage is metered by the
        platform and drawn down by the billing system &mdash; what these numbers cost is for the
        Configurator and the commercial terms to settle.
      </p>
    </>
  );
}

function ByMachineType({ peak }: { peak: MonthResult }) {
  const rows = [...peak.byMachineType].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section class="panel">
      <header>
        <h2>Where the volume comes from</h2>
      </header>
      <div class="body tight">
        {rows.length === 0 ? (
          <div class="empty">No machine types yet.</div>
        ) : (
          <table>
            <tbody>
              {rows.map((row) => (
                <tr key={row.machineTypeId}>
                  <td>
                    {row.name}
                    <div class="bar">
                      <i style={`width:${(row.total / max) * 100}%`} />
                    </div>
                  </td>
                  <td class="num" style="width:120px">
                    {compact(row.total)}
                    <div style="font-size:11px;color:var(--ink-faint)">
                      {peak.total > 0 ? n((row.total / peak.total) * 100) : 0} %
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Ramp({ periods }: { periods: PeriodResult[] }) {
  const months = periods.flatMap((p) => p.months);
  const max = Math.max(1, ...months.map((m) => m.total));

  return (
    <section class="panel">
      <header>
        <h2>Month by month</h2>
        <span class="sub">{months.length} months</span>
      </header>
      <div class="body">
        <div class="ramp">
          {months.map((m) => (
            <i
              key={`${m.year}-${m.month}`}
              class={m.total === max ? 'peak' : ''}
              style={`height:${(m.total / max) * 100}%`}
              title={`${formatMonth(m.year, m.month)} · ${n(m.total)} messages · ${m.days} days`}
            />
          ))}
        </div>
        <table style="margin-top:12px">
          <tbody>
            {periods.map((p) => (
              <tr key={p.index}>
                <td>
                  Period {p.index}
                  <div style="font-size:11.5px;color:var(--ink-faint)">
                    {p.months.length} months from {p.months[0] ? formatMonth(p.months[0].year, p.months[0].month) : '—'}
                  </div>
                </td>
                <td class="num">
                  {compact(p.lean.total)} – {compact(p.peak.total)}
                  <div style="font-size:11.5px;color:var(--ink-faint)">
                    peak {formatMonth(p.peak.year, p.peak.month)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Findings({ findings }: { findings: Finding[] }) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  return (
    <section class="panel">
      <header>
        <h2>Guidance</h2>
        <span class="sub">
          {findings.length === 0
            ? 'nothing to flag'
            : `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${findings.length - errors - warnings} suggestion${findings.length - errors - warnings === 1 ? '' : 's'}`}
        </span>
      </header>
      <div class="body tight">
        {findings.length === 0 ? (
          <div class="clean">
            Nothing to flag. Continuous readings are bundled by interval and semantics, states are
            sent on change, and no fragment carries a varying series set.
          </div>
        ) : (
          findings.map((f, i) => (
            <div class={`finding ${f.severity}`} key={`${f.rule}-${i}`}>
              <span class="rule">{f.rule}</span>
              <div class="txt">
                <b>{f.title}</b>
                <p>{f.detail}</p>
              </div>
              {f.messageDelta !== undefined && Math.abs(f.messageDelta) >= 1 && (
                <span class={`delta ${f.messageDelta < 0 ? 'saves' : 'costs'}`}>
                  {signed(f.messageDelta)}
                  <div style="font-size:10px;font-weight:400;color:var(--ink-faint);text-align:right">
                    msg / month
                  </div>
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Operational storage: a range, and why it is a range.
 *
 * The two figures behind it are rules of thumb marked "to be verified" at
 * source, and one of them spans 4x on its own. Reporting a midpoint would make
 * that look like a measurement, so both ends are shown, the retention that
 * scales them is stated, and the ODS line stays somebody's decision.
 */
function Storage({ result }: { result: ScenarioResult }) {
  const peak = result.peakStorage;
  if (!peak || peak.retained <= 0) return null;
  const partial = peak.daysCovered < peak.retentionDays;

  return (
    <section class="panel">
      <header>
        <h2>Operational storage</h2>
        <span class="sub">What is on disk on the fullest day &mdash; the figure ODS bills</span>
      </header>
      <div class="body">
        <div class="grid four" style="margin-bottom:18px">
          <div class="stat">
            <span>Operational data store</span>
            <b>{gib(peak.quotedGiB)}</b>
            <small>
              at {n(peak.bytesPerValue)} B / value &middot; {gibRange(peak.lowGiB, peak.highGiB)}{' '}
              across the range
            </small>
          </div>
          <div class="stat">
            <span>Fullest month</span>
            <b>{formatMonth(peak.year, peak.month)}</b>
            <small>
              {n(peak.retentionDays)} days kept
              {partial && ` · only ${n(peak.daysCovered)} days of history yet`}
            </small>
          </div>
          <div class="stat">
            <span>Values on disk</span>
            <b>{compact(peak.retained)}</b>
            <small>{compact(peak.written)} written that month</small>
          </div>
          <div class="stat">
            <span>Values per measurement</span>
            <b>{nf1.format(peak.valuesPerMeasurement)}</b>
            <small>
              {peak.valuesPerMeasurement > 1.5
                ? `one envelope, not ${nf1.format(peak.valuesPerMeasurement)}`
                : 'one envelope per value: nothing shared'}
            </small>
          </div>
          <div class="stat">
            <span>DataHub extract</span>
            <b>{gibRange(peak.dataHubLowGiB, peak.dataHubHighGiB)}</b>
            <small>20&ndash;25 % of the same data</small>
          </div>
        </div>

        <div class="grid two">
          <div>
            <p class="note" style="margin:0">
              <b>{gib(peak.quotedGiB)} goes in the ODS cell</b>, at{' '}
              {n(peak.bytesPerValue)} bytes per value. That is one figure picked out of a range, and
              the range is the evidence: {STORAGE_SOURCE_NOTE} Override it on the Deployment step if
              the tenant has been measured.
            </p>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:10px">
              Bundling moves the real figure down inside that range as well as cutting messages: a
              measurement carrying {nf1.format(peak.valuesPerMeasurement)} values pays for its
              envelope once instead of {nf1.format(peak.valuesPerMeasurement)} times, and the
              100&ndash;400 B figure was measured on values stored one per measurement. The tool
              does not split the envelope cost from the value cost, because the source measures the
              two together &mdash; so a well-bundled fleet has room below the quoted figure, not
               above it.
            </p>
          </div>
          <div>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:0">
              <b>Retention decides the size.</b> Identical traffic held for 90 days occupies three
              times what it does at 30. This uses{' '}
              <b>{n(peak.retentionDays)} days</b>
              {peak.retentionDays === DEFAULT_RETENTION_DAYS && ' (the starting assumption)'} &mdash;
              set that and the bytes per value to the tenant's own figures on the Contract step.
            </p>
            <p style="font-size:13px;color:var(--ink-mute)">
              Measurements only. Events, alarms, inventory writes and operations are stored too, but
              the source measured datapoints; they are{' '}
              <b>
                {peak.nonMeasurementShare < 0.01 ? 'under 1 %' : pct(peak.nonMeasurementShare)}
              </b>{' '}
              of the documents this fleet writes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The commit-to-consume commitment, in the only terms this tool has: quantities.
 *
 * A CTC contract is signed on one number -- total spend over the term -- and the
 * tool supplies every factor in it except the rate. So this reports the
 * quantities that get multiplied, and says plainly that the multiplication
 * happens in the workbook over a price column the tool leaves empty.
 *
 * The headroom line is the point of the section. The Configurator quotes a
 * period at its peak month times its length, which is the right way to quote it,
 * and it is also more than the fleet will send. Unused commitment is forfeited at
 * expiry, so the gap is worth seeing before signature rather than after.
 */
function Commitment({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const c = commitmentFor(scenario, result);
  if (c.termMonths === 0 || c.termUnitsQuoted === 0) return null;
  const gap = c.termUnitsQuoted - c.termUnitsActual;

  return (
    <section class="panel">
      <header>
        <h2>The commitment</h2>
        <span class="sub">
          {c.termMonths} months &middot; every quantity a commit-to-consume total is built from
        </span>
      </header>
      <div class="body">
        <div class="grid four" style="margin-bottom:18px">
          <div class="stat">
            <span>Messages over the term</span>
            <b>{compact(c.termMessages)}</b>
            <small>every month at its own volume</small>
          </div>
          <div class="stat">
            <span>Billable units, as quoted</span>
            <b>{compact(c.termUnitsQuoted)}</b>
            <small>
              each period's peak month &times; its length &middot;{' '}
              {c.unitsPerMonth.map((u, i) => `${n(u)}/mo x ${n(c.months[i] ?? 0)}`).join(' + ')}
            </small>
          </div>
          <div class="stat">
            <span>Billable units, month by month</span>
            <b>{compact(c.termUnitsActual)}</b>
            <small>what the fleet is expected to consume</small>
          </div>
          <div class="stat">
            <span>Quoted but not expected</span>
            <b>{compact(gap)}</b>
            <small>{pct(c.headroom)} of the commitment</small>
          </div>
        </div>

        <div class="grid two">
          <div>
            <p class="note" style="margin:0">
              <b>The tool stops one multiplication short.</b> A commitment is billable units times a
              rate, and the rate is not in here &mdash; the Quote sheet of the workbook carries the
              multiplication as a live formula over an empty price column, so the commitment appears
              the moment somebody types their rates and never before.
            </p>
          </div>
          <div>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:0">
              <b>Quoting the peak is right, and it over-states.</b> A period is quoted at one month's
              quantity, and the peak is the honest month to pick &mdash; but the months add up to{' '}
              {compact(gap)} fewer billable units than {compact(c.termUnitsQuoted)}, because the
              fleet ramps and not every month has 31 days. Unused commitment is forfeited at expiry,
              not carried forward, so that gap is worth settling before signature.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

