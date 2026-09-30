/**
 * Renders one wizard step to a standalone HTML file, for a WebKit snapshot.
 *
 *   npm test                                   # builds dist-test/, which this reads
 *   node tools/render_step.mjs contract /tmp/c.html [scrollPx] [locale] [scenarios] [theme]
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

const [key, out, scroll = '0', locale = 'en', scenarios = '1', theme = 'dark'] = process.argv.slice(2);
const Step = COMPONENTS[key];
if (!Step || !out) {
  console.error(
    `usage: render_step.mjs <${Object.keys(COMPONENTS).join('|')}> <out.html> [scrollPx] [en|de] [scenarios] [light|dark]`,
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
  <div class="logo"><svg viewBox="0 0 873 189" height="18"><g clip-path="url(#c8yLogoClipSnap)"><path d="M414.671 169.084V94.4443H396.384V186.728H455.309V169.084H414.671Z" fill="currentColor"/><path d="M508.37 92.7939C481.587 92.7939 460.77 113.739 460.77 140.396C460.77 167.18 481.714 187.997 508.37 187.997C534.645 187.997 555.97 166.672 555.97 140.396C555.97 114.246 534.645 92.7939 508.37 92.7939ZM537.437 140.523C537.437 157.278 524.744 170.48 508.37 170.48C491.995 170.48 479.175 157.405 479.175 140.523C479.175 123.767 491.995 110.565 508.37 110.565C524.744 110.692 537.437 123.767 537.437 140.523Z" fill="currentColor"/><path d="M48.5501 110.692C59.4715 110.692 68.615 115.897 74.3297 125.417L75.2187 126.94L90.9658 117.801L90.0769 116.278C81.5683 101.553 66.0752 92.9209 48.5501 92.9209C21.7546 92.9209 0.927734 113.866 0.927734 140.523C0.927734 167.307 21.8816 188.124 48.5501 188.124C66.0752 188.124 81.5683 179.366 90.0769 164.768L90.9658 163.245L75.2187 154.105L74.3297 155.628C68.615 165.149 59.3445 170.353 48.5501 170.353C32.168 170.353 19.3417 157.278 19.3417 140.396C19.2147 123.767 32.041 110.692 48.5501 110.692Z" fill="currentColor"/><path d="M160.432 150.424C160.432 162.864 153.447 170.48 141.764 170.48C129.953 170.48 122.969 162.991 122.969 150.424V94.4443H104.682V150.17C104.682 172.892 119.667 188.252 141.891 188.252C163.987 188.252 178.973 172.892 178.973 150.17V94.4443H160.686V150.424H160.432Z" fill="currentColor"/><path d="M361.08 150.424C361.08 162.864 354.095 170.48 342.412 170.48C330.602 170.48 323.617 162.991 323.617 150.424V94.4443H305.33V150.17C305.33 172.892 320.315 188.252 342.539 188.252C364.636 188.252 379.621 172.892 379.621 150.17V94.4443H361.334V150.424H361.08Z" fill="currentColor"/><path d="M616.717 110.692C627.638 110.692 636.782 115.897 642.497 125.417L643.386 126.94L659.133 117.801L658.244 116.278C649.735 101.553 634.242 92.9209 616.717 92.9209C589.922 92.9209 569.095 113.866 569.095 140.523C569.095 167.307 590.049 188.124 616.717 188.124C634.242 188.124 649.735 179.366 658.244 164.768L659.133 163.245L643.386 154.105L642.497 155.628C636.782 165.149 627.512 170.353 616.717 170.353C600.335 170.353 587.509 157.278 587.509 140.396C587.382 123.767 600.335 110.692 616.717 110.692Z" fill="currentColor"/><path d="M693.168 94.4443H674.881V186.728H693.168V94.4443Z" fill="currentColor"/><path d="M709.041 112.089H734.821V186.728H753.108V112.089H778.887V94.4443H709.041V112.089Z" fill="currentColor"/><path d="M850.892 94.4443L828.033 129.479L805.429 94.4443H783.84L818.89 148.012V186.728H837.304V148.139L872.481 94.4443H850.892Z" fill="currentColor"/><path d="M241.834 142.173L211.99 94.4443H195.735V186.728H214.022V130.495L235.992 165.53H247.93L269.772 130.622V186.728H288.059V94.4443H271.804L241.834 142.173Z" fill="currentColor"/><path d="M405.488 63.2879C422.659 63.2879 436.776 49.2973 436.776 31.9998C436.776 14.8295 422.786 0.711729 405.488 0.711729C388.191 0.711729 374.2 14.7023 374.2 31.9998C374.2 49.1701 388.191 63.2879 405.488 63.2879Z" fill="currentColor"/><path d="M475.245 1.79111H454.376V62.2085H475.245V1.79111Z" fill="currentColor"/><path d="M524.133 63.2897C541.304 63.2897 555.421 49.2983 555.421 31.9998C555.421 14.8286 541.431 0.709961 524.133 0.709961C506.836 0.709961 492.845 14.7014 492.845 31.9998C492.972 49.1711 506.836 63.2897 524.133 63.2897Z" fill="currentColor"/><path d="M604.31 63.2897C621.48 63.2897 635.598 49.2983 635.598 31.9998C635.598 14.8286 621.607 0.709961 604.31 0.709961C587.139 0.709961 573.021 14.7014 573.021 31.9998C573.149 49.1711 587.139 63.2897 604.31 63.2897Z" fill="currentColor"/><path d="M684.486 63.2897C701.656 63.2897 715.774 49.2983 715.774 31.9998C715.774 14.8286 701.783 0.709961 684.486 0.709961C667.188 0.709961 653.198 14.7014 653.198 31.9998C653.325 49.1711 667.315 63.2897 684.486 63.2897Z" fill="currentColor"/><path d="M764.662 63.2897C781.832 63.2897 795.95 49.2983 795.95 31.9998C795.95 14.8286 781.959 0.709961 764.662 0.709961C747.492 0.709961 733.374 14.7014 733.374 31.9998C733.374 49.1711 747.364 63.2897 764.662 63.2897Z" fill="currentColor"/><path d="M834.419 1.79111H813.55V62.2085H834.419V1.79111Z" fill="currentColor"/><path d="M872.888 1.79111H852.019V62.2085H872.888V1.79111Z" fill="currentColor"/></g><defs><clipPath id="c8yLogoClipSnap"><rect width="873" height="188" fill="white" transform="translate(0 0.5)"/></clipPath></defs></svg></div>
  <div class="brand">
    <span class="wordmark">${t('app.product')}</span>
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
  <button class="ghost danger">${t('library.delete')}</button>
  <button class="ghost">${t('nav.loadExample')}</button>
  <button class="ghost danger">${t('nav.reset')}</button>
  <label class="ghost file">${t('io.import')}</label>
  <button class="ghost">${t('io.export')}</button>
  <label class="locale"><select><option>${t(theme === 'light' ? 'app.theme.light' : 'app.theme.dark')}</option></select></label>
  <label class="locale"><select><option>${locale.toUpperCase()}</option></select></label>
</div>`;

writeFileSync(
  out,
  // The theme is stated, not inherited. The stylesheet keys on the attribute
  // now, so a snapshot no longer depends on whether the machine taking it
  // happens to be in dark mode -- which is how every snapshot in this repo came
  // out dark without anyone choosing that.
  `<!doctype html><html data-theme="${theme === 'light' ? 'light' : 'dark'}"><head><meta charset="utf-8"><style>
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
