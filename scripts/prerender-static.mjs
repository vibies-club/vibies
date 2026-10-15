import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Only the public, signed-out home is rendered at build time. Private data is
// fetched after authentication; the reusable application shell stays empty.
const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  stdin: { contents: `import { renderToString } from 'react-dom/server';
    import { HomePage } from './frontend/pages/home';
    export const html = renderToString(<HomePage data={{kind:'error',access:{kind:'error'},googleEnabled:false,readOnly:false}} search={new URLSearchParams()} />);`,
    loader: 'tsx', resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const temp = await mkdtemp(join(tmpdir(), 'vibies-public-prerender-'));
try {
  const modulePath = join(temp, 'home.cjs');
  await writeFile(modulePath, result.outputFiles[0].contents);
  const { html } = createRequire(import.meta.url)(modulePath);
  const indexPath = join(root, 'dist/client/index.html');
  const shell = await readFile(indexPath, 'utf8');
  if (!shell.includes('<div id="root"></div>')) throw new Error('Static shell placeholder missing');
  await writeFile(join(root, 'dist/client/shell.html'), shell);
  await writeFile(indexPath, shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
  await writeFile(join(root, 'dist/client/_headers'), `/*\n  Referrer-Policy: same-origin\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n`);
} finally { await rm(temp, {recursive:true,force:true}); }
