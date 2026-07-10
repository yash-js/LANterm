<img src="docs/assets/lanterm-lockup.png" alt="LANterm" height="48" />

# LANterm

Peer-to-peer chat for the terminal on **Windows, macOS, and Linux**. Users on the same Wi‑Fi / LAN discover each other and chat with **no server and no internet** — fully decentralized UDP broadcast.

**Tagline:** Chat on your LAN. No server. No cloud. No trace.

End users get a **single standalone binary** (`lanterm` / `lanterm.exe`) with **zero runtime dependencies** (no Node.js install required). Packaging happens on the developer machine.

## How discovery works

1. Every peer binds one UDP socket to `0.0.0.0:47474` (`reuseAddr: true`, broadcast enabled).
2. On start (and every 3s) each peer fans out a JSON `hello` packet to `255.255.255.255:47474`, each interface’s subnet broadcast, and the host’s own LAN IPs.
3. Peers that hear a new `peerId` show “X joined”; heartbeats refresh `lastSeen`.
4. Peers silent for >10s are pruned → “X left”. A graceful `/quit` sends `bye` first.
5. Chat lines are `msg` packets with a unique `msgId` (deduplicated). Nick changes use `nick`.

Same subnet + firewall allow = automatic discovery. No central directory.

## Prerequisites (developer machine)

