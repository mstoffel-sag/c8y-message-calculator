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
  type Finding,
  type MonthResult,
  type PeriodResult,
  commitmentFor,
  type Scenario,
  type ScenarioResult,
} from '../../lib/engine/index.js';
import { compact, gib, gibRange, monthYear, n, nf1, pct, signed } from './format.js';
import { Rich, useT } from './i18n.js';

export function Results({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const t = useT();
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
          <span>{t('results.stat.peakMonth')}</span>
          <b>{compact(peak.total)}</b>
          <small>
            {t('results.stat.peakMonth.sub', {
              month: monthYear(peak.year, peak.month),
              days: peak.days,
            })}
            {peak.onboardingCreates > 0 &&
              t('results.stat.peakMonth.registrations', { count: n(peak.onboardingCreates) })}
          </small>
        </div>
        <div class="stat">
          <span>{t('results.stat.range')}</span>
          <b>
            {steadyLean && steadyPeak
              ? `${compact(steadyLean.total)} – ${compact(steadyPeak.total)}`
              : '—'}
          </b>
          <small>
            {steadyLean && steadyPeak && steadyLean.total > 0
              ? t('results.stat.range.swing', {
                  pct: nf1.format((steadyPeak.total / steadyLean.total - 1) * 100),
                })
              : t('results.stat.range.same')}
          </small>
        </div>
        <div class="stat">
          <span>{t('results.stat.perMachine')}</span>
          <b>{n(peak.perMachinePerMonth)}</b>
          <small>{t('results.stat.perMachine.sub')}</small>
        </div>
        <div class="stat">
          <span>{t('results.stat.perSecond')}</span>
          <b>{nf1.format(peak.avgMessagesPerSec)}</b>
          <small>{t('results.stat.perSecond.sub')}</small>
        </div>
      </div>

      <section class="panel">
        <header>
          <h2>{t('naive.heading')}</h2>
          <span class="sub">{monthYear(peak.year, peak.month)}</span>
        </header>
        <div class="body">
          <div class="grid two">
            <div>
              <table>
                <tbody>
                  <tr>
                    <td>{t('naive.asDesigned')}</td>
                    <td class="num">{n(peak.total)}</td>
                  </tr>
                  <tr>
                    <td>{t('naive.naive')}</td>
                    <td class="num">{n(peak.naiveTotal)}</td>
                  </tr>
                  <tr class="total">
                    <td>{t('naive.difference')}</td>
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
                    <Rich
                      k="naive.less"
                      p={{
                        factor: nf1.format(peak.naiveTotal / peak.total),
                        pct: n((1 - peak.total / peak.naiveTotal) * 100),
                      }}
                    />
                  </p>
                </>
              )}
            </div>
            <div>
              <p class="note" style="margin:0">
                <b>{t('naive.baselineLabel')}</b> {t('engine.naiveBaselineRule')}
              </p>
              <p style="font-size:13px;color:var(--ink-mute);margin-top:10px">
                {t('naive.notCost', { saving: compact(saving) })}
              </p>
              <p style="font-size:13px;color:var(--ink-mute)">
                <Rich k="naive.storedValues" p={{ count: compact(peak.storedValues) }} />
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
        <Rich k="results.disclaimer" />
      </p>
    </>
  );
}

