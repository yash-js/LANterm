import React from 'react';
import { Box, Text } from 'ink';
import { colorForName } from '../colors.js';
import Wordmark from './Wordmark.jsx';

/**
 * Top bar: app name, you, and live connected usernames.
 * @param {{ username: string, peers: { peerId: string, username: string }[] }} props
 */
export default function Header({ username, peers }) {
  const names = peers.map((p) => p.username);
  const count = names.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      width="100%"
    >
      <Box justifyContent="space-between" width="100%">
        <Wordmark />
        <Text>
          <Text dimColor>as </Text>
          <Text color="green">{username}</Text>
          <Text dimColor>
            {'  ·  '}
            {count} online
          </Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>connected: </Text>
        {count === 0 ? (
          <Text dimColor italic>
            (none yet)
          </Text>
        ) : (
          names.map((name, i) => (
            <Text key={`${name}-${i}`}>
              {i > 0 ? <Text dimColor>, </Text> : null}
              <Text color={colorForName(name)}>{name}</Text>
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
