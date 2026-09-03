import { splitDuration, type DurationUnit } from '../../lib/engine/duration.js';
import {
  DEFAULT_LOCALE,
  LOCALES,
  translate,
  translatePlural,
  type Locale,
} from '../../lib/i18n/index.js';

/**
 * Numbers follow the locale, and the locale is module state.
 *
 * 1,000.5 and 1.000,5 are the same number and different strings, so a German
 * session cannot keep English formatters. Threading a locale through `n()`,
 * `compact()` and the fifty call sites that use them would put a parameter on
 * every figure in the app to say something that is true of the whole session, so
 * the app sets it once (see `useLocale`) and the formatters are rebuilt. The
 * cost is a module global; the alternative was a worse API everywhere.
 */
let locale: Locale = DEFAULT_LOCALE;
let formats = makeFormats(DEFAULT_LOCALE);

function makeFormats(next: Locale) {
  const tag = LOCALES.find((l) => l.code === next)?.numbers ?? 'en-GB';
  return {
    whole: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
    tenth: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }),
    hundredth: new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }),
  };
}

export function setFormatLocale(next: Locale): void {
  locale = next;
  formats = makeFormats(next);
}

export function formatLocale(): Locale {
  return locale;
}

// Kept as objects with `.format` so every existing call site reads the same and
// picks up a locale change without being touched.
export const nf = { format: (value: number): string => formats.whole.format(value) };
export const nf1 = { format: (value: number): string => formats.tenth.format(value) };

export function n(value: number): string {
  return nf.format(Math.round(value));
}

/** Short form for headline figures: 45,977,000 -> "46.0 M". */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${nf1.format(value / 1e9)} ${translate(locale, 'format.billion')}`;
  if (abs >= 1e6) return `${nf1.format(value / 1e6)} ${translate(locale, 'format.million')}`;
  if (abs >= 10e3) return `${nf1.format(value / 1e3)} ${translate(locale, 'format.thousand')}`;
  return nf.format(value);
}

/**
 * GiB, at a precision the underlying number can support. A storage figure that
 * rests on "100-400 bytes, to be verified" has no business showing decimals
 * once it is past a few GiB.
 */
export function gib(value: number): string {
  // Every branch goes through Intl: a summed figure crosses into four digits
  // easily, and 2130 beside a grouped 2,130 elsewhere on the same panel reads
  // as two different numbers. `toFixed` was also giving German a decimal point.
  if (value === 0) return '0 GiB';
  if (value < 1) return `${formats.hundredth.format(value)} GiB`;
  if (value < 100) return `${nf1.format(value)} GiB`;
  if (value < 10_240) return `${nf.format(Math.round(value))} GiB`;
  return `${nf1.format(value / 1024)} TiB`;
}

/**
 * "16.2 – 64.8 GiB": the unit once, so a range fits on one line.
 *
 * Unless the two ends land in different units, where dropping the first one
 * would read as "6,000 TiB to 23.4 TiB" -- so both are spelled out.
 */
/**
 * The same figure, as the quantity storage is actually billed in.
 *
 * Storage is captured at the end of each month and the captures are added up,
 * so a period's quantity is GiB-months and not GiB -- and a reader who is not
 * told that will divide by twelve to see whether it looks right. The unit is a
 * catalogue string because German makes it "GiB-Monate".
 */
export function gibMonths(value: number): string {
  return translate(locale, 'format.gibMonths', { amount: gib(value) });
}

export function gibRange(low: number, high: number): string {
  const [a, b] = [gib(low), gib(high)];
  const unitOf = (s: string) => s.replace(/^[\d.,\s]+/, '');
  if (unitOf(a) !== unitOf(b)) return `${a} – ${b}`;
  return `${a.replace(/\s*[A-Za-z]+$/, '')} – ${b}`;
}

/**
 * "March 2027", in the session's language.
 *
 * `lib/engine/calendar.ts` has its own English month names and keeps them: they
 * go into the workbook, which mirrors an English Configurator. On screen the
 * browser's own month names are better than a list this repo maintains.
 */
export function monthLabel(month: number): string {
  const tag = LOCALES.find((l) => l.code === locale)?.numbers ?? 'en-GB';
  // Any non-leap year does; only the month is read out.
  return new Intl.DateTimeFormat(tag, { month: 'long' }).format(new Date(2027, month - 1, 1));
}

export function monthYear(year: number, month: number): string {
  return `${monthLabel(month)} ${year}`;
}

export function signed(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${compact(Math.abs(value))}`;
}

export function pct(value: number): string {
  return `${nf.format(value * 100)} %`;
}

/**
 * "every 1 min" / "alle 15 min" / "every 100 ms".
 *
 * Shares splitDuration with the sampling control, so a bundle chip and the
 * dropdown that set it never disagree about what 60 seconds is called. The unit
 * comes from the catalogue rather than from `formatDuration`, which stays
 * English for the workbook.
 */
export function duration(seconds: number): string {
  const split = splitDuration(seconds);
  return `${split.value} ${unitLabel(split.unit, split.value)}`;
}

export function interval(seconds: number): string {
  return translate(locale, 'format.interval', { duration: duration(seconds) });
}

/** A duration or rate unit, singular or plural, in the session's language. */
export function unitLabel(unit: DurationUnit | 'month' | 'year', count: number): string {
  return translatePlural(locale, `unit.${unit}`, count);
}

/**
 * Copies, and says whether it managed to.
 *
 * `navigator.clipboard` exists only in a secure context. Open this build the
 * obvious way -- double-click `dist/index.html`, so `file://` -- and the whole
 * API is *undefined*, not merely permission-gated. The first version of this
 * function awaited `navigator.clipboard.writeText` inside a try/catch that
 * swallowed everything, so every copy button in the app silently did nothing and
 * looked unwired. Hence the fallback, and hence the boolean: a button that
 * cannot report success is indistinguishable from a button with no handler.
 */
export async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // A rejected write is not a reason to give up -- fall through and try the
    // older path, which is what actually works off a file:// origin.
  }
  return legacyCopy(text);
}

/**
 * document.execCommand('copy') is deprecated and still the only thing that works
 * without a secure context. It needs a real, selectable, on-page element, so one
 * is made, used and removed inside the click that asked for it.
 */
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Off-screen rather than hidden: display:none cannot hold a selection.
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
