import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
const serve = process.argv.includes('--serve');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const options = {
  entryPoints: [resolve(root, 'src/ui/main.tsx')],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  outfile: resolve(out, 'app.js'),
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: true,
  logLevel: 'info',
  loader: { '.css': 'css' },
};

function copyStatic() {
  copyFileSync(resolve(root, 'src/ui/index.html'), resolve(out, 'index.html'));
  copyFileSync(resolve(root, 'src/ui/styles.css'), resolve(out, 'styles.css'));

  // The Cumulocity application manifest, with the version taken from
  // package.json so there is one place to bump. It has to land in the root of
  // the upload next to index.html, which is what dist/ becomes.
  const manifest = JSON.parse(readFileSync(resolve(root, 'cumulocity.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(resolve(out, 'cumulocity.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Public Sans, self-hosted: styles.css asks for fonts/ next to itself, and a
  // tenant deployment cannot count on reaching a font CDN.
  const fonts = resolve(root, 'src/ui/fonts');
  mkdirSync(resolve(out, 'fonts'), { recursive: true });
  for (const name of readdirSync(fonts)) {
    copyFileSync(resolve(fonts, name), resolve(out, 'fonts', name));
  }
}

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyStatic();
  const { host, port } = await ctx.serve({ servedir: out, host: '127.0.0.1', port: 5173 });
  console.log(`\n  Message calculator: http://${host}:${port}\n`);
} else {
  await esbuild.build(options);
  copyStatic();
  console.log('  built -> dist/');
}
