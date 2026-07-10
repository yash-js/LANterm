#!/usr/bin/env node
/**
 * LANterm — peer-to-peer LAN chat for the terminal.
 * Bootstrap: load config, render the Ink UI.
 *
 * JSX lives in ./ui/*.jsx — Bun runs/compiles it natively.
 * For Node SEA, bundle first (see README) so JSX is transformed away.
 */

import React from 'react';
import { render } from 'ink';
import { loadConfig } from './config.js';
import { ensureLantermOnPath } from './path-install.js';
import { applyPendingUpdate } from './update.js';
import App from './ui/App.jsx';

// Apply a staged update from a previous /update install (if any)
try {
  if (applyPendingUpdate()) {
    // Silent — user simply runs the new version next launch
  }
} catch {
  // ignore
}

// Standalone binary → install to a stable dir and add to user PATH (Win / macOS / Linux)
try {
  ensureLantermOnPath();
} catch {
  // Never block chat if PATH install fails
}

const config = loadConfig();

render(React.createElement(App, { initialConfig: config }));
