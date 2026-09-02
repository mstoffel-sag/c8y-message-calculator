/**
 * The little markup the catalogue is allowed to carry.
 *
 * Externalising the prose meant taking `<b>`, `<em>` and `<code>` out of the
 * components, and something had to replace them: half this tool's teaching is in
 * the emphasis. Markup that a translator can retype without knowing JSX is the
 * only kind that survives translation, so the catalogue uses four marks --
 * `**bold**`, `*emphasis*`, `` `code` `` and a blank line for a paragraph -- and
 * this module turns them into tokens. Rendering them is the UI's job; parsing
 * them is not, which is why it lives here where a port can reuse it.
 *
 * Deliberately not Markdown. Links, lists and headings in a UI string are a sign
 * the string should have been a component, and a parser that accepts them
 * invites exactly that.
 */

export type RichToken =
  | { kind: 'text'; text: string }
  | { kind: 'b'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string };

/** A paragraph is a list of tokens; a string is a list of paragraphs. */
export type RichParagraph = RichToken[];

const MARKS: Array<{ open: string; kind: RichToken['kind'] }> = [
  { open: '**', kind: 'b' },
  { open: '`', kind: 'code' },
  { open: '*', kind: 'em' },
];

/**
 * One paragraph's tokens, in order.
 *
 * An unclosed mark is left as literal text rather than swallowing the rest of
 * the sentence: a translator's stray asterisk should look like a stray asterisk,
 * not blank the paragraph.
 */
export function parseRich(text: string): RichParagraph {
  const tokens: RichParagraph = [];
  let plain = '';
  let i = 0;

  const flush = () => {
    if (plain) tokens.push({ kind: 'text', text: plain });
    plain = '';
  };

  outer: while (i < text.length) {
    for (const { open, kind } of MARKS) {
      if (!text.startsWith(open, i)) continue;
      const close = text.indexOf(open, i + open.length);
      if (close === -1) continue;
      const inner = text.slice(i + open.length, close);
      if (inner.length === 0) continue;
      flush();
      tokens.push({ kind, text: inner });
      i = close + open.length;
      continue outer;
    }
    plain += text[i];
    i += 1;
  }

  flush();
  return tokens;
}

/** Blank-line separated paragraphs, each parsed. */
export function parseRichProse(text: string): RichParagraph[] {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s*\n\s*/g, ' ').trim())
    .filter((para) => para.length > 0)
    .map(parseRich);
}

/** The same text with every mark removed -- for a title attribute or a copy. */
export function plainText(text: string): string {
  return parseRichProse(text)
    .map((para) => para.map((token) => token.text).join(''))
    .join('\n\n');
}
