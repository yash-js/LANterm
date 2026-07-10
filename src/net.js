/**
 * UDP peer discovery + messaging for LANterm.
 * Single socket on a fixed port; all traffic is JSON broadcast over the LAN.
 */

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';

const LIMITED_BROADCAST = '255.255.255.255';
const HEARTBEAT_MS = 3000;
const PRUNE_MS = 2000;
const PEER_TIMEOUT_MS = 10_000;
const SEEN_MSG_LIMIT = 500;

/**
 * Collect destinations for LAN fan-out:
 * - limited broadcast 255.255.255.255 (works across most home Wi‑Fi)
 * - per-interface subnet broadcast (more reliable on some Windows setups)
 * - own LAN IPv4 addresses (so multiple local instances can see each other)
 * @returns {string[]}
 */
function getFanoutAddresses() {
  const addrs = new Set([LIMITED_BROADCAST]);

  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      addrs.add(iface.address);
      const directed = subnetBroadcast(iface.address, iface.netmask);
      if (directed) addrs.add(directed);
    }
  }

  return [...addrs];
}

/**
 * @param {string} address
 * @param {string} netmask
 * @returns {string | null}
 */
function subnetBroadcast(address, netmask) {
  const ip = ipv4ToInt(address);
  const mask = ipv4ToInt(netmask);
  if (ip === null || mask === null) return null;
  return intToIpv4((ip & mask) | (~mask >>> 0));
}

