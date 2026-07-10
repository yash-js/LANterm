/**
 * In-app updates via GitHub Releases.
 * Checks, downloads, and applies standalone binary updates.
 */

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { VERSION } from './version.js';
import {
  getInstallExePath,
  isStandaloneBinary,
} from './path-install.js';

/** Find-and-replace if the repo moves. */
export const GITHUB_REPO = 'yash-js/lanterm';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const USER_AGENT = 'lanterm-updater';

/**
 * @param {string} v
 * @returns {[number, number, number] | null}
 */
function parseSemver(v) {
  const m = String(v)
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * GitHub release asset name for this OS/arch.
 * @returns {string | null}
 */
export function getReleaseAssetName() {
  const { platform, arch } = process;
  if (platform === 'win32') return 'lanterm-windows-x64.exe';
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'lanterm-darwin-arm64' : 'lanterm-darwin-x64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'lanterm-linux-arm64' : 'lanterm-linux-x64';
  }
  return null;
}

/**
 * Path we replace when updating (installed copy or running binary).
 * @returns {string | null}
 */
export function getUpdateTargetPath() {
  if (!isStandaloneBinary()) return null;
  const installed = getInstallExePath();
  if (fs.existsSync(installed)) return installed;
  return process.execPath;
}

/**
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(15_000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

/**
 * @typedef {{ current: string, latest: string, available: boolean, releaseUrl: string, notes: string | null, assetUrl: string | null, assetName: string | null }} UpdateInfo
 */

/**
 * Check GitHub for a newer release.
 * @returns {Promise<UpdateInfo>}
 */
export async function checkForUpdate() {
  const assetName = getReleaseAssetName();
  const current = VERSION;
  const base = {
    current,
    latest: current,
    available: false,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
    notes: null,
    assetUrl: null,
    assetName,
  };

  if (!assetName) {
    return base;
  }

  const release = await fetchJson(GITHUB_API);
  const latest = String(release.tag_name || release.name || current).replace(/^v/i, '');
  const asset = (release.assets || []).find((a) => a.name === assetName);
  const available = compareSemver(latest, current) > 0;

  return {
    current,
    latest,
    available,
    releaseUrl: release.html_url || base.releaseUrl,
    notes: typeof release.body === 'string' ? release.body.trim() : null,
    assetUrl: asset?.browser_download_url || null,
    assetName,
  };
}

/**
 * @param {string} url
 * @param {string} dest
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<void>}
 */
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const cleanup = () => {
      try {
        file.close();
      } catch {
        // ignore
      }
    };

    const request = (fetchUrl, redirects = 0) => {
      if (redirects > 8) {
        cleanup();
        reject(new Error('Too many redirects'));
        return;
      }

      https
        .get(fetchUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            cleanup();
            reject(new Error(`Download HTTP ${res.statusCode}`));
            res.resume();
            return;
          }

          const total = Number(res.headers['content-length']) || 0;
          let received = 0;
          let lastPct = -1;

          res.on('data', (chunk) => {
            received += chunk.length;
            if (total && onProgress) {
              const pct = Math.floor((received / total) * 100);
              if (pct !== lastPct && pct % 10 === 0) {
                lastPct = pct;
                onProgress(`Downloading… ${pct}%`);
              }
            }
          });

          res.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve());
          });
        })
        .on('error', (err) => {
          cleanup();
          try {
            fs.unlinkSync(dest);
          } catch {
            // ignore
          }
          reject(err);
        });
    };

    request(url);
  });
}

/**
 * Swap a completed download into place (used on startup).
 * @param {string} target
 * @param {string} pending
 */
function swapPendingBinary(target, pending) {
  const backup = `${target}.old`;
  try {
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
  } catch {
    // ignore
  }
  if (fs.existsSync(target)) {
    fs.renameSync(target, backup);
  }
  fs.renameSync(pending, target);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(target, 0o755);
    } catch {
      // ignore
    }
  }
  try {
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
  } catch {
    // ignore
  }
}

/**
 * On startup: apply a `.pending` update left from a previous session.
 * @returns {boolean}
 */
export function applyPendingUpdate() {
  const target = getUpdateTargetPath();
  if (!target) return false;

  const pending = `${target}.pending`;
  if (!fs.existsSync(pending)) return false;

  try {
    const st = fs.statSync(pending);
    if (st.size < 1_000_000) {
      fs.unlinkSync(pending);
      return false;
    }
    swapPendingBinary(target, pending);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a detached script to replace the binary after this process exits.
 * @param {string} target
 * @param {string} pending
 */
function scheduleReplaceOnExit(target, pending) {
  const pid = process.pid;

  if (process.platform === 'win32') {
    const script = path.join(os.tmpdir(), `lanterm-update-${pid}.ps1`);
    const content = `
$ErrorActionPreference = 'SilentlyContinue'
while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 400 }
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath '${target.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${target.replace(/'/g, "''")}.old' -Force -ErrorAction SilentlyContinue; Move-Item -LiteralPath '${target.replace(/'/g, "''")}' -Destination '${target.replace(/'/g, "''")}.old' -Force }
Move-Item -LiteralPath '${pending.replace(/'/g, "''")}' -Destination '${target.replace(/'/g, "''")}' -Force
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force
`;
    fs.writeFileSync(script, content, 'utf8');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', script],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
    return;
  }

  const script = path.join(os.tmpdir(), `lanterm-update-${pid}.sh`);
  const content = `#!/bin/sh
while kill -0 ${pid} 2>/dev/null; do sleep 0.4; done
sleep 1
rm -f "${target}.old"
[ -f "${target}" ] && mv "${target}" "${target}.old"
mv "${pending}" "${target}"
chmod +x "${target}"
rm -f "$0"
`;
  fs.writeFileSync(script, content, { mode: 0o755 });
  const child = spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' });
  child.unref();
}

/**
 * Download latest release and schedule in-place update on exit.
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<{ appliedOnExit: boolean, latest: string, target: string }>}
 */
export async function installUpdate(onProgress) {
  if (!isStandaloneBinary()) {
    throw new Error('Updates apply to the standalone binary only — rebuild from source or download a release.');
  }

  const target = getUpdateTargetPath();
  if (!target) {
    throw new Error('Could not determine install path for this binary.');
  }

  const info = await checkForUpdate();
  if (!info.available) {
    throw new Error(
      info.latest === info.current
        ? `Already on the latest version (v${VERSION}).`
        : `No newer release found (current v${VERSION}).`,
    );
  }
  if (!info.assetUrl) {
    throw new Error(`Release v${info.latest} has no asset "${info.assetName}" for this platform.`);
  }

  const pending = `${target}.pending`;
  const partial = `${target}.download`;

  try {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
  } catch {
    // ignore
  }

  onProgress?.(`Downloading LANterm v${info.latest}…`);
  await downloadFile(info.assetUrl, partial, onProgress);

  const st = fs.statSync(partial);
  if (st.size < 1_000_000) {
    fs.unlinkSync(partial);
    throw new Error('Downloaded file looks too small — aborted.');
  }

  try {
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
  } catch {
    // ignore
  }
  fs.renameSync(partial, pending);

  scheduleReplaceOnExit(target, pending);

  return {
    appliedOnExit: true,
    latest: info.latest,
    target,
  };
}
