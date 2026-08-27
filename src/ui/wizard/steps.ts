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

/**
 * The `key` is the handle for a step, and its position in this array is the only
 * statement of order anywhere. Nothing outside this file names a step by number:
 * components refer to each other by component name, tests are named after the
 * key, and CONCEPT.md numbers the rows of one table. Reordering the wizard is
 * then a change to this array, not a rename across twenty files.
 */
export interface StepDef {
  key: string;
  title: string;
  /** One line, shown under the title. */
  lead: string;
}

export const STEPS: StepDef[] = [
  { key: 'fleet', title: 'Machines', lead: 'What kinds of machine are there, and how many of each?' },
  { key: 'series', title: 'Measurements', lead: 'What does each machine measure, and how often?' },
  {
    key: 'discrete',
    title: 'Events, alarms, inventory & commands',
    lead: 'What else does a machine report, what is simply true about it, and what gets sent back to it?',
  },
  {
    key: 'contract',
    title: 'Contract & deployment',
    lead: 'How long each period is, how the fleet ramps across them, and what is deployed in each.',
  },
  { key: 'results', title: 'Results', lead: 'Messages per calendar month, and where each number goes.' },
];
