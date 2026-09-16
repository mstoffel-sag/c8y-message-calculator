/**
 * The lesson the tool exists to teach. CONCEPT.md section 4.
 *
 * Drawn rather than written. The point -- that the same readings cost four
 * times as many messages when they travel separately -- is a shape, not a
 * sentence: four sensors feeding one envelope versus four. A JSON payload can
 * only make that point to somebody who already reads JSON, which is not the
 * person this screen is for.
 *
 * Interactive on purpose: the message count drops in front of the customer,
 * before they have entered anything.
 */

import { useState } from 'preact/hooks';
import { compact, n } from './format.js';
import { Prose, Rich, useT } from './i18n.js';
import type { T } from '../../lib/i18n/index.js';

import {
  CANVAS_HEIGHT,
  DAYS,
  INTERVAL,
  LAYOUT,
  MACHINES,
  SENDS,
  SERIES,
  boxFor,
  rowCentre,
} from '../../lib/diagram/explainer-layout.js';

export { CANVAS_HEIGHT, LAYOUT, boxFor, rowCentre };

const { row: ROW, top: TOP, width: WIDTH, sensorX: SENSOR_X, sensorW: SENSOR_W } = LAYOUT;
const { boxX: BOX_X, boxW: BOX_W, tallyX: TALLY_X, stackMinHeight: STACK_MIN_HEIGHT } = LAYOUT;
const HEIGHT = CANVAS_HEIGHT;

export function Explainer() {
  const t = useT();
  // Starts at one reading per measurement -- the way it gets built when nobody
  // thinks about it. Dragging right makes the number fall, which is the demo.
  const [perMessage, setPerMessage] = useState(1);

  const groups: number[][] = [];
  for (let i = 0; i < SERIES.length; i += perMessage) {
    groups.push(SERIES.map((_, j) => j).slice(i, i + perMessage));
  }

  const messages = SENDS * groups.length;
  const storedValues = SENDS * SERIES.length;

  return (
    <details class="panel explain" open>
      <summary>{t('explain.summary')}</summary>
      <div class="body">
        <p class="note">
          <Rich k="explain.note" />
        </p>

        <div class="row" style="margin-bottom:6px;align-items:center">
          <label class="field" style="max-width:320px">
            <span>{t('explain.slider')}</span>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={perMessage}
              onInput={(e) => setPerMessage(Number((e.target as HTMLInputElement).value))}
            />
          </label>
          <div class="spacer" />
          <div class="stat" style="min-width:200px">
            <span>{t('explain.messages')}</span>
            <b style="color:var(--accent)">{compact(messages)}</b>
            <small>
              {t('explain.messages.sub', {
                machines: n(MACHINES),
                interval: INTERVAL,
                days: DAYS,
              })}
            </small>
          </div>
          <div class="stat" style="min-width:200px">
            <span>{t('explain.stored')}</span>
            <b>{compact(storedValues)}</b>
            <small>{t('explain.stored.sub')}</small>
          </div>
        </div>

        <Diagram groups={groups} t={t} />

        <div class="grid two" style="margin-top:6px">
          <div>
            <h4>{t('explain.picture.heading')}</h4>
            <div class="hint">
              <Prose k="explain.picture.body" />
            </div>
          </div>
          <div>
            <h4>{t('explain.rule.heading')}</h4>
            <div class="hint">
              <Prose k="explain.rule.body" />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function Diagram({ groups, t }: { groups: number[][]; t: T }) {
  return (
    <div class="diagram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t.plural('explain.alt', groups.length)}>
        <text x={SENSOR_X} y={12} class="dg-cap">
          {t('explain.onTheMachine')}
        </text>
        <text x={BOX_X} y={12} class="dg-cap">
          {t('explain.sentTo')}
        </text>

        {/* One pill per sensor reading. */}
        {SERIES.map((series, i) => (
          <g key={series.name}>
            <rect
              x={SENSOR_X}
              y={rowCentre(i) - 15}
              width={SENSOR_W}
              height={30}
              rx={15}
              class="dg-sensor"
            />
            <circle cx={SENSOR_X + 16} cy={rowCentre(i)} r={4.5} class="dg-dot" />
            <text x={SENSOR_X + 28} y={rowCentre(i) + 4} class="dg-label">
              {series.short}
            </text>
          </g>
        ))}

        {groups.map((members, gi) => {
          const { top, height } = boxFor(members);

          return (
            <g key={`g${gi}-${members.length}`}>
              {/* Connectors, spread down the envelope's edge so none overlap. */}
              {members.map((m, k) => {
                const from = rowCentre(m);
                const to = top + ((k + 0.5) * height) / members.length;
                return (
                  <path
                    key={m}
                    d={`M ${SENSOR_X + SENSOR_W} ${from} C ${SENSOR_X + SENSOR_W + 70} ${from}, ${BOX_X - 70} ${to}, ${BOX_X} ${to}`}
                    class="dg-wire"
                  />
                );
              })}

              <rect x={BOX_X} y={top} width={BOX_W} height={height} rx={9} class="dg-msg" />

              {/* A one-reading envelope is only 38 px tall, so the stacked
                  layout does not fit: everything goes on one line instead. */}
              {height < STACK_MIN_HEIGHT ? (
                <>
                  <text x={BOX_X + 18} y={top + height / 2 + 4} class="dg-msg-title">
                    {t('explain.oneMessage')}
                  </text>
                  <circle cx={BOX_X + 108} cy={top + height / 2} r={4.5} class="dg-dot" />
                  <text x={BOX_X + 120} y={top + height / 2 + 4} class="dg-msg-sub">
                    {t('explain.oneReadingAt', { time: '09:30:00' })}
                  </text>
                </>
              ) : (
                <>
                  <text x={BOX_X + 18} y={top + 24} class="dg-msg-title">
                    {t('explain.oneMessage')}
                  </text>
                  <text x={BOX_X + 18} y={top + 41} class="dg-msg-sub">
                    {t('explain.oneTimestampAt', { time: '09:30:00' })}
                  </text>
                  {/* The readings inside, as dots: the payload without the syntax. */}
                  {members.map((m, k) => (
                    <circle
                      key={`d${m}`}
                      cx={BOX_X + 22 + k * 17}
                      cy={top + height - 18}
                      r={4.5}
                      class="dg-dot"
                    />
                  ))}
                  <text
                    x={BOX_X + 22 + members.length * 17 + 6}
                    y={top + height - 14}
                    class="dg-msg-sub"
                  >
                    {t.plural('explain.readings', members.length)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* The running tally, in its own column so it can never crowd the
            envelopes. Left-anchored: a right-anchored label grows leftwards
            into them as the word turns plural. */}
        <text x={TALLY_X} y={TOP + 24} class="dg-total">
          {groups.length}
        </text>
        <text x={TALLY_X} y={TOP + 40} class="dg-msg-sub">
          {t.plural('explain.tally', groups.length)}
        </text>
        <text x={TALLY_X} y={TOP + 54} class="dg-msg-sub">
          {t('explain.perTick')}
        </text>
      </svg>
    </div>
  );
}

