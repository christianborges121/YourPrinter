#!/usr/bin/env node

/**
 * @fileoverview WebUI build and bundling script for desktop / headless.
 *
 * Checks if the modern React WebUI source exists in `../web` (normal mono-repo dev).
 * If present, builds it and copies `../web/dist` to `out/webui/static`.
 * If absent (e.g. Docker backend build where only `desktop` is the context), creates
 * a minimal fallback index.html so static file serving does not fail.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const webDir = path.resolve(desktopRoot, '../web');
const webPkg = path.join(webDir, 'package.json');
const outDir = path.join(desktopRoot, 'out/webui/static');

if (fs.existsSync(webPkg)) {
  console.log('[build:webui] Found modern WebUI in', webDir);
  console.log('[build:webui] Building web assets with Vite...');
  execSync('npm --prefix ../web run build', { cwd: desktopRoot, stdio: 'inherit' });

  console.log('[build:webui] Copying web/dist to', outDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(path.join(webDir, 'dist'), outDir, { recursive: true });
  console.log('[build:webui] Successfully bundled WebUI assets into out/webui/static');
} else {
  console.log('[build:webui] ../web not found (Docker/headless backend environment).');
  console.log('[build:webui] Ensuring fallback static directory exists at', outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const fallbackHtml = path.join(outDir, 'index.html');
  if (!fs.existsSync(fallbackHtml)) {
    fs.writeFileSync(
      fallbackHtml,
      '<!DOCTYPE html><html><head><title>YourPrinter</title><meta http-equiv="refresh" content="0; url=:3080"></head><body><p>YourPrinter headless backend active. WebUI is served on port 3080.</p></body></html>\n',
      'utf8'
    );
  }
  console.log('[build:webui] Fallback static assets configured.');
}
