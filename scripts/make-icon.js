// Generates assets/lanterm.ico from the LANterm mark for embedding into the
// Windows executable (bun build --compile --windows-icon).
//
// Uses a self-contained SVG (inline fills, no <style>/<filter>) so the
// rasterizer renders it identically at every size. Run: node scripts/make-icon.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'lanterm.ico');

// Icon sizes packed into the .ico (Windows picks the best fit per context).
const SIZES = [256, 128, 64, 48, 32, 16];

const BG = '#0C0B0A';
const FG = '#F5F0E8';
const ACCENT = '#FF8C42';

/** Flat, glow-free variant of docs/assets/lanterm-icon.svg for crisp rasterizing. */
function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" rx="7" fill="${BG}" />
  <polyline points="8,10 14,16 8,22" fill="none" stroke="${FG}"
            stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <rect x="18" y="12" width="6" height="8" rx="1.5" fill="${ACCENT}" />
</svg>`;
}

export async function generateIcon(outPath = OUT) {
  const sharp = (await import('sharp')).default;
  const pngToIco = (await import('png-to-ico')).default;

  const pngs = await Promise.all(
    SIZES.map((s) =>
      sharp(Buffer.from(iconSvg(s)))
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(pngs);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ico);
  return outPath;
}

// Run directly.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  generateIcon()
    .then((p) => console.log(`Wrote ${path.relative(ROOT, p)} (${SIZES.join(', ')}px)`))
    .catch((err) => {
      console.error('Icon generation failed:', err.message);
      process.exit(1);
    });
}
