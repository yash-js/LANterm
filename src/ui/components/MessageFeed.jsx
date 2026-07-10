import React from 'react';
import { Box, Text } from 'ink';
import { colorForName, formatTime } from '../colors.js';

/**
 * Scrollable (bounded) chat feed.
 * @param {{ lines: Array<{ id: string, kind: string, text?: string, username?: string, ts?: number, own?: boolean }> }} props
 */
export default function MessageFeed({ lines }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={0}>
      {lines.length === 0 ? (
        <Text dimColor italic>
          Waiting for peers on the LAN… type a message or /help
        </Text>
      ) : (
        lines.map((line) => <FeedLine key={line.id} line={line} />)
      )}
    </Box>
  );
}

function FeedLine({ line }) {
  if (line.kind === 'system') {
    return (
      <Text dimColor italic>
        {line.text}
      </Text>
    );
  }

  const time = formatTime(line.ts);
  const nameColor = line.own ? 'green' : colorForName(line.username || '?');

  return (
    <Text>
      <Text dimColor>{time} </Text>
      <Text bold color={nameColor}>
        {line.username}
      </Text>
      <Text dimColor>: </Text>
      <Text color={line.own ? 'green' : undefined}>{line.text}</Text>
    </Text>
  );
}
