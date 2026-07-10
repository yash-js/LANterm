# LANterm website

Static marketing page for [LANterm](https://github.com/yash-js/lanterm). Production site: [https://lanterm.in](https://lanterm.in)

| File | Role |
|------|------|
| `index.html` | Markup, SEO, sections |
| `styles.css` | Dark theme with amber accent (CSS variables) |
| `main.js` | Nav, clipboard, terminal demo, star count |
| `assets/lanterm-icon.svg` | Square icon / app tile (favicon source) |
| `assets/lanterm-lockup.svg` | Icon + wordmark (nav / README header) |
| `assets/lanterm-wordmark.svg` | Wordmark only |

Logo concept: a command-line prompt — chevron `>` + a glowing amber cursor block. Palette lives in each SVG's `<style>` block (swap `#0C0B0A` / `#FF8C42` / `#F5F0E8` to retheme).

**Repo URL** (find-and-replace): `https://github.com/yash-js/lanterm` — also `GITHUB_REPO` / `GITHUB_API` in `main.js`.

## Deploy

GitHub Pages → branch `main`, folder **`/docs`**. Custom domain: `lanterm.in`. See root [README](../README.md#marketing-site).
