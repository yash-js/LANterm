#!/usr/bin/env bun
/**
 * Cross-compile helper for LANterm.
 *
 * Bun downloads a target runtime when you `--compile --target=…`. On some
 * Windows setups (AV / SSL inspection) that download fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE even though a partial/full cache file exists.
 *
 * This script prefers `--compile-executable-path` pointing at the local Bun
 * cache, and if the cache is missing it downloads the zip via the system
 * HTTPS stack (PowerShell / curl) which usually trusts corporate CAs.
 *
 * Usage:
 *   bun scripts/build-target.js windows-x64
 *   bun scripts/build-target.js darwin-arm64
 *   bun scripts/build-target.js all
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'index.js');
const DIST = path.join(ROOT, 'dist');
const ICON = path.join(ROOT, 'assets', 'lanterm.ico');

/** @type {Record<string, { bunTarget: string, cacheName: string, zipAsset: string, outfile: string, windows?: boolean }>} */
const TARGETS = {
  'windows-x64': {
    bunTarget: 'bun-windows-x64',
    cacheName: 'bun-windows-x64',
    zipAsset: 'bun-windows-x64.zip',
    outfile: 'lanterm-windows-x64.exe',
    windows: true,
  },
  'darwin-arm64': {
    bunTarget: 'bun-darwin-arm64',
    cacheName: 'bun-darwin-aarch64',
    zipAsset: 'bun-darwin-aarch64.zip',
    outfile: 'lanterm-darwin-arm64',
  },
  'darwin-x64': {
    bunTarget: 'bun-darwin-x64',
    cacheName: 'bun-darwin-x64',
    zipAsset: 'bun-darwin-x64.zip',
    outfile: 'lanterm-darwin-x64',
  },
  'linux-x64': {
    bunTarget: 'bun-linux-x64',
    cacheName: 'bun-linux-x64',
    zipAsset: 'bun-linux-x64.zip',
    outfile: 'lanterm-linux-x64',
  },
  'linux-arm64': {
    bunTarget: 'bun-linux-arm64',
    cacheName: 'bun-linux-aarch64',
    zipAsset: 'bun-linux-aarch64.zip',
    outfile: 'lanterm-linux-arm64',
  },
};

function bunVersion() {
  const r = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

/** Generate assets/lanterm.ico if missing; returns its path or null on failure. */
function ensureIcon() {
  if (fs.existsSync(ICON)) return ICON;
  console.log('Generating executable icon (assets/lanterm.ico)…');
  const r = spawnSync('node', [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });
  if (r.status === 0 && fs.existsSync(ICON)) return ICON;
  console.warn('Could not generate icon; building without a custom icon.');
  return null;
}

function cacheDir() {
  return path.join(os.homedir(), '.bun', 'install', 'cache');
}

/**
 * @param {string} cacheName  e.g. bun-darwin-aarch64
 * @param {string} version
 */
function cachePath(cacheName, version) {
  return path.join(cacheDir(), `${cacheName}-v${version}`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: process.platform === 'win32',
    ...opts,
  });
  return r.status ?? 1;
}

/**
 * Download a Bun release zip with the OS HTTPS stack (bypasses Bun's TLS).
 * @param {string} version
 * @param {string} zipAsset
 * @param {string} destZip
 */
function downloadZip(version, zipAsset, destZip) {
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/${zipAsset}`;
  console.log(`Downloading ${url}`);

  if (process.platform === 'win32') {
    const ps = `
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri '${url}' -OutFile '${destZip.replace(/'/g, "''")}' -UseBasicParsing
`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      stdio: 'inherit',
    });
    return r.status === 0 && fs.existsSync(destZip);
  }

  const r = spawnSync('curl', ['-fsSL', url, '-o', destZip], { stdio: 'inherit' });
  return r.status === 0 && fs.existsSync(destZip);
}

/**
 * Extract the bun binary from a release zip into the Bun cache path.
 * @param {string} zipPath
 * @param {string} destFile
 */
function extractBinary(zipPath, destFile) {
  const tmp = path.join(os.tmpdir(), `lanterm-bun-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });

  try {
    if (process.platform === 'win32') {
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: 'inherit' },
      );
      if (r.status !== 0) return false;
    } else {
      const r = spawnSync('unzip', ['-o', zipPath, '-d', tmp], { stdio: 'inherit' });
      if (r.status !== 0) return false;
    }

    // Zip layout: bun-<platform>/bun  (or bun.exe on Windows)
    const found = findBunBinary(tmp);
    if (!found) {
      console.error('Could not find bun binary inside zip');
      return false;
    }

    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(found, destFile);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(destFile, 0o755);
      } catch {
        // ignore
      }
    }
    return true;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/** @param {string} dir */
