/**
 * Output. CONCEPT.md section 7.
 *
 * The nine counters are the primary artefact; everything else on the page
 * supports them. Deliberately absent: billable units, utilisation, headroom,
 * commit recommendations, overage warnings. A billing system handles
 * withdrawal, and this tool cannot get a bill wrong if it never computes one.
 */

import {
  NAIVE_BASELINE_RULE,
  formatMonth,
  type Finding,
  type MonthResult,
  type PeriodResult,
  type ScenarioResult,
} from '../../lib/engine/index.js';
import { compact, n, nf1, signed } from './format.js';

export function Results({ result }: { result: ScenarioResult }) {
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
          <small>peak {nf1.format(peak.peakMessagesPerSec)} /s at the stated peak factor</small>
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
                <b>{compact(peak.storedValues)} values stored</b> in the peak month, as a count. No
                byte or GiB figure: there is no fixed relation between payload and stored size, so the
                tool does not invent one.
              </p>
            </div>
          </div>
        </div>
      </section>

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
