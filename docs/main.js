/**
 * LANterm landing — vanilla JS
 * - Sticky nav translucent state + mobile menu
 * - Clipboard copy buttons
 * - Hero terminal typing animation (respects prefers-reduced-motion)
 * - Optional live GitHub star count
 */

/** Find-and-replace this if the repo moves. */
const GITHUB_REPO = "https://github.com/yash-js/lanterm";
const GITHUB_API = "https://api.github.com/repos/yash-js/lanterm";
const RELEASE = "https://github.com/yash-js/lanterm/releases/latest/download";

/** Install one-liners per OS (used by hero CTA + defaults). */
const INSTALL_COMMANDS = {
  windows: `curl -L ${RELEASE}/lanterm-windows-x64.exe -o lanterm.exe\n.\\lanterm.exe`,
  macos: `curl -L ${RELEASE}/lanterm-darwin-arm64 -o lanterm\nchmod +x lanterm\n./lanterm`,
  linux: `curl -L ${RELEASE}/lanterm-linux-x64 -o lanterm\nchmod +x lanterm\n./lanterm`,
};

function detectOs() {
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac|iPhone|iPad/i.test(ua)) return "macos";
  if (/Linux|Android/i.test(ua)) return "linux";
  return "windows";
}

/* ── Sticky header ──────────────────────────────────────── */
const header = document.getElementById("site-header");

function onScroll() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ── Mobile nav ─────────────────────────────────────────── */
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.getElementById("site-nav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const open = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open menu");
    });
  });
}

/* ── Clipboard ──────────────────────────────────────────── */
function decodeCopyAttr(raw) {
  return raw.replace(/&#10;/g, "\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

document.querySelectorAll("[data-copy]").forEach((btn) => {
  const defaultLabel =
    btn.getAttribute("data-copy-label") || btn.textContent.trim() || "Copy";

  btn.addEventListener("click", async () => {
    const text = decodeCopyAttr(btn.getAttribute("data-copy") || "");
    try {
      await copyText(text);
      btn.classList.add("is-copied");
      btn.textContent = "Copied!";
      window.setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.textContent = defaultLabel;
      }, 1600);
    } catch {
      btn.textContent = "Copy failed";
      window.setTimeout(() => {
        btn.textContent = defaultLabel;
      }, 1600);
    }
  });
});

function bindCopyButton(btn) {
  if (!btn || btn.dataset.copyBound === "1") return;
  btn.dataset.copyBound = "1";
  const defaultLabel =
    btn.getAttribute("data-copy-label") || btn.textContent.trim() || "Copy";
  btn.addEventListener("click", async () => {
    const text = decodeCopyAttr(btn.getAttribute("data-copy") || "");
    try {
      await copyText(text);
      btn.classList.add("is-copied");
      btn.textContent = "Copied!";
      window.setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.textContent = defaultLabel;
      }, 1600);
    } catch {
      btn.textContent = "Copy failed";
      window.setTimeout(() => {
        btn.textContent = defaultLabel;
      }, 1600);
    }
  });
}

/* ── GitHub star count (best-effort) ────────────────────── */
async function loadStars() {
  const els = document.querySelectorAll(".star-count");
  if (!els.length) return;
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const data = await res.json();
    const n = data.stargazers_count;
    if (typeof n !== "number") return;
    const label = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
    els.forEach((el) => {
      el.textContent = `★ ${label}`;
    });
  } catch {
    // Keep placeholder "★ —"
  }
}

loadStars();

/* ── Scroll reveal (name breakdown) ─────────────────────── */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.2, rootMargin: '0px 0px -40px 0px' },
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
    el.classList.add('is-visible');
  });
}

/* ── OS install tabs ────────────────────────────────────── */
function activateOs(os) {
  document.querySelectorAll(".os-tab").forEach((tab) => {
    const on = tab.getAttribute("data-os") === os;
    tab.classList.toggle("is-active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll("[data-os-panel]").forEach((panel) => {
    const on = panel.getAttribute("data-os-panel") === os;
    panel.classList.toggle("is-active", on);
    if (on) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  });
}

const initialOs = detectOs();
activateOs(initialOs);

const heroCopy = document.getElementById("hero-copy-install");
if (heroCopy) {
  heroCopy.setAttribute("data-copy", INSTALL_COMMANDS[initialOs] || INSTALL_COMMANDS.windows);
  bindCopyButton(heroCopy);
}

document.querySelectorAll(".os-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const os = tab.getAttribute("data-os");
    activateOs(os);
    if (heroCopy && INSTALL_COMMANDS[os]) {
      heroCopy.setAttribute("data-copy", INSTALL_COMMANDS[os]);
    }
  });
});

