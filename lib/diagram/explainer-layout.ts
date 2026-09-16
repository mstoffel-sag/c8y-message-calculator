/**
 * The explainer's worked example, and the geometry that draws it.
 *
 * The numbers and the arithmetic are here rather than in a component because
 * two apps draw this picture and a test measures it. A layout constant that
 * exists in three places is a layout constant that will disagree with itself;
 * the test asserting that a connector lands inside its envelope has to read the
 * same value the renderer used, or it is asserting nothing.
 *
 * What is *not* here is the drawing. See CONCEPT.md section 8: there is no SDK
 * equivalent for these diagrams and nor should there be, so each app renders
 * the same geometry in its own way.
 */

export const SERIES = [
  { name: 'Supply air temp', short: '21.4 °C' },
  { name: 'Humidity', short: '63 %' },
  { name: 'CO₂', short: '812 ppm' },
  { name: 'Pressure', short: '1013 hPa' },
];

export const MACHINES = 1000;
export const INTERVAL = 60;
export const DAYS = 31;
export const SENDS = (MACHINES * DAYS * 86_400) / INTERVAL;

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
