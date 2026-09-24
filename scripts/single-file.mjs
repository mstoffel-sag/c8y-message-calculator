/**
 * Packages dist/ into one .html file that runs from a double-click.
 *
 * The other two outputs both assume a server: dist/ is six files that fetch
 * each other, and dist-package/*.zip is for a Cumulocity tenant. Neither helps
 * the person who wants the calculator on a laptop with no tenant, no Node and
 * no IT ticket -- so everything the page needs goes inside the page. The CSS
 * becomes a <style>, the fonts become data: URIs inside it, and the bundle
 * becomes an inline module.
 *
 * It stays an ES module because the bundle is built as one and an inline
 * <script type="module"> is allowed on file:// -- only *fetched* modules are
 * blocked there, which is exactly the rule this file exists to get around.
 *
 * What a file:// page cannot do, and the app already handles: `navigator
 * .clipboard` does not exist off a secure origin, so `src/ui/format.ts` falls
 * back to `document.execCommand`. What is untested: whether the saved-scenario
 * library survives, since browsers disagree about the storage a file:// page
 * may keep. A refusal costs the session's memory and nothing else -- every
 * read and write in `src/ui/store.ts` is wrapped -- but nobody has checked
 * which browsers refuse.
 *
 * The source map is dropped: 500 kB of nothing this reader will open.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'dist-package');

const read = (name) => {
  try {
    return readFileSync(resolve(dist, name), 'utf8');
  } catch {
    throw new Error(`dist/${name} is missing -- run "npm run build" first`);
  }
};

// The fonts first, because they are referenced from inside the stylesheet.
const css = read('styles.css').replace(/url\(['"]?(fonts\/[^)'"]+)['"]?\)/g, (_, path) => {
  const data = readFileSync(resolve(dist, path)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});

// `</script` anywhere in the bundle -- in a string, in a comment -- ends the
// script element early and drops the rest of the app into the document as
// text. The escape is invisible to the JS parser.
const js = read('app.js').replace(/<\/script/gi, '<\\/script');

const html = read('index.html')
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', `<script type="module">\n${js}\n</script>`);

for (const [what, marker] of [['stylesheet', '<style>'], ['bundle', '<script type="module">\n']]) {
  if (!html.includes(marker)) {
    throw new Error(`the ${what} was not inlined -- src/ui/index.html no longer matches this script`);
  }
}
if (html.includes('href="styles.css"') || html.includes('src="app.js"')) {
  throw new Error('a reference to a separate file survived -- the page would not run from file://');
}

const manifest = JSON.parse(read('cumulocity.json'));
const name = `${manifest.contextPath}-${manifest.version}.html`;
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, name), html);

console.log(
  `\n  ${manifest.name}  ${manifest.version}  ->  dist-package/${name}  (${Math.round(html.length / 1024)} kB)`,
);
console.log('  One file, no server: open it in a browser, or send it to someone who has one.\n');
