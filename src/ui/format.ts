/**
 * The formatters, plus the one thing they cannot contain.
 *
 * Every number, duration and month name comes from `lib/format`, shared with
 * the Web SDK app. Copying to the clipboard stays here: it needs a DOM, and the
 * fallback below is specific to how this build is opened.
 */

export * from '../../lib/format/index.js';

/**
 * Copies, and says whether it managed to.
 *
 * Every copy in this app goes through here, because the interesting part is not
 * the copying -- it is the two seconds afterwards. A button that changes nothing
 * when clicked reads as broken whether it worked or not.
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
