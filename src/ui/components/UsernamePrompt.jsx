import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Wordmark from './Wordmark.jsx';

/**
 * First-run username entry screen.
 */
export default function UsernamePrompt({ onSubmit }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (raw) => {
    const name = (raw || '').trim();
    if (!name) {
      setError('Username cannot be empty.');
      return;
    }
    if (name.length > 32) {
      setError('Username must be 32 characters or fewer.');
      return;
    }
    if (name.startsWith('/')) {
      setError('Username cannot start with /.');
      return;
    }
    setError('');
    onSubmit(name);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Wordmark />
      <Text dimColor>Peer-to-peer chat on your local network</Text>
      <Box marginTop={1}>
        <Text>Choose a username: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="e.g. alice"
        />
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
