/**
 * The customer's own configuration, drawn the way the explainer draws its
 * worked example: readings on the left, envelopes on the right.
 *
 * The visual grammar is doing the review. A wide accent envelope holding four
 * readings is obviously earning its keep; a thin outlined one holding a single
 * reading is obviously paying full price for it. Nobody has to read a table to
 * see which is which.
 */

import type { MeasurementView, ViewGroup } from '../../lib/engine/index.js';
import { compact, n } from './format.js';

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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function MeasurementDiagram({ view }: { view: MeasurementView }) {
  if (view.groups.length === 0) return null;

  const spans = rowSpans(view);
  const height = canvasHeight(view.rowCount);
  const saving = view.naiveMessagesPerMonth - view.messagesPerMonth;

  return (
    <div class="diagram">
      <svg
        viewBox={`0 0 ${DG.width} ${height}`}
        role="img"
        aria-label={`${view.groups.length} measurements carrying ${n(view.storedPerMonth)} readings a month in ${n(view.messagesPerMonth)} messages, per machine.`}
      >
        <text x={DG.labelX} y={13} class="dg-cap">
          EVERY READING
        </text>
        <text x={DG.boxX} y={13} class="dg-cap">
          TRAVELS IN
        </text>

        {spans.map(({ group, from }) =>
          group.members.map((m, k) => (
            <g key={m.metricId}>
              <rect
                x={DG.labelX}
                y={rowCentre(from + k) - 13}
                width={DG.labelW}
                height={26}
                rx={13}
                class="dg-sensor"
              />
              <circle cx={DG.labelX + 15} cy={rowCentre(from + k)} r={4} class="dg-dot" />
              <text x={DG.labelX + 27} y={rowCentre(from + k) + 4} class="dg-label">
                {truncate(m.name || 'unnamed', 22)}
                {m.unit && <tspan class="dg-unit"> {truncate(m.unit, 8)}</tspan>}
              </text>
            </g>
          )),
        )}

        {/* Whatever the row budget could not draw, said out loud. */}
        {spans.map(({ group, to }) =>
          group.hiddenMembers > 0 ? (
            <text
              key={`more-${group.id}`}
              x={DG.labelX + 27}
              y={rowCentre(to) + 4}
              class="dg-more"
            >
              + {group.hiddenMembers} more reading{group.hiddenMembers === 1 ? '' : 's'}
            </text>
          ) : null,
        )}

        {spans.map(({ group, from, to }) => {
          const { top, height: h } = boxFor(from, to);
          const drawn = to - from + 1;

          return (
            <g key={group.id}>
              {Array.from({ length: drawn }, (_, k) => {
                const y0 = rowCentre(from + k);
                const y1 = top + ((k + 0.5) * h) / drawn;
                return (
                  <path
                    key={k}
                    d={`M ${DG.labelX + DG.labelW} ${y0} C ${DG.labelX + DG.labelW + 60} ${y0}, ${DG.boxX - 60} ${y1}, ${DG.boxX} ${y1}`}
                    class="dg-wire"
                  />
                );
              })}

              <rect
                x={DG.boxX}
                y={top}
                width={DG.boxW}
                height={h}
                rx={9}
                class={group.shared ? 'dg-msg' : 'dg-msg-solo'}
              />

              {h < DG.stackMinHeight ? (
                <>
                  <text x={DG.boxX + 16} y={top + h / 2 + 4} class="dg-frag">
                    {truncate(group.fragmentName, 26)}
                  </text>
                  <text x={DG.boxX + DG.boxW - 12} y={top + h / 2 + 4} class="dg-rate" text-anchor="end">
                    {group.cadence} &middot; {compact(group.messagesPerMonth)} msg
                  </text>
                </>
              ) : (
                <>
                  <text x={DG.boxX + 16} y={top + 22} class="dg-frag">
                    {truncate(group.fragmentName, 26)}
                  </text>
                  <text x={DG.boxX + 16} y={top + 39} class="dg-rate">
                    {group.cadence} &middot; one timestamp &middot; {group.seriesCount} readings
                  </text>
                  <text x={DG.boxX + DG.boxW - 12} y={top + 26} class="dg-count" text-anchor="end">
                    {compact(group.messagesPerMonth)}
                  </text>
                  <text x={DG.boxX + DG.boxW - 12} y={top + 40} class="dg-rate" text-anchor="end">
                    msg / month
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div class="dg-legend">
        <span>
          <i class="key shared" /> shared &mdash; readings on the same tick, one message
        </span>
        <span>
          <i class="key solo" /> alone &mdash; one message all to itself
        </span>
        <span class="spacer" />
        <b>{compact(view.messagesPerMonth)}</b> messages per machine per month, carrying{' '}
        <b>{compact(view.storedPerMonth)}</b> readings
        {saving > 1 && (
          <>
            {' '}
            &mdash; <b class="saves">{compact(saving)} fewer</b> than one measurement per reading
          </>
        )}
      </div>
    </div>
  );
}
