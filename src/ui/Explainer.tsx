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

const SERIES = [
  { name: 'Supply air temp', short: '21.4 °C' },
  { name: 'Humidity', short: '63 %' },
  { name: 'CO₂', short: '812 ppm' },
  { name: 'Pressure', short: '1013 hPa' },
];

const MACHINES = 1000;
const INTERVAL = 60;
const DAYS = 31;
const SENDS = (MACHINES * DAYS * 86_400) / INTERVAL;

/**
 * SVG geometry, in three columns: sensors, envelopes, tally. Exported so the
 * layout tests use these numbers rather than a copy of them -- a test that
 * mirrors the constants cannot catch them drifting.
 */
export const LAYOUT = {
  row: 48,
  top: 18,
  width: 648,
  /** Column 1: the readings on the machine. */
  sensorX: 8,
  sensorW: 148,
  /** Column 2: what gets sent. */
  boxX: 300,
  boxW: 250,
  /** Column 3: the running count. Left-anchored, so its right edge is known. */
  tallyX: 578,
  tallyW: 62,
  /** Below this height a box cannot stack title, subtitle and dots. */
  stackMinHeight: 62,
} as const;

export const CANVAS_HEIGHT = LAYOUT.top * 2 + SERIES.length * LAYOUT.row;

const { row: ROW, top: TOP, width: WIDTH, sensorX: SENSOR_X, sensorW: SENSOR_W } = LAYOUT;
const { boxX: BOX_X, boxW: BOX_W, tallyX: TALLY_X, stackMinHeight: STACK_MIN_HEIGHT } = LAYOUT;
const HEIGHT = CANVAS_HEIGHT;

export const rowCentre = (i: number) => TOP + i * ROW + ROW / 2;

/** Where the envelope for a group of readings sits. */
export function boxFor(members: readonly number[]): { top: number; height: number } {
  const first = members[0]!;
  const last = members[members.length - 1]!;
  return {
    top: rowCentre(first) - ROW / 2 + 5,
    height: rowCentre(last) - rowCentre(first) + ROW - 10,
  };
}

export function Explainer() {
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
      <summary>How volume actually works &mdash; 90 seconds</summary>
      <div class="body">
        <p class="note">
          A measurement carries <b>one timestamp</b> and any number of readings underneath it. One
          request is <b>one message</b> however many readings it carries. So the question is never
          &ldquo;how much data&rdquo; &mdash; it is{' '}
          <b>how many requests the same data is spread across</b>.
        </p>

        <div class="row" style="margin-bottom:6px;align-items:center">
          <label class="field" style="max-width:320px">
            <span>Readings per measurement &mdash; drag right to bundle</span>
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
            <span>Messages / month</span>
            <b style="color:var(--accent)">{compact(messages)}</b>
            <small>
              {n(MACHINES)} machines, every {INTERVAL} s, {DAYS}-day month
            </small>
          </div>
          <div class="stat" style="min-width:200px">
            <span>Readings stored</span>
            <b>{compact(storedValues)}</b>
            <small>the same at every setting &mdash; the information never changes</small>
          </div>
        </div>

        <Diagram groups={groups} />

        <div class="grid two" style="margin-top:6px">
          <div>
            <h4>What the picture says</h4>
            <p class="hint">
              The dots never change. Drag the slider and the same four readings, on the same tick,
              arrive at the same platform &mdash; but the number of envelopes goes from one to four,
              and <b>you are billed per envelope</b>.
            </p>
            <p class="hint">
              This is not compression and it is not batching. Putting ten measurements in one request
              is still ten messages: <b>batch for the network, bundle for the count.</b>
            </p>
          </div>
          <div>
            <h4>The one rule that comes with it</h4>
            <p class="hint">
              <b>Send the same readings every time.</b> An envelope whose contents change from one
              send to the next is what degrades write and query performance later.
            </p>
            <p class="hint">
              Which is why a flag that changes twice an hour does not belong in a bundle sampled
              every minute &mdash; it would force the envelope to change shape. It gets its own,
              sent when it actually changes.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

function Diagram({ groups }: { groups: number[][] }) {
  return (
    <div class="diagram">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel(groups)}>
        <text x={SENSOR_X} y={12} class="dg-cap">
          ON THE MACHINE
        </text>
        <text x={BOX_X} y={12} class="dg-cap">
          SENT TO CUMULOCITY
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
                    1 message
                  </text>
                  <circle cx={BOX_X + 108} cy={top + height / 2} r={4.5} class="dg-dot" />
                  <text x={BOX_X + 120} y={top + height / 2 + 4} class="dg-msg-sub">
                    1 reading &middot; 09:30:00
                  </text>
                </>
              ) : (
                <>
                  <text x={BOX_X + 18} y={top + 24} class="dg-msg-title">
                    1 message
                  </text>
                  <text x={BOX_X + 18} y={top + 41} class="dg-msg-sub">
                    one timestamp &middot; 09:30:00
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
                    {members.length} readings
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
          message{groups.length === 1 ? '' : 's'}
        </text>
        <text x={TALLY_X} y={TOP + 54} class="dg-msg-sub">
          per tick
        </text>
      </svg>
    </div>
  );
}

function ariaLabel(groups: number[][]): string {
  return `Four sensor readings on the same tick, travelling in ${groups.length} ${
    groups.length === 1 ? 'measurement' : 'measurements'
  }, costing ${groups.length} ${groups.length === 1 ? 'message' : 'messages'}.`;
}
