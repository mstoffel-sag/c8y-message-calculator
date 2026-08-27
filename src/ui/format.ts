import { formatDuration } from '../../lib/engine/duration.js';

export const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export function n(value: number): string {
  return nf.format(Math.round(value));
}

/** Short form for headline figures: 45,977,000 -> "46.0 M". */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${nf1.format(value / 1e9)} bn`;
  if (abs >= 1e6) return `${nf1.format(value / 1e6)} M`;
  if (abs >= 10e3) return `${nf1.format(value / 1e3)} k`;
  return nf.format(value);
}

/**
 * GiB, at a precision the underlying number can support. A storage figure that
 * rests on "100-400 bytes, to be verified" has no business showing decimals
 * once it is past a few GiB.
 */
export function gib(value: number): string {
  if (value === 0) return '0 GiB';
  if (value < 1) return `${value.toFixed(2)} GiB`;
  if (value < 100) return `${nf1.format(value)} GiB`;
  if (value < 10_240) return `${Math.round(value)} GiB`;
  return `${nf1.format(value / 1024)} TiB`;
}

/**
 * "16.2 – 64.8 GiB": the unit once, so a range fits on one line.
 *
 * Unless the two ends land in different units, where dropping the first one
 * would read as "6,000 TiB to 23.4 TiB" -- so both are spelled out.
 */
export function gibRange(low: number, high: number): string {
  const [a, b] = [gib(low), gib(high)];
  const unitOf = (s: string) => s.replace(/^[\d.,\s]+/, '');
  if (unitOf(a) !== unitOf(b)) return `${a} – ${b}`;
  return `${a.replace(/\s*[A-Za-z]+$/, '')} – ${b}`;
}

export function signed(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${compact(Math.abs(value))}`;
}

export function pct(value: number): string {
  return `${nf.format(value * 100)} %`;
}

/**
 * "every 1 min" / "every 15 min" / "every 100 ms".
 *
 * Shares splitDuration with the sampling control, so a bundle chip and the
 * dropdown that set it never disagree about what 60 seconds is called.
 */
export function interval(seconds: number): string {
  return `every ${formatDuration(seconds)}`;
}

export async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard is gated in some contexts; a failed copy is not worth an alert.
  }
}
