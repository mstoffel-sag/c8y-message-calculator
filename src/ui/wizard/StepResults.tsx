/** Results: what the wizard produces. */

import {
  measurementView,
  workbookFileName,
  workbookSheets,
  type Scenario,
  type ScenarioResult,
} from '../../../lib/engine/index.js';
import { buildXlsx } from '../../../lib/xlsx/writer.js';
import { Handoff } from './Handoff.js';
import { Commitment, Results, Storage } from '../Results.js';
import { Payloads } from '../Payloads.js';
import { MeasurementDiagram } from '../MeasurementDiagram.js';
import { Empty } from '../parts.js';
import { n } from '../format.js';
import { Rich, useT } from '../i18n.js';

export function StepResults({
  scenario,
  result,
  expert,
}: {
  scenario: Scenario;
  result: ScenarioResult;
  expert: boolean;
}) {
  const t = useT();
  if (scenario.machineTypes.length === 0) {
    return <Empty>{t('results.empty')}</Empty>;
  }
  return (
    <>
      {/* The table first, then the term it is quoted over, then the file that
          carries both away. The download led the page and was the one thing on
          it nobody could act on until they had read the rest. */}
      <Handoff scenario={scenario} result={result} />
      <Commitment scenario={scenario} result={result} />
      {/* Storage is the other quantity a period is quoted on, so it belongs
          beside the commitment rather than further down among the volume
          panels: D27 and D37 are the two numbers that leave this page. */}
      <Storage result={result} />
      <DownloadWorkbook scenario={scenario} result={result} />
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
  const t = useT();
  const types = scenario.machineTypes
    .map((mt) => ({ mt, view: measurementView(mt, scenario.settings.fragmentPrefix) }))
    .filter(({ view }) => view.groups.length > 0);

  if (types.length === 0) return null;

  return (
    <section class="panel">
      <header>
        <h2>{t('design.heading')}</h2>
        <span class="sub">{t('design.sub')}</span>
      </header>
      <div class="body">
        {types.map(({ mt, view }) => (
          <div key={mt.id} style="margin-bottom:18px">
            <div class="row" style="margin-bottom:4px">
              <h3>{mt.name || t('machine.unnamed')}</h3>
              <span class="mt-tag">{t('machine.machines', { count: n(mt.machineCount) })}</span>
              <span class="mt-tag">
                {t.plural('design.measurements', view.groups.length)}
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
  const t = useT();
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
        <h2>{t('workbook.heading')}</h2>
        <span class="sub">{t('workbook.sub')}</span>
      </header>
      <div class="body">
        <div class="row" style="align-items:center">
          <button class="primary" onClick={download}>
            {t('workbook.download')}
          </button>
          <p class="hint" style="flex:1;min-width:320px;margin:0">
            <Rich k="workbook.sendIt" />
          </p>
        </div>

        <p class="hint" style="margin-top:14px">{t('workbook.builtHere')}</p>
      </div>
    </section>
  );
}

function PayloadsHidden() {
  return (
    <p class="hint" style="margin-top:18px">
      <Rich k="payload.hidden" />
    </p>
  );
}
