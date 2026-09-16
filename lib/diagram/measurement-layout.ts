/**
 * Where a customer's own configuration lands on the canvas.
 *
 * Same reason as the explainer's layout: two renderers and a test read these,
 * and a copy of a constant is a constant that drifts. `rowSpans` is the only
 * part with any judgement in it -- a group that could not draw all its members
 * still needs a row for the "+3 more" line, and the envelope has to cover it.
 */

import type { MeasurementView, ViewGroup } from '../engine/index.js';

/** Geometry, exported so the layout tests use these numbers, not a copy. */
export const DG = {
  row: 38,
  top: 24,
  bottom: 10,
  width: 700,
  labelX: 8,
  labelW: 206,
  boxX: 336,
  boxW: 356,
  /** Below this a box cannot stack a title, a subtitle and its dots. */
  stackMinHeight: 62,
} as const;

export const canvasHeight = (rows: number) => DG.top + Math.max(1, rows) * DG.row + DG.bottom;
export const rowCentre = (i: number) => DG.top + i * DG.row + DG.row / 2;

/** First drawn row of each group, in order. */
export function rowSpans(view: MeasurementView): Array<{ group: ViewGroup; from: number; to: number }> {
  const out: Array<{ group: ViewGroup; from: number; to: number }> = [];
  let cursor = 0;
  for (const group of view.groups) {
    const drawn = group.members.length + (group.hiddenMembers > 0 ? 1 : 0);
    out.push({ group, from: cursor, to: cursor + drawn - 1 });
    cursor += drawn;
  }
  return out;
}

export function boxFor(from: number, to: number): { top: number; height: number } {
  return {
    top: rowCentre(from) - DG.row / 2 + 4,
    height: rowCentre(to) - rowCentre(from) + DG.row - 8,
  };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
