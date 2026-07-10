import React from 'react';
import { Box, Text } from 'ink';
import { colorForName } from '../colors.js';

/**
 * Inline peer list (used when /peers is run — rendered as system lines in the feed,
 * but also available as a standalone component).
 */
export default function PeerList({ peers, selfName }) {
  const count = peers.length;
  return (
    <Box flexDirection="column">
      <Text dimColor>
        Online ({count + 1} including you):
      </Text>
      <Text>
        <Text color="green">{selfName}</Text>
        <Text dimColor> (you)</Text>
      </Text>
      {peers.map((p) => (
        <Text key={p.peerId}>
          <Text color={colorForName(p.username)}>{p.username}</Text>
        </Text>
      ))}
      {count === 0 && (
        <Text dimColor italic>
          No other peers discovered yet.
        </Text>
      )}
    </Box>
  );
}

/**
 * Format peer list as plain text lines for the message feed.
 * @param {{ peerId: string, username: string }[]} peers
 * @param {string} selfName
 * @returns {string[]}
 */
export function formatPeerLines(peers, selfName) {
  const lines = [`Online (${peers.length + 1} including you):`, `  ${selfName} (you)`];
  for (const p of peers) {
    lines.push(`  ${p.username}`);
  }
  if (peers.length === 0) {
    lines.push('  (no other peers discovered yet)');
  }
  return lines;
}