function findBunBinary(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (name === 'bun' || name === 'bun.exe') {
        return full;
      }
    }
  }
  return null;
}

/**
 * Ensure a usable target Bun binary exists on disk.
 * @param {{ cacheName: string, zipAsset: string, bunTarget: string }} target
 * @param {string} version
 */
function ensureRuntime(target, version) {
  // Same-OS compile: use the running Bun binary (no download needed)
  const hostMap = {
    'bun-windows-x64': process.platform === 'win32' && process.arch === 'x64',
    'bun-windows-arm64': process.platform === 'win32' && process.arch === 'arm64',
    'bun-darwin-arm64': process.platform === 'darwin' && process.arch === 'arm64',
    'bun-darwin-x64': process.platform === 'darwin' && process.arch === 'x64',
    'bun-linux-x64': process.platform === 'linux' && process.arch === 'x64',
    'bun-linux-arm64': process.platform === 'linux' && process.arch === 'arm64',
  };
  if (hostMap[target.bunTarget]) {
    console.log(`Native target — using current Bun: ${process.execPath}`);
    return process.execPath;
  }

  const dest = cachePath(target.cacheName, version);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log(`Using cached runtime: ${dest}`);
    return dest;
  }

  console.log(`Cache miss or incomplete: ${dest}`);
  const zipPath = path.join(os.tmpdir(), target.zipAsset);
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  } catch {
    // ignore
  }

  if (!downloadZip(version, target.zipAsset, zipPath)) {
    console.error('Download failed. Check network / antivirus SSL inspection.');
    return null;
  }

  if (!extractBinary(zipPath, dest)) {
    console.error('Extract failed.');
    return null;
  }

  try {
    fs.unlinkSync(zipPath);
  } catch {
    // ignore
  }

  console.log(`Installed runtime → ${dest}`);
  return dest;
}

/**
 * @param {string} key
 */
function buildOne(key) {
  const target = TARGETS[key];
  if (!target) {
    console.error(`Unknown target: ${key}`);
    console.error(`Known: ${Object.keys(TARGETS).join(', ')}`);
    return 1;
  }

  const version = bunVersion();
  if (!version) {
    console.error('bun --version failed');
    return 1;
  }

  fs.mkdirSync(DIST, { recursive: true });
  const outfile = path.join(DIST, target.outfile);
  const runtime = ensureRuntime(target, version);

  const args = [
    'build',
    '--compile',
    `--target=${target.bunTarget}`,
    ENTRY,
    `--outfile=${outfile}`,
  ];

  if (runtime) {
    args.push(`--compile-executable-path=${runtime}`);
  }

  // Embed the executable icon. Bun's --windows-icon relies on Windows APIs, so
  // it only works when compiling the Windows target on a Windows host.
  if (target.windows) {
    if (os.platform() !== 'win32') {
      console.warn('Skipping --windows-icon: only supported when building on Windows.');
    } else {
      const icon = ensureIcon();
      if (icon) args.push(`--windows-icon=${icon}`);
    }
  }

  console.log(`$ bun ${args.join(' ')}`);
  const status = run('bun', args);
  if (status !== 0 && runtime) {
    console.error('Build with cached runtime failed; retrying without --compile-executable-path…');
    return run('bun', [
      'build',
      '--compile',
      `--target=${target.bunTarget}`,
      ENTRY,
      `--outfile=${outfile}`,
    ]);
  }
  return status;
}

const arg = process.argv[2] || 'windows-x64';

if (arg === 'all') {
  let code = 0;
  for (const key of Object.keys(TARGETS)) {
    console.log(`\n═══ ${key} ═══`);
    const s = buildOne(key);
    if (s !== 0) code = s;
  }
  process.exit(code);
}

process.exit(buildOne(arg));
