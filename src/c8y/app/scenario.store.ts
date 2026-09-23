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
import {
  mostRecent,
  newScenarioId,
  normaliseEntries,
  removeEntry,
  touch,
  type ScenarioEntry,
} from '../../../lib/scenario/library.js';

/** The single scenario this build kept before it kept several. Read once, by
 *  `migrate`, so nobody loses work in progress to an upgrade. Never written. */
const STORAGE_KEY = 'c8y.message-calculator.scenario';
const INDEX_KEY = 'c8y.message-calculator.scenarios';
const EXPERT_KEY = 'c8y.message-calculator.expert';
const scenarioKey = (id: string) => `c8y.message-calculator.scenario.${id}`;

@Injectable({ providedIn: 'root' })
export class ScenarioStore {
  /**
   * Which scenario is open. The route carries it (`scenario/:id`), so the
   * navigator can link straight to one and the browser's back button works
   * between them.
   */
  private readonly openId = signal<string>(firstId());

  /** The index, as a signal, so the navigator redraws when one is added. */
  private readonly index = signal<ScenarioEntry[]>(readIndex());

  readonly entries = this.index.asReadonly();
  readonly currentId = this.openId.asReadonly();

  private readonly current = signal<Scenario>(readScenario(firstId()) ?? blankScenario());

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
    effect(() => {
      const id = this.openId();
      const scenario = this.current();
      keep(scenarioKey(id), JSON.stringify(scenario));
      const next = touch(readIndex(), id, scenario.name);
      keep(INDEX_KEY, JSON.stringify(next));
      this.index.set(next);
    });
    effect(() => keep(EXPERT_KEY, this.expert() ? '1' : '0'));
  }

  /**
   * Opens a scenario by id, or creates one when the id is unknown -- a stale
   * link, or a scenario deleted in another tab. The route is the only caller.
   */
  openById(id: string | null): void {
    if (id && id === this.openId()) return;
    const found = id ? readScenario(id) : null;
    if (id && found) {
      this.openId.set(id);
      this.current.set(found);
      return;
    }
    if (id) {
      // Unknown id: keep the URL honest by minting the scenario it names.
      this.openId.set(id);
      this.current.set(blankScenario());
      return;
    }
    this.openId.set(firstId());
    this.current.set(readScenario(this.openId()) ?? blankScenario());
  }

  /** A new, empty scenario. Returns its id so the caller can route to it. */
  add(): string {
    const id = newScenarioId();
    keep(scenarioKey(id), JSON.stringify(blankScenario()));
    const next = touch(readIndex(), id, '');
    keep(INDEX_KEY, JSON.stringify(next));
    this.index.set(next);
    return id;
  }

  /** Removes one, and returns the id that should be opened instead. */
  remove(id: string): string {
    try {
      localStorage.removeItem(scenarioKey(id));
    } catch {
      // The index is what the navigator reads, so dropping that is what counts.
    }
    const next = removeEntry(readIndex(), id);
    keep(INDEX_KEY, JSON.stringify(next));
    this.index.set(next);
    const recent = mostRecent(next);
    return recent ? recent.id : this.add();
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

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readIndex(): ScenarioEntry[] {
  return normaliseEntries(read(INDEX_KEY));
}

/**
 * normalise() so a scenario written by an older build, or by the standalone
 * one, loads instead of taking the page down.
 */
function readScenario(id: string): Scenario | null {
  const raw = read(scenarioKey(id));
  return raw ? normalise(raw) : null;
}

/**
 * The id to open before the route has said otherwise, moving a pre-library
 * scenario into the library on the way. The old key is left where it is: a
 * browser that opens an older build still finds its work.
 */
function firstId(): string {
  const existing = mostRecent(readIndex());
  if (existing) return existing.id;
  const id = newScenarioId();
  const old = read(STORAGE_KEY);
  keep(scenarioKey(id), JSON.stringify(old ? normalise(old) : blankScenario()));
  keep(INDEX_KEY, JSON.stringify(touch([], id, '')));
  return id;
}

function restoreExpert(): boolean {
  try {
    return localStorage.getItem(EXPERT_KEY) === '1';
  } catch {
    return false;
  }
}
