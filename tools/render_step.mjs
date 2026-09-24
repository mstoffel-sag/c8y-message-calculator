/**
 * Renders one wizard step to a standalone HTML file, for a WebKit snapshot.
 *
 *   npm test                                   # builds dist-test/, which this reads
 *   node tools/render_step.mjs contract /tmp/c.html [scrollPx] [locale] [scenarios]
 *   qlmanage -t -s 1100 -o /tmp /tmp/c.html
 *
 * There is no browser in the loop here, so this plus qlmanage is how a layout
 * change gets looked at rather than reasoned about. `scrollPx` shifts the page up
 * so a snapshot can reach content below the first screenful.
 *
 * The frame around the step is written out by hand rather than imported: `App`
 * reads browser storage before it renders anything, and there is no browser
 * here. That is a copy, so it is kept to the parts that decide width -- the top
 * bar, because it is capped at 1240 px and German runs a fifth longer than
 * English, and the scenario rail, because it takes 190 px off the step. Both
 * are what a layout change most often breaks.
 *
 * `scenarios` is how many are in the library, which is what decides whether the
 * rail is there at all: one is the default and the CSS hides it.
 */

import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { readFileSync, writeFileSync } from 'node:fs';

import { LocaleContext } from '../dist-test/src/ui/i18n.js';
import { setFormatLocale } from '../dist-test/src/ui/format.js';
import { STEPS } from '../dist-test/src/ui/wizard/steps.js';
import { StepFleet } from '../dist-test/src/ui/wizard/StepFleet.js';
import { StepTimeSeries } from '../dist-test/src/ui/wizard/StepTimeSeries.js';
import { StepDiscrete } from '../dist-test/src/ui/wizard/StepDiscrete.js';
import { StepContract } from '../dist-test/src/ui/wizard/StepContract.js';
import { StepResults } from '../dist-test/src/ui/wizard/StepResults.js';
import { makeT } from '../dist-test/lib/i18n/index.js';
import { computeScenario } from '../dist-test/lib/engine/index.js';
import { compact } from '../dist-test/lib/format/index.js';
import { conceptSection9Scenario } from '../dist-test/lib/presets/index.js';

const COMPONENTS = {
  fleet: StepFleet,
  series: StepTimeSeries,
  discrete: StepDiscrete,
  contract: StepContract,
  results: StepResults,
};

const [key, out, scroll = '0', locale = 'en', scenarios = '1'] = process.argv.slice(2);
const Step = COMPONENTS[key];
if (!Step || !out) {
  console.error(
    `usage: render_step.mjs <${Object.keys(COMPONENTS).join('|')}> <out.html> [scrollPx] [en|de]`,
  );
  process.exit(1);
}

const scenario = conceptSection9Scenario();
const result = computeScenario(scenario);
const index = STEPS.findIndex((s) => s.key === key);
const def = STEPS[index];

// Every step takes scenario/onChange; the ones that report take result, and the
// results step takes the expert flag. Passing all of them is harmless.
setFormatLocale(locale);
const t = makeT(locale);
const body = render(
  h(LocaleContext.Provider, { value: locale }, h(Step, { scenario, result, expert: true, onChange: () => {} })),
);
const rail = STEPS.map(
  (s, i) => `<button class="rail-step ${i === index ? 'on' : ''}"><i>${i + 1}</i>${t(s.titleKey)}</button>`,
).join('');

const library = Array.from(
  { length: Math.max(1, Number(scenarios) || 1) },
  (_, i) => `<button class="library-tab ${i === 0 ? 'on' : ''}">${t('library.untitled')}</button>`,
).join('');

const topbar = `<div class="topbar-inner">
  <div class="brand">
    <input type="text" value="${t('library.untitled')}" />
    <small>${t('app.tagline')}</small>
  </div>
  <div class="runner">
    <div class="fig"><b>${compact(result.peakMonth.total)}</b><span>${t('app.stat.peakMonth')}</span></div>
    <div class="fig alt"><b>&mdash;</b><span>${t('app.stat.vsUnbundled')}</span></div>
    <div class="fig alt"><b>${result.findings.length}</b><span>${t('app.stat.findings')}</span></div>
  </div>
  <label class="expert on"><input type="checkbox" checked />${t('app.expert')}</label>
  <button class="ghost">+ ${t('library.add')}</button>
  <button class="ghost">${t('library.delete')}</button>
  <label class="locale"><select><option>${locale.toUpperCase()}</option></select></label>
</div>`;

writeFileSync(
  out,
  `<!doctype html><html><head><meta charset="utf-8"><style>
${readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')}
.shell { margin-top: -${Number(scroll) || 0}px; }
</style></head><body>
<div class="topbar">${topbar}<div class="rail">${rail}</div></div>
<div class="page">
  <nav class="library-rail">${library}</nav>
  <div class="shell">
    <div class="step-head"><h1>${t(def.titleKey)}</h1><p>${t(def.leadKey)}</p></div>
    ${body}
  </div>
</div>
</body></html>`,
);
console.log(out);
