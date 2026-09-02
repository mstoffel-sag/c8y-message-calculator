/**
 * The wizard. CONCEPT.md section 6.
 *
 * The order is the order a customer can actually answer in: what the machines
 * are, what they measure, everything else that travels between machine and
 * platform, and only then the commercial line items that have nothing to do
 * with the fleet.
 *
 * Commands used to be a step of their own. They are one element among four --
 * and the shortest of the four to answer -- so a whole screen for them put the
 * emphasis in the wrong place and made the fleet's non-measurement traffic look
 * like two unrelated subjects. They now close `discrete`, after the inbound
 * elements, where the contrast with them is the point being taught.
 *
 * Deployment & add-ons was a screen of its own too, and it asked for a quantity
 * per contract period while the periods themselves were defined on the screen
 * after it. Both now live on `contract`: the periods are decided at the top and
 * spent immediately below. A thing is configured in one place, and that place is
 * where it is used.
 */

import type { Key } from '../../../lib/i18n/index.js';

/**
 * The `key` is the handle for a step, and its position in this array is the only
 * statement of order anywhere. Nothing outside this file names a step by number:
 * components refer to each other by component name, tests are named after the
 * key, and CONCEPT.md numbers the rows of one table. Reordering the wizard is
 * then a change to this array, not a rename across twenty files.
 */

export interface StepDef {
  key: string;
  /** Catalogue keys, not strings: the wizard's own words are translated too. */
  titleKey: Key;
  /** One line, shown under the title. */
  leadKey: Key;
}

export const STEPS: StepDef[] = [
  { key: 'fleet', titleKey: 'steps.fleet.title', leadKey: 'steps.fleet.lead' },
  { key: 'series', titleKey: 'steps.series.title', leadKey: 'steps.series.lead' },
  { key: 'discrete', titleKey: 'steps.discrete.title', leadKey: 'steps.discrete.lead' },
  { key: 'contract', titleKey: 'steps.contract.title', leadKey: 'steps.contract.lead' },
  { key: 'results', titleKey: 'steps.results.title', leadKey: 'steps.results.lead' },
];
