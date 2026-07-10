/**
 * Persistent config for LANterm.
 * Windows: %APPDATA%\lanterm\config.json
 * macOS/Linux: $XDG_CONFIG_HOME/lanterm/config.json or ~/.config/lanterm/config.json
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PORT = 47474;

/**
 * Resolve the config directory for the current platform.
 * @returns {string}
 */
export function getConfigDir() {
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ||
      path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'lanterm');
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'lanterm');
  }
  return path.join(os.homedir(), '.config', 'lanterm');
}

/**
 * @returns {string}
 */
export function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure the config directory exists.
 */
function ensureDir() {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load config from disk, creating defaults (stable peerId) if missing.
 * @returns {{ peerId: string, username: string | null, discoveryPort: number }}
 */
export function loadConfig() {
  ensureDir();
  const file = getConfigPath();

  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      return {
        peerId: data.peerId || uuidv4(),
        username: data.username ?? null,
        discoveryPort: Number(data.discoveryPort) || DEFAULT_PORT,
      };
    } catch {
      // Corrupt config — fall through and recreate
    }
  }

  const fresh = {
    peerId: uuidv4(),
    username: null,
    discoveryPort: DEFAULT_PORT,
  };
  saveConfig(fresh);
  return fresh;
}

/**
 * Persist config to disk.
 * @param {{ peerId: string, username: string | null, discoveryPort: number }} config
 */
export function saveConfig(config) {
  ensureDir();
  const payload = {
    peerId: config.peerId,
    username: config.username ?? null,
    discoveryPort: Number(config.discoveryPort) || DEFAULT_PORT,
  };
  fs.writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2), 'utf8');
}
