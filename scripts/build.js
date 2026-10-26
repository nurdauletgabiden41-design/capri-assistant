const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

async function build() {
  fs.mkdirSync(path.join(DIST, 'main'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'preload'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'renderer', 'styles'), { recursive: true });

  // 1. Build Electron Main
  console.log('[build] Compiling main process...');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'app', 'src', 'main', 'index.ts')],
    outfile: path.join(DIST, 'main', 'index.js'),
    platform: 'node',
    target: 'node20',
    bundle: true,
    sourcemap: true,
    external: ['electron'],
  });

  // 2. Build Preload Script
  console.log('[build] Compiling preload script...');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'app', 'src', 'preload', 'index.ts')],
    outfile: path.join(DIST, 'preload', 'index.js'),
    platform: 'node',
    target: 'node20',
    bundle: true,
    sourcemap: true,
    external: ['electron'],
  });

  // 3. Build Renderer Script
  console.log('[build] Compiling renderer bundle...');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'app', 'src', 'renderer', 'main.ts')],
    outfile: path.join(DIST, 'renderer', 'bundle.js'),
    platform: 'browser',
    target: 'chrome120',
    bundle: true,
    sourcemap: true,
  });

  // 4. Copy HTML & CSS
  console.log('[build] Copying static assets to dist/renderer...');
  fs.copyFileSync(
    path.join(ROOT, 'app', 'src', 'renderer', 'index.html'),
    path.join(DIST, 'renderer', 'index.html')
  );

  const stylesSrc = path.join(ROOT, 'app', 'src', 'renderer', 'styles');
  const stylesDst = path.join(DIST, 'renderer', 'styles');
  if (fs.existsSync(stylesSrc)) {
    for (const file of fs.readdirSync(stylesSrc)) {
      fs.copyFileSync(path.join(stylesSrc, file), path.join(stylesDst, file));
    }
  }

  console.log('[build] Build completed successfully.');
}

build().catch((err) => {
  console.error('[build] Failed:', err);
  process.exit(1);
});
