// Generates docs/assets/lanterm-lockup.png — a raster of the horizontal lockup
// (icon tile + "LANterm" wordmark) for the README header.
//
// GitHub's markdown renderer sanitizes/blocks SVGs that use <style>, <filter>,
// or web fonts, and it can't load the Space Grotesk font, so the SVG lockup
// shows as a broken image. A PNG renders everywhere. Run: node scripts/make-lockup.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'assets', 'lanterm-lockup.png');

const SCALE = 3; // 3x the viewBox for crisp retina rendering
const VB_W = 150;
const VB_H = 56;
const W = VB_W * SCALE;
const H = VB_H * SCALE;

const BG = '#0C0B0A';
const FG = '#F5F0E8';
const ACCENT = '#FF8C42';

// The lockup sits on a dark rounded panel so the off-white wordmark stays
// legible on both light and dark GitHub themes. Flat, self-contained (inline
// fills, no <style>/<filter>/web font) so the rasterizer reproduces it faithfully.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${W}" height="${H}">
  <rect width="${VB_W}" height="${VB_H}" rx="12" fill="${BG}" />
  <g transform="translate(16,12)">
    <polyline points="8,10 14,16 8,22" fill="none" stroke="${FG}"
              stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="18" y="12" width="6" height="8" rx="1.5" fill="${ACCENT}" />
    <text x="42" y="22.5" font-family="Segoe UI, Arial, Helvetica, sans-serif"
          font-size="19" font-weight="700" letter-spacing="-0.4">
      <tspan fill="${ACCENT}">LAN</tspan><tspan fill="${FG}">term</tspan>
    </text>
  </g>
</svg>`;

async function main() {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svg)).png().toFile(OUT);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${W}x${H})`);
}

main().catch((err) => {
  console.error('Lockup generation failed:', err.message);
  process.exit(1);
});