/* ── Terminal animation ─────────────────────────────────── */
const feed = document.getElementById("term-feed");
const typed = document.getElementById("term-typed");
const peersEl = document.getElementById("term-peers");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCRIPT = [
  { kind: "wait", ms: 600 },
  { kind: "sys", text: "Connected on UDP port 47474. Say hello!" },
  { kind: "wait", ms: 700 },
  { kind: "sys", text: "maya joined" },
  { kind: "peers", names: ["maya"] },
  { kind: "wait", ms: 500 },
  { kind: "sys", text: "dev joined" },
  { kind: "peers", names: ["maya", "dev"] },
  { kind: "wait", ms: 800 },
  { kind: "type", text: "anyone on this wifi?" },
  { kind: "chat", name: "you", cls: "you", text: "anyone on this wifi?", time: "14:02" },
  { kind: "clear-input" },
  { kind: "wait", ms: 900 },
  { kind: "chat", name: "maya", cls: "peer-a", text: "yo — conference room A", time: "14:02" },
  { kind: "wait", ms: 700 },
  { kind: "chat", name: "dev", cls: "peer-b", text: "same floor. no cloud needed 🔥", time: "14:03" },
  { kind: "wait", ms: 1000 },
  { kind: "type", text: "/nick lanterm" },
  { kind: "sys", text: "You are now lanterm (was you)" },
  { kind: "clear-input" },
  { kind: "wait", ms: 600 },
  { kind: "sys", text: "maya is now maya-ops" },
  { kind: "peers", names: ["maya-ops", "dev"] },
  { kind: "wait", ms: 2200 },
];

const STATIC_FRAME = [
  { kind: "sys", text: "Connected on UDP port 47474. Say hello!" },
  { kind: "sys", text: "maya joined" },
  { kind: "sys", text: "dev joined" },
  { kind: "chat", name: "you", cls: "you", text: "anyone on this wifi?", time: "14:02" },
  { kind: "chat", name: "maya", cls: "peer-a", text: "yo — conference room A", time: "14:02" },
  { kind: "chat", name: "dev", cls: "peer-b", text: "same floor. no cloud needed 🔥", time: "14:03" },
  { kind: "sys", text: "You are now lanterm (was you)" },
  { kind: "sys", text: "maya is now maya-ops" },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function appendSys(text) {
  feed.appendChild(el("div", "term-line-sys", text));
  feed.scrollTop = feed.scrollHeight;
}

function appendChat(name, cls, text, time) {
  const line = el("div", "term-line-chat");
  line.appendChild(el("span", "term-time", `${time} `));
  const nameEl = el("span", `term-name ${cls}`, name);
  line.appendChild(nameEl);
  line.appendChild(document.createTextNode(`: ${text}`));
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
}

function setPeers(names) {
  if (!peersEl) return;
  peersEl.textContent = names.length ? names.join(", ") : "(none yet)";
  peersEl.className = names.length ? "" : "term-dim";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeOut(text) {
  if (!typed) return;
  typed.textContent = "";
  for (let i = 0; i < text.length; i++) {
    typed.textContent += text[i];
    await sleep(28 + Math.random() * 36);
  }
  await sleep(280);
}

function resetTerminal() {
  if (feed) feed.replaceChildren();
  if (typed) typed.textContent = "";
  setPeers([]);
}

function renderStatic() {
  resetTerminal();
  setPeers(["maya-ops", "dev"]);
  for (const step of STATIC_FRAME) {
    if (step.kind === "sys") appendSys(step.text);
    if (step.kind === "chat") appendChat(step.name, step.cls, step.text, step.time);
  }
  if (typed) typed.textContent = "";
}

async function runScript() {
  resetTerminal();
  for (const step of SCRIPT) {
    switch (step.kind) {
      case "wait":
        await sleep(step.ms);
        break;
      case "sys":
        appendSys(step.text);
        break;
      case "chat":
        appendChat(step.name, step.cls, step.text, step.time);
        break;
      case "type":
        await typeOut(step.text);
        break;
      case "clear-input":
        if (typed) typed.textContent = "";
        break;
      case "peers":
        setPeers(step.names);
        break;
      default:
        break;
    }
  }
}

async function loopTerminal() {
  if (!feed) return;
  if (reduceMotion) {
    renderStatic();
    return;
  }
  for (;;) {
    await runScript();
    await sleep(900);
  }
}

loopTerminal();

void GITHUB_REPO;
