/**
 * @fileoverview Bootstrap module for FlashForgeUI Electron application.
 *
 * CRITICAL: This file must be imported FIRST in index.ts, before any other imports.
 *
 * Purpose:
 * Sets the Electron app name and user model ID before any singletons are instantiated.
 * This ensures that all services using app.getPath('userData') point to the correct
 * directory across all platforms and execution modes (normal UI and headless).
 *
 * Problem it solves:
 * - Singletons like ConfigManager and PrinterDetailsManager capture app.getPath('userData')
 *   during construction
 * - If app.setName() is called after these singletons are created, they will use the wrong
 *   directory (e.g., "Electron" instead of "FlashForgeUI")
 * - This caused headless mode on macOS/Linux to read from a different config directory
 *   than the main UI, resulting in missing per-printer settings (custom camera/LED config)
 *
 * Platform-specific userData paths:
 * - macOS: ~/Library/Application Support/FlashForgeUI/
 * - Linux: ~/.config/FlashForgeUI/
 * - Windows: %APPDATA%/FlashForgeUI/
 *
 * Without this bootstrap (default "Electron" name):
 * - macOS: ~/Library/Application Support/Electron/
 * - Linux: ~/.config/Electron/
 * - Windows: %APPDATA%/Electron/
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

// Set app name BEFORE any singletons are created
// This ensures ConfigManager, PrinterDetailsManager, and all other services
// use the correct userData directory path
app.setName('YourPrinter');

// Set AppUserModelId to match electron-builder appId for proper notification routing
// This works across all platforms (Windows uses it for Action Center, macOS for notification attribution)
app.setAppUserModelId('com.yourprinter.desktop');

// Ensure valid semver version is set when running unpackaged or via CLI runner
// (prevents electron-updater crashing on app.getVersion() returning "0.0")
try {
  const currentVersion = app.getVersion();
  if (!currentVersion || currentVersion === '0.0') {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      app.setVersion(pkg.version || '1.0.4');
    } else {
      app.setVersion('1.0.4');
    }
  }
} catch {
  app.setVersion('1.0.4');
}

// Optional override for deterministic E2E/user-data isolation.
// No effect unless FFUI_USER_DATA_DIR is explicitly set.
const userDataOverride = process.env.FFUI_USER_DATA_DIR?.trim();
if (userDataOverride) {
  app.setPath('userData', path.resolve(userDataOverride));
}

console.log('[Bootstrap] App name set to "YourPrinter"');
console.log(`[Bootstrap] App version set to "${app.getVersion()}"`);
console.log(`[Bootstrap] userData path: ${app.getPath('userData')}`);