- [Node.js](https://nodejs.org/) 20+ (for `npm install` and the optional SEA path)
- [Bun](https://bun.sh/) (primary compile path — supports cross-compilation)

```bash
npm install
```

## Run from source

```bash
bun ./src/index.js
# or
npm start
```

Works the same on Windows, macOS, and Linux.

## Slash commands

| Command | Action |
|---------|--------|
| `/nick <name>` | Change username (saved + announced) |
| `/peers` | List online peers |
| `/clear` | Clear the message feed |
| `/update` | Check GitHub for a newer release |
| `/update install` | Download and apply the latest release (standalone binary) |
| `/help` | Show commands |
| `/quit` or `/exit` | Broadcast bye and exit |

## Config

Stored at:

- **Windows:** `%APPDATA%\lanterm\config.json`
- **macOS / Linux:** `$XDG_CONFIG_HOME/lanterm/config.json` or `~/.config/lanterm/config.json`

```json
{
  "peerId": "<stable-uuid>",
  "username": "alice",
  "discoveryPort": 47474
}
```

## Firewall / network permission (important)

UDP discovery needs local network access:

| OS | What to do |
|----|------------|
| **Windows** | First run may show **Windows Defender Firewall** — click **Allow** on **Private** networks. |
| **macOS** | Allow local network / incoming connections if prompted. |
| **Linux** | Usually works out of the box; if you use `ufw`/firewalld, allow UDP port `47474` on the LAN interface. |

Without permission, peers will not discover each other.

## Build standalone binaries (Bun — primary)

Produces self-contained executables. Recipients do **not** need Node or Bun.

```bash
npm run build:win          # dist/lanterm-windows-x64.exe
npm run build:mac-arm64    # dist/lanterm-darwin-arm64   (Apple Silicon)
npm run build:mac-x64      # dist/lanterm-darwin-x64     (Intel Mac)
npm run build:linux-x64    # dist/lanterm-linux-x64
npm run build:linux-arm64  # dist/lanterm-linux-arm64
npm run build:all          # all of the above
```

Cross-compiles go through [`scripts/build-target.js`](./scripts/build-target.js), which reuses Bun’s cached target runtimes (and can re-download them via PowerShell/`curl` if Bun’s own TLS download fails).

Or call Bun directly:

```bash
bun build --compile --target=bun-windows-x64  ./src/index.js --outfile dist/lanterm-windows-x64.exe
bun build --compile --target=bun-darwin-arm64 ./src/index.js --outfile dist/lanterm-darwin-arm64
bun build --compile --target=bun-darwin-x64   ./src/index.js --outfile dist/lanterm-darwin-x64
bun build --compile --target=bun-linux-x64    ./src/index.js --outfile dist/lanterm-linux-x64
bun build --compile --target=bun-linux-arm64  ./src/index.js --outfile dist/lanterm-linux-arm64
```

> **Note:** `react-devtools-core` is listed as a **devDependency** so Bun’s bundler can resolve Ink’s optional DEV-only import. It is not used at runtime in production builds.

### Run after download

```bash
# Windows
.\lanterm-windows-x64.exe

# macOS / Linux
chmod +x lanterm-darwin-arm64   # once
./lanterm-darwin-arm64
```

> **Restricted / corporate network?** If `curl` fails with a `schannel` revocation error (`curl: (35) … CRYPT_E_NO_REVOCATION_CHECK`), your network is blocking certificate-revocation lookups. Work around it with any of:
>
> ```bat
> curl --ssl-no-revoke -L https://github.com/yash-js/lanterm/releases/latest/download/lanterm-windows-x64.exe -o lanterm.exe
> ```
>
> ```powershell
> Invoke-WebRequest -Uri https://github.com/yash-js/lanterm/releases/latest/download/lanterm-windows-x64.exe -OutFile lanterm.exe
> ```
>
> …or just download the binary from the [Releases page](https://github.com/yash-js/lanterm/releases/latest) in a browser. `--ssl-no-revoke` only skips the revocation check; the certificate is still validated.

On first launch the binary **installs itself** onto your PATH:

- **Windows:** `%LOCALAPPDATA%\Programs\lanterm\lanterm.exe`
- **macOS / Linux:** `~/.local/bin/lanterm` (and a PATH line in your shell profile if needed)

Open a **new** terminal and type `lanterm`.

### In-app updates

When running a **standalone binary** (not from source), LANterm checks GitHub Releases on connect and supports:

```text
/update           # check for a newer version
/update install   # download & apply, then quit to swap the binary
```

Updates are fetched from [GitHub Releases](https://github.com/yash-js/lanterm/releases). Running from `bun`/`node` source requires a manual `git pull` + rebuild instead.

## Releasing (CI/CD)

GitHub Actions builds and publishes every platform binary automatically, and the version is derived from your **commit messages** ([Conventional Commits](https://www.conventionalcommits.org/)). Two workflows live in `.github/workflows/`:

- **`ci.yml`** — on every push / PR to `main`, installs deps and compiles `linux-x64` as a smoke test.
- **`release.yml`** — on every push to `main`, inspects commits since the last tag and computes the next semver bump. If a release is warranted it stamps `src/version.js` + `package.json` (used to build the binaries), tags `v<version>`, builds all five targets on their **native** runners (so the Windows `.exe` gets its embedded icon), and publishes a GitHub Release with auto-generated notes.

By default the release is **tag-only** — the version stamp is used for the build but not committed back to `main` (no bot pushes to your branch). If you'd rather keep `src/version.js` in the repo in sync automatically, set the repository variable `COMMIT_BACK_VERSION` to `true` (Settings → Secrets and variables → Actions → Variables); the workflow will then commit the bump back with `[skip ci]`. Either way the tag is the source of truth and the next bump is computed from tags.

Commit message → version bump:

| Commit type | Example | Bump |
| --- | --- | --- |
| Breaking | `feat!: …` or a `BREAKING CHANGE:` footer | major |
| Feature | `feat: add /whisper command` | minor |
| Fix / perf | `fix: dedupe peers`, `perf: …` | patch |
| Other only | `docs:`, `chore:`, `refactor:`, … | no release |

Each target is built on a matching runner and uploaded under the exact asset name the in-app updater expects:

| Asset | Runner |
| --- | --- |
| `lanterm-windows-x64.exe` | `windows-latest` |
| `lanterm-darwin-arm64` | `macos-latest` |
| `lanterm-darwin-x64` | `macos-latest` (cross-compiled) |
| `lanterm-linux-x64` | `ubuntu-latest` |
| `lanterm-linux-arm64` | `ubuntu-24.04-arm` |

To cut a release, just write a conventional commit and push — no manual version edits or tagging:

```bash
git commit -m "feat: add message reactions"   # -> minor bump
git push origin main
```

The workflow computes the bump, stamps that version into the binaries, and tags it, so the git tag, the release, and the version the app reports (and the updater compares against) always match. A push with only `docs:`/`chore:`-style commits produces no release. The very first run (no tags yet) releases the current `src/version.js` as-is.

## Node SEA fallback

If Ink’s terminal rendering misbehaves under the Bun-compiled binary, ship a [Node Single Executable Application](https://nodejs.org/api/single-executable-applications.html) instead.

### 1. Bundle the app (transforms JSX → plain JS)

```bash
mkdir -p dist
bun build ./src/index.js --outfile dist/lanterm.bundle.js --target=node
```

### 2. Generate the SEA blob

```bash
node --experimental-sea-config sea-config.json
```

### 3. Copy the Node binary and inject the blob

**Windows (PowerShell):**

```powershell
Copy-Item (Get-Command node).Source .\dist\lanterm-windows-x64.exe
npx postject dist\lanterm-windows-x64.exe NODE_SEA_BLOB dist\sea-prep.blob `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 `
  --overwrite
```

**macOS / Linux:**

```bash
cp "$(command -v node)" dist/lanterm
npx postject dist/lanterm NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite
chmod +x dist/lanterm
```

## Project layout

```
src/
  index.js          Bootstrap — load config, PATH install, render Ink
  config.js         Load/save platform config dir
  path-install.js   Auto-add standalone binary to PATH (Win / macOS / Linux)
  net.js            UDP socket, peer table, heartbeat/prune, EventEmitter
  commands.js       Slash-command parser
  update.js         In-app updates via GitHub Releases
  version.js        VERSION reported by the app (keep in sync with git tag)
  ui/
    App.jsx         Screen switch + chat state
    colors.js       Name→color hash, HH:MM timestamps
    components/
      Header.jsx
      Wordmark.jsx
      MessageFeed.jsx
      InputBar.jsx
      PeerList.jsx
      UsernamePrompt.jsx
scripts/
  build-target.js   Cross-compile helper (native builds + icon embedding)
  make-icon.js      Generate assets/lanterm.ico from the brand mark
  make-lockup.js    Generate docs/assets/lanterm-lockup.png (README header)
  next-version.js   Compute next semver from Conventional Commits
  set-version.js    Stamp version into src/version.js + package.json
.github/workflows/
  ci.yml            Smoke-build on push / PR
  release.yml       Build all platforms + publish release on v* tag
assets/lanterm.ico  Windows executable icon
docs/               Marketing landing page → https://lanterm.in
sea-config.json     Node SEA config
package.json
README.md
```

## Two machines on the same Wi‑Fi

1. Build (or download) the binary for each OS — mixed OS on the same LAN is fine.
2. Allow firewall / local-network prompts on both.
3. Start LANterm on machine A → choose a username.
4. Start LANterm on machine B → within a few seconds you should see join notifications and matching online peers.
5. Type normally to chat; use `/peers` to confirm who’s visible.

They must be on the same L2/L3 broadcast domain (typical home/office Wi‑Fi). Guest Wi‑Fi with client isolation, VPNs, or AP isolation will block discovery.

## Marketing site

The landing page lives in [`docs/`](./docs) — plain HTML/CSS/JS, **no build step**. Production domain: **[https://lanterm.in](https://lanterm.in)**

### Preview locally

```bash
npx --yes serve docs
```

### Deploy

- **GitHub Pages:** branch `main`, folder `/docs`, custom domain `lanterm.in`
- **Netlify / Vercel:** publish directory `docs`, no build command

Optional: add `docs/og-image.png` (1200×630) for social previews.

## License

MIT
