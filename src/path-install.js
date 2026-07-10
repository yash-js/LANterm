/**
 * Ensure the standalone LANterm binary is on the user PATH.
 *
 * Windows: copy to %LOCALAPPDATA%\Programs\lanterm\lanterm.exe + user Path
 * macOS / Linux: copy to ~/.local/bin/lanterm + ensure that dir is on PATH
 *
 * No-op when running from source (node / bun).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * True when this process is a Bun/Node-compiled standalone binary.
 * @returns {boolean}
 */
export function isStandaloneBinary() {
  const exe = process.execPath || '';
  const base = path.basename(exe).toLowerCase();
  // Source runs
  if (base === 'node' || base === 'node.exe' || base === 'bun' || base === 'bun.exe') {
    return false;
  }
  // Compiled: lanterm, lanterm.exe, lanterm-linux-x64, …
  return base === 'lanterm' || base === 'lanterm.exe' || base.startsWith('lanterm');
}

/**
 * Stable install directory for the current platform.
 * @returns {string}
 */
export function getInstallDir() {
  if (process.platform === 'win32') {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local');
    return path.join(local, 'Programs', 'lanterm');
  }
  return path.join(os.homedir(), '.local', 'bin');
}

/**
 * Destination binary filename inside the install dir.
 * @returns {string}
 */
export function getInstallBinaryName() {
  return process.platform === 'win32' ? 'lanterm.exe' : 'lanterm';
}

/**
 * @returns {string}
 */
export function getInstallExePath() {
  return path.join(getInstallDir(), getInstallBinaryName());
}

// ── Windows PATH helpers ─────────────────────────────────

function readUserPathWindows() {
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Environment]::GetEnvironmentVariable("Path", "User")',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0) return process.env.Path || process.env.PATH || '';
  return (r.stdout || '').trim();
}

function writeUserPathWindows(value) {
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Environment]::SetEnvironmentVariable("Path", $env:LANTERM_NEW_PATH, "User")',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, LANTERM_NEW_PATH: value },
    },
  );
  return r.status === 0;
}

function ensurePathWindows(destDir) {
  const userPath = readUserPathWindows();
  const parts = userPath.split(';').map((p) => p.trim()).filter(Boolean);
  const already = parts.some((p) => p.toLowerCase() === destDir.toLowerCase());
  let pathAdded = false;
  if (!already) {
    const next = parts.length ? `${userPath.replace(/;+$/, '')};${destDir}` : destDir;
    pathAdded = writeUserPathWindows(next);
  }
  const envKey = process.env.Path !== undefined ? 'Path' : 'PATH';
  if (!process.env[envKey]?.toLowerCase().includes(destDir.toLowerCase())) {
    process.env[envKey] = `${destDir};${process.env[envKey] || ''}`;
  }
  return pathAdded;
}

// ── Unix PATH helpers ────────────────────────────────────

/**
 * Append an export line to a shell profile if missing.
 * @param {string} destDir
 * @returns {boolean} whether a profile was modified
 */
function ensurePathUnix(destDir) {
  const home = os.homedir();
  const exportLine = `export PATH="${destDir}:$PATH"`;
  const marker = '# LANterm PATH';

  const candidates =
    process.platform === 'darwin'
      ? [
          path.join(home, '.zprofile'),
          path.join(home, '.zshrc'),
          path.join(home, '.profile'),
        ]
      : [
          path.join(home, '.bashrc'),
          path.join(home, '.profile'),
          path.join(home, '.zshrc'),
        ];

  let modified = false;
  for (const file of candidates) {
    try {
      let contents = '';
      if (fs.existsSync(file)) {
        contents = fs.readFileSync(file, 'utf8');
        if (contents.includes(marker) || contents.includes(destDir)) {
          modified = false;
          break;
        }
      }
      const block = `\n${marker}\n${exportLine}\n`;
      fs.appendFileSync(file, contents.endsWith('\n') || contents === '' ? block : `\n${block}`, 'utf8');
      modified = true;
      break;
    } catch {
      // try next
    }
  }

  if (!process.env.PATH?.includes(destDir)) {
    process.env.PATH = `${destDir}:${process.env.PATH || ''}`;
  }

  return modified;
}

/**
 * Make the binary executable on Unix.
 * @param {string} file
 */
function chmodPlusX(file) {
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    // ignore
  }
}

/**
 * Ensure this binary is installed in a stable location and on PATH.
 * Safe to call every launch (idempotent).
 * @returns {{ installed: boolean, pathAdded: boolean, exePath: string | null }}
 */
export function ensureLantermOnPath() {
  if (!isStandaloneBinary()) {
    return { installed: false, pathAdded: false, exePath: null };
  }

  const sourceExe = process.execPath;
  const destDir = getInstallDir();
  const destExe = getInstallExePath();

  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch {
    return { installed: false, pathAdded: false, exePath: null };
  }

  const sameFile =
    path.resolve(sourceExe).toLowerCase() === path.resolve(destExe).toLowerCase();

  if (!sameFile) {
    try {
      fs.copyFileSync(sourceExe, destExe);
      if (process.platform !== 'win32') chmodPlusX(destExe);
    } catch {
      if (!fs.existsSync(destExe)) {
        return { installed: false, pathAdded: false, exePath: null };
      }
    }
  } else if (process.platform !== 'win32') {
    chmodPlusX(destExe);
  }

  let pathAdded = false;
  try {
    pathAdded =
      process.platform === 'win32'
        ? ensurePathWindows(destDir)
        : ensurePathUnix(destDir);
  } catch {
    // PATH update failed — binary is still copied
  }

  return { installed: true, pathAdded, exePath: destExe };
}
