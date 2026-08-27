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
 * like two unrelated subjects. They now close step 3, after the three inbound
 * elements, where the contrast with them is the point being taught.
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
  { key: 'commercial', title: 'Deployment & add-ons', lead: 'The parts of the quote the fleet cannot imply.' },
  { key: 'rollout', title: 'Rollout', lead: 'How the fleet ramps across the contract periods.' },
  { key: 'results', title: 'Results', lead: 'Messages per calendar month, and where each number goes.' },
];
