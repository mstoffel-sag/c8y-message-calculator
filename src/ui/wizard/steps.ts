/**
 * The wizard's order, from `lib/wizard/steps.ts`, where both apps read it.
 *
 * Re-exported rather than imported directly at each call site so that the step
 * components next to this file keep saying `./steps.js`, which is where a
 * reader looks for them.
 */

export * from '../../../lib/wizard/steps.js';
