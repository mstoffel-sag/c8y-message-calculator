/**
 * Cumulocity Message Calculator -- a guided wizard.
 *
 * Walks a customer from "what machines do you have" to "here are the nine
 * counters and the cells they go in", teaching the data model on the way. It
 * reports volume and nothing else: no prices, no billable units, no commitment
 * sizing. See CONCEPT.md.
 */

import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { computeScenario, type Scenario } from '../../lib/engine/index.js';
import type { Locale } from '../../lib/i18n/index.js';
import { blankScenario, conceptSection9Scenario } from '../../lib/presets/index.js';
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  migrate,
  mostRecent,
  newScenarioId,
  normalise,
  saveScenario,
} from './store.js';
import { useExpert } from './expert.js';
import { LocaleContext, LocaleSwitch, useLocale, useT } from './i18n.js';
import { STEPS } from './wizard/steps.js';
import { StepFleet } from './wizard/StepFleet.js';
import { StepTimeSeries } from './wizard/StepTimeSeries.js';
import { StepDiscrete } from './wizard/StepDiscrete.js';
import { StepContract } from './wizard/StepContract.js';
import { StepResults } from './wizard/StepResults.js';
import { Findings } from './Results.js';
import { compact, nf1 } from './format.js';

/**
 * Exported so a test can render the frame, not only the steps. The picker, the
 * running total and the step rail all live out here, and until this was
 * exported none of them was rendered by anything but a browser.
 */
export function App() {
  const [locale, setLocale] = useLocale();

  return (
    <LocaleContext.Provider value={locale}>
      <Wizard locale={locale} onLocale={setLocale} />
    </LocaleContext.Provider>
  );
}

