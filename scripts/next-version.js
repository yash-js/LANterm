// Compute the next release version from Conventional Commit messages.
//
// Reads git tags (v*) to find the current version, inspects commit subjects
// since that tag, and decides the semver bump:
//   feat!: / fix!: / "BREAKING CHANGE:"  -> major
//   feat:                                -> minor
//   fix: / perf:                         -> patch
//   anything else only                   -> no release
//
// Prints machine-readable key=value lines to stdout (for $GITHUB_OUTPUT); all
// human logging goes to stderr. Run: node scripts/next-version.js
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const log = (...a) => console.error(...a);

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function parseSemver(v) {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmpSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Highest v*.*.* tag, or null if the repo has no version tags yet. */
function latestTag() {
  const tags = sh('git tag --list "v*"')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ tag: t, ver: parseSemver(t) }))
    .filter((x) => x.ver);
  if (!tags.length) return null;
  tags.sort((a, b) => cmpSemver(a.ver, b.ver));
  return tags[tags.length - 1];
}

/** Current VERSION baked into the source (bootstrap for the first release). */
function sourceVersion() {
  const file = path.join(ROOT, 'src', 'version.js');
  const m = fs.readFileSync(file, 'utf8').match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '0.0.0';
}

/** Inspect commit messages in range and return 'major' | 'minor' | 'patch' | null. */
function bumpFromCommits(range) {
  const raw = sh(`git log ${range} --format=%B%x00`);
  const commits = raw.split('\0').map((c) => c.trim()).filter(Boolean);
  if (!commits.length) return { bump: null, count: 0 };

  let level = 0; // 0 none, 1 patch, 2 minor, 3 major
  const typeRe = /^(\w+)(\([^)]*\))?(!)?:/;

  for (const msg of commits) {
    const subject = msg.split('\n')[0];
    const m = subject.match(typeRe);
    const breaking = (m && m[3] === '!') || /^BREAKING[ -]CHANGE:/m.test(msg);
    if (breaking) {
      level = Math.max(level, 3);
      continue;
    }
    if (!m) continue;
    const type = m[1].toLowerCase();
    if (type === 'feat') level = Math.max(level, 2);
    else if (type === 'fix' || type === 'perf') level = Math.max(level, 1);
  }

  return { bump: [null, 'patch', 'minor', 'major'][level], count: commits.length };
}

function applyBump([maj, min, pat], bump) {
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function emit({ version, release, bump }) {
  process.stdout.write(`version=${version}\n`);
  process.stdout.write(`release=${release}\n`);
  process.stdout.write(`bump=${bump || 'none'}\n`);
}

function main() {
  const last = latestTag();

  if (!last) {
    // No tags yet: bootstrap the first release from src/version.js as-is.
    const version = sourceVersion();
    log(`No existing v* tags — bootstrapping first release at v${version}.`);
    emit({ version, release: 'true', bump: 'initial' });
    return;
  }

  log(`Latest tag: ${last.tag}`);
  const { bump, count } = bumpFromCommits(`${last.tag}..HEAD`);
  log(`Commits since ${last.tag}: ${count}; detected bump: ${bump || 'none'}`);

  if (!bump) {
    emit({ version: last.ver.join('.'), release: 'false', bump: null });
    return;
  }

  const version = applyBump(last.ver, bump);
  log(`Next version: v${version}`);
  emit({ version, release: 'true', bump });
}

main();
