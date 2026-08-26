/**
 * Packages dist/ into the zip Cumulocity's "Upload web application" accepts.
 *
 * The platform's only structural requirement is that index.html and
 * cumulocity.json sit in the ZIP's root -- not inside a folder. So the zip is
 * built from the contents of dist/, with no wrapping directory.
 *
 * The zip writer is lib/xlsx/zip.ts, the same one the Excel export uses. It
 * stores rather than deflates, so the archive is roughly the size of dist/
 * itself; for a 300 KB upload that is a fair trade for having one zip
 * implementation in the repo instead of two that can drift apart.
 *
 * The source map is left out on purpose: it is 500 KB, it is the largest thing
 * in the build, and nothing in a tenant reads it.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'dist-package');

/** Everything under dir, as zip-root-relative paths. */
function walk(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

// lib/ is TypeScript, and this script is plain ESM, so the zip writer is bundled
// on the fly rather than duplicated here.
const zipModule = resolve(out, '.zip.mjs');
mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [resolve(root, 'lib/xlsx/zip.ts')],
  outfile: zipModule,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
const { makeZip } = await import(zipModule);

const manifest = JSON.parse(readFileSync(resolve(dist, 'cumulocity.json'), 'utf8'));
const files = walk(dist)
  .filter((file) => !file.endsWith('.map'))
  .sort();

const entries = files.map((file) => ({
  path: relative(dist, file).split(/[\\/]/).join('/'),
  data: new Uint8Array(readFileSync(file)),
}));

for (const required of ['index.html', 'cumulocity.json']) {
  if (!entries.some((e) => e.path === required)) {
    throw new Error(`${required} must be in the zip root -- run "npm run build" first`);
  }
}

const zip = makeZip(entries);
const name = `${manifest.contextPath}-${manifest.version}.zip`;
writeFileSync(resolve(out, name), zip);
rmSync(zipModule, { force: true });

const kb = (n) => `${Math.round(n / 1024)} kB`;
console.log(`\n  ${manifest.name}  ${manifest.version}  ->  dist-package/${name}  (${kb(zip.length)})`);
for (const entry of entries) console.log(`    ${entry.path.padEnd(40)} ${kb(entry.data.length)}`);
console.log(
  `\n  Upload: Administration -> Ecosystem -> Applications -> Add application -> Upload web application`,
);
console.log(`  Then open /apps/${manifest.contextPath}/\n`);
