/**
 * The wizard. CONCEPT.md section 6.
 *
 * The order is the order a customer can actually answer in: what the machines
 * are, what they measure, what else they report, what gets sent to them, and
 * only then the commercial line items that have nothing to do with the fleet.
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
  { key: 'discrete', title: 'Events, alarms & facts', lead: 'What else does a machine report, and which of the three is it?' },
  { key: 'commands', title: 'Commands', lead: 'What does Cumulocity send to the machine?' },
  { key: 'commercial', title: 'Deployment & add-ons', lead: 'The parts of the quote the fleet cannot imply.' },
  { key: 'rollout', title: 'Rollout', lead: 'How the fleet ramps across the contract periods.' },
  { key: 'results', title: 'Results', lead: 'Messages per calendar month, and where each number goes.' },
];
