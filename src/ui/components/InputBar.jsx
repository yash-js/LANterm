import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

/**
 * Fixed input row at the bottom of the chat screen.
 */
export default function InputBar({ value, onChange, onSubmit }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} width="100%">
      <Text bold color="cyan">
        {'> '}
      </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="message or /command"
      />
    </Box>
  );
}
