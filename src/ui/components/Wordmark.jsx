import React from 'react';
import { Text } from 'ink';

/** LANterm wordmark — LAN in accent, term in default heading color. */
export default function Wordmark({ color = 'cyan' }) {
  return (
    <Text bold>
      <Text color="yellow">LAN</Text>
      <Text color={color}>term</Text>
    </Text>
  );
}
