/**
 * The scenario, and everything derived from it.
 *
 * One signal holds the scenario; everything on screen is computed from it. The
 * edits themselves are not here -- they are the pure functions in
 * `lib/scenario/edits.ts`, shared with the standalone build -- so this service
 * is only three responsibilities: hold the current value, recompute the result
 * when it changes, and remember it between visits.
 *
 * `patch` takes one of those functions rather than a new scenario, which is
 * what keeps a component from assembling a Scenario by hand and getting a
 * counter wrong.
 *
 * **Where a scenario is kept.** In the browser, under a key of this app's own.
 * Managed objects (`type: c8y_MessageCalculatorScenario`) are the right home in
 * a tenant and are what CONCEPT.md section 8 intends, but that is a feature with
 * a UI of its own -- a list, a name, an owner -- and this port is the wizard.
 * The key is shared with the standalone build on purpose: the same browser
 * opening either build finds the same work in progress.
 */

import { Injectable, computed, effect, signal } from '@angular/core';

import { computeScenario, type Scenario } from '../../../lib/engine/index.js';
import { blankScenario } from '../../../lib/presets/index.js';
import { normalise } from '../../../lib/scenario/edits.js';

const STORAGE_KEY = 'c8y.message-calculator.scenario';
const EXPERT_KEY = 'c8y.message-calculator.expert';

@Injectable({ providedIn: 'root' })
export class ScenarioStore {
  private readonly current = signal<Scenario>(restore() ?? blankScenario());

  /** Read-only everywhere except through `set` and `patch`. */
  readonly scenario = this.current.asReadonly();

  readonly result = computed(() => computeScenario(this.current()));

  readonly findings = computed(() => this.result().findings);
  readonly errorCount = computed(
    () => this.findings().filter(finding => finding.severity === 'error').length,
  );

  /**
   * Whether the hand-off shows its workings. A viewer preference, not part of
   * the scenario: it does not travel with an export, because the scenario
   * describes a fleet and not a reader.
   */
  readonly expert = signal<boolean>(restoreExpert());

  constructor() {
    effect(() => keep(STORAGE_KEY, JSON.stringify(this.current())));
    effect(() => keep(EXPERT_KEY, this.expert() ? '1' : '0'));
  }

  set(next: Scenario): void {
    this.current.set(next);
  }

  /** The one way a component changes anything: hand in an edit from lib/. */
  patch(edit: (scenario: Scenario) => Scenario): void {
    this.current.update(edit);
  }
}

function keep(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked site data both throw; losing the autosave is
    // not worth interrupting the session for.
  }
}

function restore(): Scenario | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // normalise() so a scenario written by an older build, or by the standalone
    // one, loads instead of taking the page down.
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function restoreExpert(): boolean {
  try {
    return localStorage.getItem(EXPERT_KEY) === '1';
  } catch {
    return false;
  }
}
