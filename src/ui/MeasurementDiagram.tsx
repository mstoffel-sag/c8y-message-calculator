/**
 * The customer's own configuration, drawn the way the explainer draws its
 * worked example: readings on the left, envelopes on the right.
 *
 * The visual grammar is doing the review. A wide accent envelope holding four
 * readings is obviously earning its keep; a thin outlined one holding a single
 * reading is obviously paying full price for it. Nobody has to read a table to
 * see which is which.
 */

import type { MeasurementView } from '../../lib/engine/index.js';
import {
  DG,
  boxFor,
  canvasHeight,
  rowCentre,
  rowSpans,
  truncate,
} from '../../lib/diagram/measurement-layout.js';
import { compact, duration, n } from './format.js';
import { Rich, useT } from './i18n.js';
import type { T } from '../../lib/i18n/index.js';

export {
  DG,
  boxFor,
  canvasHeight,
  rowCentre,
  rowSpans,
  truncate,
} from '../../lib/diagram/measurement-layout.js';

/** "every 15 min", or the on-change phrase where there is no interval. */
function cadenceOf(t: T, seconds: number | undefined): string {
  return seconds === undefined
    ? t('diagram.onChange')
    : t('format.interval', { duration: duration(seconds) });
}

export function MeasurementDiagram({ view }: { view: MeasurementView }) {
  const t = useT();
  if (view.groups.length === 0) return null;

  const spans = rowSpans(view);
  const height = canvasHeight(view.rowCount);
  const saving = view.naiveMessagesPerMonth - view.messagesPerMonth;

  return (
    <div class="diagram">
      <svg
        viewBox={`0 0 ${DG.width} ${height}`}
        role="img"
        aria-label={t('diagram.alt', {
          measurements: view.groups.length,
          readings: n(view.storedPerMonth),
          messages: n(view.messagesPerMonth),
        })}
      >
        <text x={DG.labelX} y={13} class="dg-cap">
          {t('diagram.everyReading')}
        </text>
        <text x={DG.boxX} y={13} class="dg-cap">
          {t('diagram.travelsIn')}
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
                {truncate(m.name || t('diagram.unnamed'), 22)}
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
              {t.plural('diagram.more', group.hiddenMembers)}
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
                    {t('diagram.compact', {
                      cadence: cadenceOf(t, group.intervalSeconds),
                      messages: compact(group.messagesPerMonth),
                    })}
                  </text>
                </>
              ) : (
                <>
                  <text x={DG.boxX + 16} y={top + 22} class="dg-frag">
                    {truncate(group.fragmentName, 26)}
                  </text>
                  <text x={DG.boxX + 16} y={top + 39} class="dg-rate">
                    {t.plural('diagram.oneTimestamp', group.seriesCount, {
                      cadence: cadenceOf(t, group.intervalSeconds),
                    })}
                  </text>
                  <text x={DG.boxX + DG.boxW - 12} y={top + 26} class="dg-count" text-anchor="end">
                    {compact(group.messagesPerMonth)}
                  </text>
                  <text x={DG.boxX + DG.boxW - 12} y={top + 40} class="dg-rate" text-anchor="end">
                    {t('diagram.msgPerMonth')}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div class="dg-legend">
        <span>
          <i class="key shared" /> {t('diagram.legend.shared')}
        </span>
        <span>
          <i class="key solo" /> {t('diagram.legend.alone')}
        </span>
        <span class="spacer" />
        <Rich
          k="diagram.legend.total"
          p={{
            messages: compact(view.messagesPerMonth),
            readings: compact(view.storedPerMonth),
          }}
        />
        {saving > 1 && (
          <>
            {' '}
            <span class="saves">
              <Rich k="diagram.legend.saving" p={{ count: compact(saving) }} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
