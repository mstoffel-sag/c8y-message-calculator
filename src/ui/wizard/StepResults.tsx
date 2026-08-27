/** Step 6: what the wizard produces. */

import {
  measurementView,
  workbookFileName,
  workbookSheets,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { buildXlsx } from '../../../lib/xlsx/writer.js';
import { Handoff } from './Handoff.js';
import { Results } from '../Results.js';
import { Payloads } from '../Payloads.js';
import { MeasurementDiagram } from '../MeasurementDiagram.js';
import { Empty } from '../parts.js';
import { n } from '../format.js';

export function StepResults({
  scenario,
  result,
  expert,
}: {
  scenario: Scenario;
  result: ScenarioResult;
  expert: boolean;
}) {
  if (scenario.machineTypes.length === 0) {
    return <Empty>Nothing to compute yet &mdash; go back and describe a machine.</Empty>;
  }
  return (
    <>
      <DownloadWorkbook scenario={scenario} result={result} />
      <Handoff scenario={scenario} result={result} />
      <Design scenario={scenario} />
      <Results scenario={scenario} result={result} />
      {/* The payloads are for whoever writes the device code, not for the
          person filling in the wizard. */}
      {expert ? <Payloads scenario={scenario} /> : <PayloadsHidden />}
    </>
  );
}

/**
 * The design the numbers came from, machine type by machine type. Somebody
 * checking the estimate needs to see the shape that produced it, and the
 * diagram says in one look what the counters only imply.
 */
function Design({ scenario }: { scenario: Scenario }) {
  const types = scenario.machineTypes
    .map((mt) => ({ mt, view: measurementView(mt, scenario.settings.fragmentPrefix) }))
    .filter(({ view }) => view.groups.length > 0);

  if (types.length === 0) return null;

  return (
    <section class="panel">
      <header>
        <h2>What each machine sends</h2>
        <span class="sub">The design behind the counters</span>
      </header>
      <div class="body">
        {types.map(({ mt, view }) => (
          <div key={mt.id} style="margin-bottom:18px">
            <div class="row" style="margin-bottom:4px">
              <h3>{mt.name || 'Unnamed machine type'}</h3>
              <span class="mt-tag">{n(mt.machineCount)} machines</span>
              <span class="mt-tag">
                {view.groups.length} measurement{view.groups.length === 1 ? '' : 's'}
              </span>
            </div>
            <MeasurementDiagram view={view} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The workbook download.
 *
 * Built in the browser: no upload, no service, nothing leaves the tenant. It
 * mirrors the Configurator's own rows so the transfer is a column copy, and it
 * carries quantities only -- which is what makes it safe to send to a customer
 * without checking first.
 */
function DownloadWorkbook({ scenario, result }: { scenario: Scenario; result: ScenarioResult }) {
  const download = () => {
    const bytes = buildXlsx(workbookSheets(scenario, result));
    // Copy into a fresh buffer: Blob wants an ArrayBuffer, and a typed array
    // view may sit inside a larger one.
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = workbookFileName(scenario);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="panel">
      <header>
        <h2>Take it away</h2>
        <span class="sub">Five sheets, and a Quote sheet ready to be priced</span>
      </header>
      <div class="body">
        <div class="row" style="align-items:center">
          <button class="primary" onClick={download}>
            Download Excel workbook
          </button>
          <p class="hint" style="flex:1;min-width:320px;margin:0">
            <b>Send this to your account team.</b> It carries the quantities and the price columns
            they need, and no prices &mdash; so it is safe to email either way.
          </p>
        </div>

        <table style="margin-top:14px">
          <tbody>
            <tr>
              <td style="width:130px"><b>Quote</b></td>
              <td class="hint" style="margin:0">
                Where the account team works. Quantities are already filled in; they type their own
                unit prices into the shaded column and the line totals, monthly total and period
                total compute themselves. Messages come pre-rounded into blocks of 100,000.
              </td>
            </tr>
            <tr>
              <td><b>Configurator</b></td>
              <td class="hint" style="margin:0">
                Every quantity on the row the Sales Configurator keeps for it, so column D can be
                copied for a period and pasted at the same cell.
              </td>
            </tr>
            <tr>
              <td><b>Design</b></td>
              <td class="hint" style="margin:0">
                Every reading, its cadence, and the measurement it travels in.
              </td>
            </tr>
            <tr>
              <td><b>Months</b></td>
              <td class="hint" style="margin:0">
                All nine counters for every calendar month &mdash; where the range comes from.
              </td>
            </tr>
            <tr>
              <td><b>Guidance</b></td>
              <td class="hint" style="margin:0">What the tool flagged, and what each finding is worth.</td>
            </tr>
          </tbody>
        </table>

        <p class="hint" style="margin-top:14px">
          Built in your browser: nothing is uploaded and no scenario leaves the tenant. The tool
          holds no price list, so the file cannot carry one &mdash; the numbers arrive from whoever
          does the quoting. Discounts beyond the single catalog field, approval thresholds and
          currency conversion stay in the Sales Configurator, which remains the source of truth for
          an approved quote.
        </p>
      </div>
    </section>
  );
}

function PayloadsHidden() {
  return (
    <p class="hint" style="margin-top:18px">
      The exact JSON each machine should send &mdash; one example per measurement, event, alarm and
      inventory write &mdash; is ready for whoever writes the device code. Turn on{' '}
      <b>Expert mode</b> in the header to see it.
    </p>
  );
}
