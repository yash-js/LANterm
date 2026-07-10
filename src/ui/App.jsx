import React, { useState, useEffect, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { v4 as uuidv4 } from 'uuid';

import { saveConfig } from '../config.js';
import { LantermNet } from '../net.js';
import { parseCommand, HELP_LINES } from '../commands.js';
import { checkForUpdate, installUpdate } from '../update.js';
import { VERSION } from '../version.js';
import Header from './components/Header.jsx';
import MessageFeed from './components/MessageFeed.jsx';
import InputBar from './components/InputBar.jsx';
import UsernamePrompt from './components/UsernamePrompt.jsx';
import { formatPeerLines } from './components/PeerList.jsx';

const MAX_FEED_LINES = 200;

/**
 * Append a line to the feed, keeping only the last MAX_FEED_LINES.
 * @param {object[]} prev
 * @param {object} line
 */
function pushLine(prev, line) {
  const next = [...prev, line];
  if (next.length > MAX_FEED_LINES) {
    return next.slice(next.length - MAX_FEED_LINES);
  }
  return next;
}

/**
 * Main Ink application — username prompt or chat screen.
 */
export default function App({ initialConfig }) {
  const { exit } = useApp();
  const [config, setConfig] = useState(initialConfig);
  const [username, setUsername] = useState(initialConfig.username);
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  /** @type {[ { peerId: string, username: string }[], Function ]} */
  const [peers, setPeers] = useState([]);

  /** @type {React.MutableRefObject<LantermNet | null>} */
  const netRef = useRef(null);
  const shuttingDown = useRef(false);
  const usernameRef = useRef(username);
  usernameRef.current = username;

  // Gate networking on "has a username" — do NOT restart the socket on /nick
  const ready = Boolean(username);

  const addSystem = (text) => {
    setLines((prev) =>
      pushLine(prev, { id: uuidv4(), kind: 'system', text, ts: Date.now() }),
    );
  };

  const syncPeers = () => {
    const net = netRef.current;
    if (net) setPeers(net.getPeers());
  };

  const shutdown = () => {
    if (shuttingDown.current) return;
    shuttingDown.current = true;
    if (netRef.current) {
      try {
        netRef.current.stop();
      } catch {
        // ignore
      }
      netRef.current = null;
    }
    exit();
  };

  // Ctrl+C / Ctrl+D → graceful bye + exit
  useInput((inputChar, key) => {
    if (key.ctrl && (inputChar === 'c' || inputChar === 'd')) {
      shutdown();
    }
  });

  // Start networking once we have a username (first run or returning user)
  useEffect(() => {
    if (!ready) return undefined;

    const net = new LantermNet({
      peerId: config.peerId,
      username: usernameRef.current,
      port: config.discoveryPort,
    });
    netRef.current = net;

    const onJoin = ({ username: name }) => {
      addSystem(`${name} joined`);
      syncPeers();
    };
    const onLeave = ({ username: name }) => {
      addSystem(`${name} left`);
      syncPeers();
    };
    const onNick = ({ oldName, newName }) => {
      addSystem(`${oldName} is now ${newName}`);
      syncPeers();
    };
    const onMessage = (msg) => {
      setLines((prev) =>
        pushLine(prev, {
          id: msg.msgId,
          kind: 'chat',
          username: msg.username,
          text: msg.text,
          ts: msg.ts,
          own: false,
        }),
      );
    };

    net.on('join', onJoin);
    net.on('leave', onLeave);
    net.on('nick', onNick);
    net.on('message', onMessage);

    let cancelled = false;
    net
      .start()
      .then(() => {
        if (!cancelled) {
          addSystem(`Connected on UDP port ${config.discoveryPort}. LANterm v${VERSION}. Say hello!`);
          syncPeers();

          checkForUpdate()
            .then((info) => {
              if (!cancelled && info.available) {
                addSystem(
                  `Update available: v${info.latest} (you have v${info.current}). Run /update install`,
                );
              }
            })
            .catch(() => {
              // Offline or API unreachable — stay quiet
            });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          addSystem(`Network error: ${err.message || err}`);
        }
      });

    const onSigInt = () => shutdown();
    process.once('SIGINT', onSigInt);
    process.once('SIGTERM', onSigInt);

    return () => {
      cancelled = true;
      process.off('SIGINT', onSigInt);
      process.off('SIGTERM', onSigInt);
      net.off('join', onJoin);
      net.off('leave', onLeave);
      net.off('nick', onNick);
      net.off('message', onMessage);
      if (!shuttingDown.current) {
        try {
          net.stop();
        } catch {
          // ignore
        }
      }
      if (netRef.current === net) netRef.current = null;
    };
    // ready flips once; peerId/port are stable for the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config.peerId, config.discoveryPort]);

  const handleUsernameChosen = (name) => {
    const next = { ...config, username: name };
    saveConfig(next);
    setConfig(next);
    setUsername(name);
  };

  const handleSubmit = (raw) => {
    const text = (raw || '').trim();
    setInput('');
    if (!text) return;

    const net = netRef.current;
    const { command, args } = parseCommand(text);

    if (command === null) {
      // Normal chat message — render locally, then broadcast
      if (!net) return;
      const msgId = net.sendMessage(text);
      setLines((prev) =>
        pushLine(prev, {
          id: msgId,
          kind: 'chat',
          username,
          text,
          ts: Date.now(),
          own: true,
        }),
      );
      return;
    }

    switch (command) {
      case 'nick': {
        if (!args) {
          addSystem('Usage: /nick <newname>');
          return;
        }
        if (args.length > 32) {
          addSystem('Username must be 32 characters or fewer.');
          return;
        }
        if (args.startsWith('/')) {
          addSystem('Username cannot start with /.');
          return;
        }
        const old = username;
        const next = { ...config, username: args };
        saveConfig(next);
        setConfig(next);
        setUsername(args);
        if (net) net.setUsername(args);
        addSystem(`You are now ${args} (was ${old})`);
        break;
      }
      case 'peers': {
        const peers = net ? net.getPeers() : [];
        for (const line of formatPeerLines(peers, username)) {
          addSystem(line);
        }
        break;
      }
      case 'clear':
        setLines([]);
        break;
      case 'help':
        for (const line of HELP_LINES) addSystem(line);
        break;
      case 'update': {
        const sub = (args || 'check').toLowerCase();
        if (sub === 'install') {
          addSystem('Checking for updates…');
          installUpdate((msg) => addSystem(msg))
            .then((result) => {
              addSystem(`LANterm v${result.latest} ready. Quitting to apply update…`);
              setTimeout(() => shutdown(), 500);
            })
            .catch((err) => addSystem(err.message || String(err)));
        } else if (sub === 'check' || sub === '') {
          addSystem('Checking for updates…');
          checkForUpdate()
            .then((info) => {
              if (info.available) {
                addSystem(
                  `Update available: v${info.latest} (you have v${info.current}). Run /update install`,
                );
              } else {
                addSystem(`LANterm v${info.current} is up to date.`);
              }
            })
            .catch((err) => addSystem(`Update check failed: ${err.message || err}`));
        } else {
          addSystem('Usage: /update  or  /update install');
        }
        break;
      }
      case 'quit':
        shutdown();
        break;
      case 'unknown':
        addSystem(`Unknown command: /${args}. Try /help`);
        break;
      default:
        break;
    }
  };

  // First-run: pick a username before joining the LAN
  if (!username) {
    return <UsernamePrompt onSubmit={handleUsernameChosen} />;
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header username={username} peers={peers} />
      <MessageFeed lines={lines} />
      <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} />
    </Box>
  );
}
