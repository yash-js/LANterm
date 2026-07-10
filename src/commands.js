/**
 * Slash-command parser for LANterm chat input.
 */

/**
 * @typedef {'nick' | 'peers' | 'clear' | 'help' | 'update' | 'quit' | 'unknown' | null} CommandName
 */

/**
 * Parse a line of user input.
 * Returns null command for normal chat text (non-slash).
 *
 * @param {string} input
 * @returns {{ command: CommandName, args: string, raw: string }}
 */
export function parseCommand(input) {
  const raw = input ?? '';
  const trimmed = raw.trim();

  if (!trimmed.startsWith('/')) {
    return { command: null, args: trimmed, raw };
  }

  const space = trimmed.indexOf(' ');
  const name =
    space === -1 ? trimmed.slice(1).toLowerCase() : trimmed.slice(1, space).toLowerCase();
  const args = space === -1 ? '' : trimmed.slice(space + 1).trim();

  switch (name) {
    case 'nick':
      return { command: 'nick', args, raw };
    case 'peers':
      return { command: 'peers', args, raw };
    case 'clear':
      return { command: 'clear', args, raw };
    case 'help':
      return { command: 'help', args, raw };
    case 'update':
      return { command: 'update', args, raw };
    case 'quit':
    case 'exit':
      return { command: 'quit', args, raw };
    default:
      return { command: 'unknown', args: name, raw };
  }
}

/** Help text lines shown by /help */
export const HELP_LINES = [
  '/nick <name>     — change your username',
  '/peers           — list online peers',
  '/clear           — clear the message feed',
  '/update          — check for updates',
  '/update install  — download & apply latest release',
  '/help            — show this help',
  '/quit, /exit     — leave the chat',
];
