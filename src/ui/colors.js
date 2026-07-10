/**
 * Hash a username to a stable Ink color name.
 * @param {string} name
 * @returns {string}
 */
export function colorForName(name) {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  let hash = 0;
  const s = name || '?';
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return colors[hash % colors.length];
}

/**
 * Format a timestamp as HH:MM (local time).
 * @param {number} [ts]
 * @returns {string}
 */
export function formatTime(ts) {
  const d = new Date(ts || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