/** @param {string} ip @returns {number | null} */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/** @param {number} n @returns {string} */
function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export class LantermNet extends EventEmitter {
  /**
   * @param {{ peerId: string, username: string, port?: number }} opts
   */
  constructor(opts) {
    super();
    this.peerId = opts.peerId;
    this.username = opts.username;
    this.port = opts.port || 47474;

    /** @type {Map<string, { username: string, lastSeen: number }>} */
    this.peers = new Map();

    /** @type {Set<string>} */
    this.seenMsgIds = new Set();
    /** @type {string[]} */
    this.seenMsgOrder = [];

    this.socket = null;
    this.heartbeatTimer = null;
    this.pruneTimer = null;
    this._started = false;
  }

  /**
   * Bind the UDP socket and start heartbeat / prune loops.
   * @returns {Promise<void>}
   */
  start() {
    if (this._started) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = socket;

      socket.on('error', (err) => {
        this.emit('error', err);
        if (!this._started) reject(err);
      });

      socket.on('message', (buf, rinfo) => {
        this._onMessage(buf, rinfo);
      });

      socket.bind(this.port, '0.0.0.0', () => {
        try {
          socket.setBroadcast(true);
        } catch {
          // Some platforms may already have broadcast enabled
        }

        this._started = true;
        this._sendHello();
        this.heartbeatTimer = setInterval(() => this._sendHello(), HEARTBEAT_MS);
        this.pruneTimer = setInterval(() => this._prunePeers(), PRUNE_MS);

        // Unref so timers alone don't keep the process alive after quit
        if (typeof this.heartbeatTimer.unref === 'function') {
          this.heartbeatTimer.unref();
        }
        if (typeof this.pruneTimer.unref === 'function') {
          this.pruneTimer.unref();
        }

        resolve();
      });
    });
  }

  /**
   * Broadcast a graceful leave and tear down the socket.
   */
  stop() {
    this._sendBye();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = null;
    }

    this._started = false;
  }

  /**
   * Update local username and announce the change.
   * @param {string} newName
   */
  setUsername(newName) {
    const oldName = this.username;
    this.username = newName;
    this._broadcast({
      type: 'nick',
      peerId: this.peerId,
      oldName,
      newName,
      ts: Date.now(),
    });
  }

  /**
   * Broadcast a chat message. Returns the msgId used.
   * @param {string} text
   * @returns {string}
   */
  sendMessage(text) {
    const msgId = uuidv4();
    this._rememberMsgId(msgId);
    this._broadcast({
      type: 'msg',
      peerId: this.peerId,
      username: this.username,
      msgId,
      text,
      ts: Date.now(),
    });
    return msgId;
  }

  /**
   * Snapshot of currently online peers (excluding self).
   * @returns {{ peerId: string, username: string }[]}
   */
  getPeers() {
    const list = [];
    for (const [peerId, info] of this.peers) {
      list.push({ peerId, username: info.username });
    }
    return list;
  }

  /**
   * Online peer count (excluding self).
   * @returns {number}
   */
  getPeerCount() {
    return this.peers.size;
  }

  // ── internals ──────────────────────────────────────────────

  /**
   * @param {Buffer} buf
   * @param {import('node:dgram').RemoteInfo} _rinfo
   */
  _onMessage(buf, _rinfo) {
    let packet;
    try {
      packet = JSON.parse(buf.toString('utf8'));
    } catch {
      return; // malformed — ignore silently
    }

    if (!packet || typeof packet !== 'object' || !packet.type) return;

    const { type, peerId } = packet;
    if (!peerId || typeof peerId !== 'string') return;

    // Never treat our own packets as remote presence (except we still
    // dedup msg ids so rebroadcasts don't confuse us).
    switch (type) {
      case 'hello':
        this._handleHello(packet);
        break;
      case 'bye':
        this._handleBye(packet);
        break;
      case 'msg':
        this._handleMsg(packet);
        break;
      case 'nick':
        this._handleNick(packet);
        break;
      default:
        break;
    }
  }

  /**
   * @param {{ peerId: string, username?: string, ts?: number }} packet
   */
  _handleHello(packet) {
    if (packet.peerId === this.peerId) return;

    const username =
      typeof packet.username === 'string' && packet.username
        ? packet.username
        : 'unknown';
    const existing = this.peers.get(packet.peerId);

    if (!existing) {
      this.peers.set(packet.peerId, { username, lastSeen: Date.now() });
      this.emit('join', { peerId: packet.peerId, username });
    } else {
      // Heartbeat — refresh lastSeen; pick up silent nick drift
      existing.lastSeen = Date.now();
      if (existing.username !== username) {
        const oldName = existing.username;
        existing.username = username;
        this.emit('nick', {
          peerId: packet.peerId,
          oldName,
          newName: username,
        });
      }
    }
  }

  /**
   * @param {{ peerId: string }} packet
   */
  _handleBye(packet) {
    if (packet.peerId === this.peerId) return;

    const existing = this.peers.get(packet.peerId);
    if (existing) {
      this.peers.delete(packet.peerId);
      this.emit('leave', { peerId: packet.peerId, username: existing.username });
    }
  }

  /**
   * @param {{ peerId: string, username?: string, msgId?: string, text?: string, ts?: number }} packet
   */
  _handleMsg(packet) {
    if (!packet.msgId || typeof packet.msgId !== 'string') return;
    if (typeof packet.text !== 'string') return;

    // Deduplicate (including our own echoes from the wire)
    if (this.seenMsgIds.has(packet.msgId)) return;
    this._rememberMsgId(packet.msgId);

    // Own messages are rendered locally at send time — skip echo display
    if (packet.peerId === this.peerId) return;

    const username =
      typeof packet.username === 'string' && packet.username
        ? packet.username
        : 'unknown';

    // Refresh presence from chat traffic
    if (!this.peers.has(packet.peerId)) {
      this.peers.set(packet.peerId, { username, lastSeen: Date.now() });
      this.emit('join', { peerId: packet.peerId, username });
    } else {
      const p = this.peers.get(packet.peerId);
      p.lastSeen = Date.now();
      p.username = username;
    }

    this.emit('message', {
      peerId: packet.peerId,
      username,
      msgId: packet.msgId,
      text: packet.text,
      ts: packet.ts || Date.now(),
      own: false,
    });
  }

  /**
   * @param {{ peerId: string, oldName?: string, newName?: string }} packet
   */
  _handleNick(packet) {
    if (packet.peerId === this.peerId) return;
    if (typeof packet.newName !== 'string' || !packet.newName) return;

    const existing = this.peers.get(packet.peerId);
    const oldName =
      (typeof packet.oldName === 'string' && packet.oldName) ||
      existing?.username ||
      'unknown';

    if (existing) {
      existing.username = packet.newName;
      existing.lastSeen = Date.now();
    } else {
      this.peers.set(packet.peerId, {
        username: packet.newName,
        lastSeen: Date.now(),
      });
      this.emit('join', { peerId: packet.peerId, username: packet.newName });
    }

    this.emit('nick', {
      peerId: packet.peerId,
      oldName,
      newName: packet.newName,
    });
  }

  _prunePeers() {
    const now = Date.now();
    for (const [peerId, info] of this.peers) {
      if (now - info.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(peerId);
        this.emit('leave', { peerId, username: info.username });
      }
    }
  }

  _sendHello() {
    this._broadcast({
      type: 'hello',
      peerId: this.peerId,
      username: this.username,
      ts: Date.now(),
    });
  }

  _sendBye() {
    this._broadcast({
      type: 'bye',
      peerId: this.peerId,
      ts: Date.now(),
    });
  }

  /**
   * @param {object} packet
   */
  _broadcast(packet) {
    if (!this.socket) return;

    let buf;
    try {
      buf = Buffer.from(JSON.stringify(packet), 'utf8');
    } catch {
      return;
    }

    const destinations = getFanoutAddresses();
    let sent = false;

    for (const host of destinations) {
      try {
        this.socket.send(buf, 0, buf.length, this.port, host);
        sent = true;
      } catch {
        // try next destination
      }
    }

    // Last-resort fallback if every send threw
    if (!sent) {
      try {
        this.socket.send(buf, 0, buf.length, this.port, LIMITED_BROADCAST);
      } catch {
        // Give up quietly — UI stays responsive
      }
    }
  }

  /**
   * Bounded FIFO set of seen message IDs.
   * @param {string} msgId
   */
  _rememberMsgId(msgId) {
    if (this.seenMsgIds.has(msgId)) return;
    this.seenMsgIds.add(msgId);
    this.seenMsgOrder.push(msgId);
    while (this.seenMsgOrder.length > SEEN_MSG_LIMIT) {
      const old = this.seenMsgOrder.shift();
      this.seenMsgIds.delete(old);
    }
  }
}