function Wizard({ locale, onLocale }: { locale: Locale; onLocale: (next: Locale) => void }) {
  const t = useT();
  // The library, and which of it is open. One estimate per customer, kept side
  // by side rather than overwritten -- the Web SDK build lists them in the
  // shell's navigator, and this build draws its own rail beside the page.
  const [openId, setOpenId] = useState<string>(() => {
    migrate();
    const recent = mostRecent(listScenarios());
    if (recent) return recent.id;
    const id = newScenarioId();
    saveScenario(id, blankScenario());
    return id;
  });
  const [scenario, setScenario] = useState<Scenario>(
    () => loadScenario(openId) ?? blankScenario(),
  );
  const [library, setLibrary] = useState(() => listScenarios());
  const [step, setStep] = useState(0);
  const [expert, setExpert] = useExpert();

  useEffect(() => {
    saveScenario(openId, scenario);
    setLibrary(listScenarios());
  }, [scenario, openId]);

  const open = (id: string) => {
    setOpenId(id);
    setScenario(loadScenario(id) ?? blankScenario());
    setStep(0);
  };

  const addScenario = () => {
    const id = newScenarioId();
    saveScenario(id, blankScenario());
    open(id);
  };

  const dropScenario = (id: string) => {
    deleteScenario(id);
    const rest = listScenarios();
    setLibrary(rest);
    if (id !== openId) return;
    const next = mostRecent(rest);
    if (next) open(next.id);
    else addScenario();
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const result = useMemo(() => computeScenario(scenario), [scenario]);
  const errors = result.findings.filter((f) => f.severity === 'error').length;
  const def = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const props = { scenario, onChange: setScenario };

  return (
    <>
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <input
              type="text"
              value={scenario.name}
              aria-label={t('app.scenarioName')}
              onInput={(e) => setScenario({ ...scenario, name: (e.target as HTMLInputElement).value })}
            />
            <small>{t('app.tagline')}</small>
          </div>
          <div class="runner">
            <div class="fig">
              <b>{compact(result.peakMonth.total)}</b>
              <span>{t('app.stat.peakMonth')}</span>
            </div>
            <div class="fig alt">
              <b>
                {result.peakMonth.total > 0
                  ? `${nf1.format(result.peakMonth.naiveTotal / result.peakMonth.total)}×`
                  : '—'}
              </b>
              <span>{t('app.stat.vsUnbundled')}</span>
            </div>
            <div class="fig alt">
              <b style={errors > 0 ? 'color:var(--error)' : ''}>{result.findings.length}</b>
              <span>{errors > 0 ? t('app.stat.toFix', { count: errors }) : t('app.stat.findings')}</span>
            </div>
          </div>

          <label
            class={`expert ${expert ? 'on' : ''}`}
            title={t('app.expert.title')}
          >
            <input
              type="checkbox"
              checked={expert}
              onChange={(e) => setExpert((e.target as HTMLInputElement).checked)}
            />
            {t('app.expert')}
          </label>

          {/* Every verb that acts on the scenario, in one group and on every
              step -- which is where the Web SDK build has always had them, and
              where the wizard's own bottom bar is the wrong home: it is for
              moving between steps, and it put Load example and Reset on step
              one only, so from step two on there was no way to start over.

              Library, content, files -- that is the order. Grouped so the top
              bar breaks between the stats and the verbs rather than through the
              middle of them. */}
          <div class="verbs">
          <button class="ghost" onClick={addScenario}>+ {t('library.add')}</button>
          {library.length > 1 && (
            <button
              class="ghost danger"
              onClick={() => {
                const name = scenario.name.trim() || t('library.untitled');
                if (confirm(t('library.confirmDelete', { name }))) dropScenario(openId);
              }}
            >
              {t('library.delete')}
            </button>
          )}

          {/* Import and export belong with the other scenario-level verbs, and
              on every step. They used to sit in the bottom bar of the last step
              only, which meant a scenario could not be loaded without first
              walking to the end of a wizard you were trying to skip -- and the
              Web SDK build has had them in its action bar all along. */}
          <button onClick={() => setScenario(conceptSection9Scenario())} class="ghost">
            {t('nav.loadExample')}
          </button>
          <button onClick={() => setScenario(blankScenario())} class="ghost danger">
            {t('nav.reset')}
          </button>
          <ScenarioIO scenario={scenario} onChange={setScenario} />
          </div>

          <LocaleSwitch locale={locale} onChange={onLocale} />
        </div>

        <div class="rail">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              class={`rail-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => setStep(i)}
            >
              <i>{i + 1}</i>
              {t(s.titleKey)}
            </button>
          ))}
        </div>
      </div>

      {/* The library as a rail, the way the Web SDK build lists it in the
          shell's navigator. This build has no navigator, so it grows one: a
          scenario you can see is a scenario you switch to, where a collapsed
          <select> made you open it first to remember what was in there. */}
      <div class="page">
        <nav class="library-rail" aria-label={t('library.label')}>
          {library.map((entry) => (
            <button
              key={entry.id}
              class={`library-tab ${entry.id === openId ? 'on' : ''}`}
              aria-current={entry.id === openId ? 'page' : undefined}
              title={entry.name.trim() || t('library.untitled')}
              onClick={() => open(entry.id)}
            >
              {entry.name.trim() || t('library.untitled')}
            </button>
          ))}
        </nav>

        <div class="shell">
          <div class="step-head">
            <h1>{t(def.titleKey)}</h1>
            <p>{t(def.leadKey)}</p>
          </div>

          {def.key === 'fleet' && <StepFleet {...props} />}
          {def.key === 'series' && <StepTimeSeries {...props} />}
          {def.key === 'discrete' && <StepDiscrete {...props} />}
          {def.key === 'contract' && <StepContract {...props} result={result} />}
          {def.key === 'results' && (
            <StepResults scenario={scenario} result={result} expert={expert} />
          )}

          {/* Guidance follows the customer through every step, because a warning
              is worth far more while the input that caused it is still on screen. */}
          {def.key !== 'results' && result.findings.length > 0 && (
            <Findings findings={result.findings} />
          )}

          <div class="nav">
            <button disabled={step === 0} onClick={() => setStep(step - 1)}>
              &larr; {t('nav.back')}
            </button>
            <span class="hint" style="margin:0">
              {t('nav.progress', { step: step + 1, total: STEPS.length })}
            </span>
            <span class="spacer" />
            {!last && (
              <button class="primary" onClick={() => setStep(step + 1)}>
                {t(STEPS[step + 1]!.titleKey)} &rarr;
              </button>
            )}
            </div>
        </div>
      </div>
    </>
  );
}

function ScenarioIO({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (next: Scenario) => void;
}) {
  const t = useT();
  const download = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name.replace(/[^\w.-]+/g, '-').toLowerCase() || 'scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <label class="ghost file">
        {t('io.import')}
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            // normalise() so a file from an older build, or a hand-edited one,
            // loads instead of taking the page down.
            void file.text().then((text) => {
              try {
                onChange(normalise(JSON.parse(text)));
              } catch {
                alert(t('io.unreadable'));
              }
            });
            // The same file twice in a row is the commonest retry there is, and
            // without this the input holds the old value and fires nothing.
            (e.target as HTMLInputElement).value = '';
          }}
        />
      </label>
      <button class="ghost" onClick={download}>
        {t('io.export')}
      </button>
    </>
  );
}

const root = document.getElementById('root');
if (root) render(<App />, root);
