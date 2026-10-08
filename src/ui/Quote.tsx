/**
 * What each contract period is quoted at: messages and storage, per month and
 * over the period. The results page leads with this and, outside Expert mode,
 * shows little else.
 *
 * Four figures a period, all on the safe side -- the peak month rounded up to
 * whole billing units, times the months -- and printed with every digit: a
 * shortened "1.4 B" can read below the 1,44x,000,000 it stands for. The nine counters, the storage
 * breakdown and the volume panels are how these were reached; somebody
 * checking the estimate wants them, somebody quoting it does not.
 */

import { periodQuotes, termQuote, type Scenario, type ScenarioResult } from '../../lib/engine/index.js';
import { monthYear, n, wholeGib, wholeGibMonths } from './format.js';
import { useT } from './i18n.js';

export function Quote({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const t = useT();
  const quotes = periodQuotes(scenario, result).filter((q) => q.months > 0);
  if (quotes.length === 0) return null;
  // Shown for a single period too: the reader looks for the sum in the same
  // place every time, and a row that appears only sometimes reads as missing.
  const term = termQuote(quotes);

  return (
    <section class="panel">
      <header>
        <h2>{t('quote.heading')}</h2>
        <span class="sub">{t('quote.sub')}</span>
      </header>
      <div class="body">
        <table class="quote">
          <thead>
            <tr>
              <th />
              <th class="num">{t('quote.messages.perMonth')}</th>
              <th class="num">{t('quote.messages.overPeriod')}</th>
              <th class="num">{t('quote.storage.perMonth')}</th>
              <th class="num">{t('quote.storage.overPeriod')}</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.index}>
                <td>
                  <b>{t('contract.periodN', { index: q.index })}</b>
                  <div class="hint" style="margin:0">
                    {t.plural('quote.span', q.months, {
                      from: monthYear(q.start.year, q.start.month),
                      to: monthYear(q.end.year, q.end.month),
                    })}
                  </div>
                </td>
                <td class="num"><b>{n(q.messagesPerMonth)}</b></td>
                <td class="num">{n(q.messagesOverPeriod)}</td>
                <td class="num">
                  <b>{wholeGib(q.storageGiBPerMonth)}</b>
                  {q.storageStated && (
                    <div class="hint" style="margin:0">{t('quote.storage.stated')}</div>
                  )}
                </td>
                <td class="num">{wholeGibMonths(q.storageGiBOverPeriod)}</td>
              </tr>
            ))}
            {term && (
              <tr class="total">
                <td>
                  <b>{t('quote.term')}</b>
                  <div class="hint" style="margin:0">
                    {t.plural('quote.span', term.months, {
                      from: monthYear(term.start.year, term.start.month),
                      to: monthYear(term.end.year, term.end.month),
                    })}
                  </div>
                </td>
                <td />
                <td class="num"><b>{n(term.messages)}</b></td>
                <td />
                <td class="num"><b>{wholeGibMonths(term.storageGiB)}</b></td>
              </tr>
            )}
          </tbody>
        </table>
        <p class="hint" style="margin-top:14px">{t('quote.safeSide')}</p>
      </div>
    </section>
  );
}
