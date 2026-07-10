// Write a version string into src/version.js and package.json.
// Used by the release workflow after computing the next version.
// Run: node scripts/set-version.js 1.2.3
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const version = (process.argv[2] || '').replace(/^v/i, '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`usage: set-version.js <x.y.z> (got "${process.argv[2]}")`);
  process.exit(1);
}

const versionFile = path.join(ROOT, 'src', 'version.js');
const src = fs.readFileSync(versionFile, 'utf8');
const nextSrc = src.replace(/(VERSION\s*=\s*['"])[^'"]+(['"])/, `$1${version}$2`);
fs.writeFileSync(versionFile, nextSrc);

const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Set version to ${version} (src/version.js, package.json)`);
