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
import { load, normalise, save } from './store.js';
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

function App() {
  const [locale, setLocale] = useLocale();

  return (
    <LocaleContext.Provider value={locale}>
      <Wizard locale={locale} onLocale={setLocale} />
    </LocaleContext.Provider>
  );
}

function Wizard({ locale, onLocale }: { locale: Locale; onLocale: (next: Locale) => void }) {
  const t = useT();
  const [scenario, setScenario] = useState<Scenario>(() => load() ?? blankScenario());
  const [step, setStep] = useState(0);
  const [expert, setExpert] = useExpert();

  useEffect(() => {
    save(scenario);
  }, [scenario]);

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
          {step === 0 && (
            <>
              <button onClick={() => setScenario(conceptSection9Scenario())}>
                {t('nav.loadExample')}
              </button>
              <button onClick={() => setScenario(blankScenario())}>{t('nav.reset')}</button>
            </>
          )}
          {!last && (
            <button class="primary" onClick={() => setStep(step + 1)}>
              {t(STEPS[step + 1]!.titleKey)} &rarr;
            </button>
          )}
          {last && <ScenarioIO scenario={scenario} onChange={setScenario} />}
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
      <label class="import">
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
          }}
        />
      </label>
      <button class="primary" onClick={download}>
        {t('io.export')}
      </button>
    </>
  );
}

const root = document.getElementById('root');
if (root) render(<App />, root);