function ByMachineType({ peak }: { peak: MonthResult }) {
  const t = useT();
  const rows = [...peak.byMachineType].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section class="panel">
      <header>
        <h2>{t('byType.heading')}</h2>
      </header>
      <div class="body tight">
        {rows.length === 0 ? (
          <div class="empty">{t('byType.empty')}</div>
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
  const t = useT();
  const months = periods.flatMap((p) => p.months);
  const max = Math.max(1, ...months.map((m) => m.total));

  return (
    <section class="panel">
      <header>
        <h2>{t('ramp.heading')}</h2>
        <span class="sub">{t.plural('ramp.months', months.length)}</span>
      </header>
      <div class="body">
        <div class="ramp">
          {months.map((m) => (
            <i
              key={`${m.year}-${m.month}`}
              class={m.total === max ? 'peak' : ''}
              style={`height:${(m.total / max) * 100}%`}
              title={t('ramp.tooltip', {
                month: monthYear(m.year, m.month),
                count: n(m.total),
                days: m.days,
              })}
            />
          ))}
        </div>
        <table style="margin-top:12px">
          <tbody>
            {periods.map((p) => (
              <tr key={p.index}>
                <td>
                  {t('contract.periodN', { index: p.index })}
                  <div style="font-size:11.5px;color:var(--ink-faint)">
                    {t.plural('ramp.monthsFrom', p.months.length, {
                      month: p.months[0] ? monthYear(p.months[0].year, p.months[0].month) : '—',
                    })}
                  </div>
                </td>
                <td class="num">
                  {compact(p.lean.total)} – {compact(p.peak.total)}
                  <div style="font-size:11.5px;color:var(--ink-faint)">
                    {t('ramp.peak', { month: monthYear(p.peak.year, p.peak.month) })}
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
  const t = useT();
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  return (
    <section class="panel">
      <header>
        <h2>{t('findings.heading')}</h2>
        <span class="sub">
          {findings.length === 0
            ? t('findings.nothing')
            : [
                t.plural('findings.errors', errors),
                t.plural('findings.warnings', warnings),
                t.plural('findings.suggestions', findings.length - errors - warnings),
              ].join(', ')}
        </span>
      </header>
      <div class="body tight">
        {findings.length === 0 ? (
          <div class="clean">{t('findings.clean')}</div>
        ) : (
          findings.map((f, i) => (
            <div class={`finding ${f.severity}`} key={`${f.rule}-${i}`}>
              <span class="rule">{f.rule}</span>
              <div class="txt">
                <b>{t(f.titleKey, f.titleParams)}</b>
                <p>{t(f.detailKey, f.detailParams)}</p>
              </div>
              {f.messageDelta !== undefined && Math.abs(f.messageDelta) >= 1 && (
                <span class={`delta ${f.messageDelta < 0 ? 'saves' : 'costs'}`}>
                  {signed(f.messageDelta)}
                  <div style="font-size:10px;font-weight:400;color:var(--ink-faint);text-align:right">
                    {t('findings.perMonth')}
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
  const t = useT();
  const peak = result.peakStorage;
  if (!peak || peak.retained <= 0) return null;
  const partial = peak.daysCovered < peak.retentionDays;

  return (
    <section class="panel">
      <header>
        <h2>{t('storage.heading')}</h2>
        <span class="sub">{t('storage.sub')}</span>
      </header>
      <div class="body">
        <div class="grid four" style="margin-bottom:18px">
          <div class="stat">
            <span>{t('storage.stat.ods')}</span>
            <b>{gib(peak.quotedGiB)}</b>
            <small>
              {t('storage.stat.ods.sub', {
                bytes: n(peak.bytesPerValue),
                range: gibRange(peak.lowGiB, peak.highGiB),
              })}
            </small>
          </div>
          <div class="stat">
            <span>{t('storage.stat.fullest')}</span>
            <b>{monthYear(peak.year, peak.month)}</b>
            <small>
              {t('storage.stat.fullest.sub', { days: n(peak.retentionDays) })}
              {partial &&
                t('storage.stat.fullest.partial', { days: n(peak.daysCovered) })}
            </small>
          </div>
          <div class="stat">
            <span>{t('storage.stat.onDisk')}</span>
            <b>{compact(peak.retained)}</b>
            <small>{t('storage.stat.onDisk.sub', { count: compact(peak.written) })}</small>
          </div>
          <div class="stat">
            <span>{t('storage.stat.perMeasurement')}</span>
            <b>{nf1.format(peak.valuesPerMeasurement)}</b>
            <small>
              {peak.valuesPerMeasurement > 1.5
                ? t('storage.stat.perMeasurement.shared', {
                    count: nf1.format(peak.valuesPerMeasurement),
                  })
                : t('storage.stat.perMeasurement.alone')}
            </small>
          </div>
          <div class="stat">
            <span>{t('storage.stat.dataHub')}</span>
            <b>{gibRange(peak.dataHubLowGiB, peak.dataHubHighGiB)}</b>
            <small>{t('storage.stat.dataHub.sub')}</small>
          </div>
        </div>

        <div class="grid two">
          <div>
            <p class="note" style="margin:0">
              <Rich
                k="storage.odsCell"
                p={{
                  amount: gib(peak.quotedGiB),
                  bytes: n(peak.bytesPerValue),
                  note: t('engine.storageSourceNote'),
                }}
              />
            </p>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:10px">
              {t('storage.bundlingHelps', { count: nf1.format(peak.valuesPerMeasurement) })}
            </p>
          </div>
          <div>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:0">
              <Rich
                k="storage.retentionDecides"
                p={{
                  days: n(peak.retentionDays),
                  note:
                    peak.retentionDays === DEFAULT_RETENTION_DAYS
                      ? t('storage.retentionDefault')
                      : '',
                }}
              />
            </p>
            <p style="font-size:13px;color:var(--ink-mute)">
              <Rich
                k="storage.measurementsOnly"
                p={{
                  share:
                    peak.nonMeasurementShare < 0.01
                      ? t('storage.under1pct')
                      : pct(peak.nonMeasurementShare),
                }}
              />
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
  const t = useT();
  const c = commitmentFor(scenario, result);
  if (c.termMonths === 0 || c.termUnitsQuoted === 0) return null;
  const gap = c.termUnitsQuoted - c.termUnitsActual;

  return (
    <section class="panel">
      <header>
        <h2>{t('commitment.heading')}</h2>
        <span class="sub">{t('commitment.sub', { months: c.termMonths })}</span>
      </header>
      <div class="body">
        <div class="grid four" style="margin-bottom:18px">
          <div class="stat">
            <span>{t('commitment.stat.messages')}</span>
            <b>{compact(c.termMessages)}</b>
            <small>{t('commitment.stat.messages.sub')}</small>
          </div>
          <div class="stat">
            <span>{t('commitment.stat.quoted')}</span>
            <b>{compact(c.termUnitsQuoted)}</b>
            <small>
              {t('commitment.stat.quoted.sub', {
                breakdown: c.unitsPerMonth
                  .map((u, i) =>
                    t('commitment.stat.quoted.term', {
                      units: n(u),
                      months: n(c.months[i] ?? 0),
                    }),
                  )
                  .join(' + '),
              })}
            </small>
          </div>
          <div class="stat">
            <span>{t('commitment.stat.actual')}</span>
            <b>{compact(c.termUnitsActual)}</b>
            <small>{t('commitment.stat.actual.sub')}</small>
          </div>
          <div class="stat">
            <span>{t('commitment.stat.gap')}</span>
            <b>{compact(gap)}</b>
            <small>{t('commitment.stat.gap.sub', { pct: pct(c.headroom) })}</small>
          </div>
        </div>

        <div class="grid two">
          <div>
            <p class="note" style="margin:0">
              <Rich k="commitment.oneShort" />
            </p>
          </div>
          <div>
            <p style="font-size:13px;color:var(--ink-mute);margin-top:0">
              <Rich
                k="commitment.peakOverstates"
                p={{ gap: compact(gap), quoted: compact(c.termUnitsQuoted) }}
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

