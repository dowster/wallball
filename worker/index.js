import { RoomSession, parseMessage, HEARTBEAT_TIMEOUT } from './room.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
const SOCKET_OPEN = 1;
const TICK_INTERVAL_MS = 1000 / 60;
const SNAPSHOT_INTERVAL_MS = 50;
const CHECKPOINT_INTERVAL_MS = 5000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, byte => ALPHABET[byte & 31]).join('');
}

async function createRoom(env) {
  // Every request for a given code maps to the same Durable Object ID.
  // The retry handles a collision with an existing randomly named room.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    const result = await room.fetch(new Request('https://room/create', {
      method: 'POST',
    }));

    if (result.status === 409) continue;

    const body = await result.json();
    return json({ ...body, room: code }, result.status);
  }

  return json({ error: 'Could not create a room. Try again.' }, 503);
}

// This Worker routes HTTP requests. It does not own the match or run physics.
// After the upgrade, WebSocket messages are delivered directly to GameRoom.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Normalize the path-hosted version so assets and APIs share the same code.
    // The trailing slash also makes relative browser URLs resolve correctly.
    if (url.pathname === '/wallball') {
      return Response.redirect(url.origin + '/wallball/' + url.search, 308);
    }
    if (url.pathname.startsWith('/wallball/')) {
      url.pathname = url.pathname.slice('/wallball'.length);
      request = new Request(url, request);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ multiplayer: true });
    }
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    if (request.headers.get('Origin') !== url.origin) {
      return json({ error: 'Use the game website to open a room.' }, 403);
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      return createRoom(env);
    }

    const route = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|socket)$/);
    if (!route || !ROOM_CODE.test(route[1])) {
      return json({ error: 'Room not found. Check the invite code.' }, 404);
    }

    const [, code, action] = route;
    if (action === 'join' && request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405);
    }
    if (action === 'socket') {
      const isUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
      if (request.method !== 'GET' || !isUpgrade) {
        return json({ error: 'A WebSocket connection is required.' }, 426);
      }
    }

    // Forward the handshake to the room owner and return its upgrade response.
    const destination = new URL(request.url);
    destination.pathname = '/' + action;
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(new Request(destination, request));
  },
};

// One instance owns one room's seats, authoritative game state and sockets.
// Cloudflare may discard this JS instance while preserving storage and sockets;
// the constructor rebuilds the instance when the object wakes again.
export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.roomId = ctx.id.toString();
    this.room = null;
    this.timer = null;
    this.lastTick = 0;
    this.lastBroadcast = 0;
    this.lastSave = 0;

    // Prevent messages from using half-restored state during initialization.
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (!saved) return;

      this.room = RoomSession.restore(saved);
      const activeConnections = new Map(
        ctx.getWebSockets()
          .filter(socket => socket.readyState === SOCKET_OPEN)
          .map(socket => {
            const { slot, connectionId } = socket.deserializeAttachment();
            return [slot, connectionId];
          }),
      );

      // A checkpoint can say "connected" after a socket has actually vanished.
      for (let slot = 0; slot < 2; slot++) {
        const seat = this.room.slots[slot];
        if (seat?.connected && activeConnections.get(slot) !== seat.connectionId) {
          this.room.disconnect(slot, seat.connectionId, Date.now());
        }
      }
      this.syncTimer();
    });
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const now = Date.now();

    if (path === '/create') return this.initializeRoom(now);
    if (!this.room) {
      return json({ error: 'Room not found. Check the invite code.' }, 404);
    }
    if (this.room.phase !== 'expired' && now >= this.room.expiresAt) {
      this.room.expire();
      await this.changed();
    }
    if (this.room.phase === 'expired') {
      return json({ error: this.room.reason }, 410);
    }
    if (path === '/join') return this.reserveGuest(now);
    if (path === '/socket') return this.openSocket(request, now);

    return json({ error: 'Not found.' }, 404);
  }

  async initializeRoom(now) {
    if (this.room) return json({ error: 'Room exists.' }, 409);

    const token = crypto.randomUUID();
    this.room = new RoomSession(token, now);
    await this.persist();
    this.log('room_created');
    return json({ token, slot: 0 });
  }

  async reserveGuest(now) {
    const token = crypto.randomUUID();
    try {
      this.room.join(token, now);
    } catch (error) {
      return json({ error: error.message }, 409);
    }

    this.log('player_reserved', { slot: 1 });
    await this.changed();
    return json({ token, slot: 1 });
  }

  async openSocket(request, now) {
    // The token identifies the reserved seat, not an identity supplied in input.
    // It travels in the handshake header, so invite URLs contain no seat token.
    const protocols = request.headers.get('Sec-WebSocket-Protocol')
      ?.split(',').map(protocol => protocol.trim()) || [];
    const token = protocols.find(protocol => protocol.startsWith('session.'))?.slice(8);
    if (!protocols.includes('wallball') || !token) {
      return json({ error: 'Missing player session.' }, 401);
    }

    const connectionId = crypto.randomUUID();
    let slot;
    try {
      slot = this.room.connect(token, connectionId, now);
    } catch (error) {
      return json({ error: error.message }, 401);
    }

    // Return one end to the browser; Cloudflare keeps the server end attached
    // to this Durable Object, even when its JavaScript heap hibernates.
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot, connectionId });
    this.log('player_connected', { slot });

    for (const old of this.ctx.getWebSockets()) {
      if (old !== server && old.deserializeAttachment().slot === slot && old.readyState === SOCKET_OPEN) {
        old.close(4001, 'Connected in another tab.');
      }
    }

    server.send(JSON.stringify({
      type: 'welcome',
      slot,
      state: this.room.snapshot(),
    }));
    await this.changed();

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': 'wallball' },
    });
  }

  async webSocketMessage(socket, raw) {
    if (!this.room) return;

    const { slot, connectionId } = socket.deserializeAttachment();
    let message;
    try {
      message = parseMessage(raw);
    } catch {
      this.log('invalid_message', { slot });
      socket.close(1008, 'Invalid game message.');
      return;
    }

    const previousPhase = this.room.phase;
    this.room.message(slot, connectionId, message, Date.now());
    if (previousPhase !== this.room.phase) {
      this.log('phase_changed', { from: previousPhase, to: this.room.phase, slot });
    }

    // High-frequency input and heartbeats produce no application logs.
    // Input only changes the controls read by the authoritative physics timer.
    if (message.type === 'ping') {
      await this.replyToHeartbeat(socket);
    } else if (message.type !== 'input') {
      await this.changed();
    }
  }

  async replyToHeartbeat(socket) {
    if (this.room.phase === 'expired') {
      await this.changed();
      return;
    }
    if (socket.readyState === SOCKET_OPEN) {
      socket.send(JSON.stringify({ type: 'pong' }));
    }
    // Active games already checkpoint. Idle rooms must save heartbeat metadata
    // because their JS instance can disappear before the next message arrives.
    if (this.room.phase !== 'playing') await this.persist();
  }

  async webSocketClose(socket) {
    await this.disconnected(socket);
  }

  async webSocketError(socket) {
    this.log('socket_error', { slot: socket.deserializeAttachment().slot });
    await this.disconnected(socket);
  }

  async disconnected(socket) {
    if (!this.room) return;

    const { slot, connectionId } = socket.deserializeAttachment();
    const previousPhase = this.room.phase;
    this.room.disconnect(slot, connectionId, Date.now());
    if (previousPhase !== this.room.phase) {
      this.log('player_disconnected', { slot });
    }
    await this.changed();

    try {
      socket.close(1000, 'Connection closed.');
    } catch {
      // The peer or Cloudflare may have already closed this socket.
    }
  }

  syncTimer() {
    if (this.room?.phase === 'playing' && !this.timer) {
      this.lastTick = performance.now();
      this.lastBroadcast = 0;
      this.lastSave = Date.now();
      this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    } else if (this.room?.phase !== 'playing' && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // An active timer keeps the room awake. Without it, waiting/paused rooms
    // can hibernate; their sockets remain connected and alarms can wake them.
  }

  tick() {
    const now = Date.now();
    const clock = performance.now();
    this.checkConnections(now);
    this.room.tick((clock - this.lastTick) / 1000, now);
    this.lastTick = clock;

    // Physics runs at ~60 Hz, but both browsers need snapshots only at ~20 Hz.
    if (clock - this.lastBroadcast >= SNAPSHOT_INTERVAL_MS) {
      this.broadcast();
      this.lastBroadcast = clock;
    }
    if (this.room.phase !== 'playing') {
      this.log('match_stopped', { phase: this.room.phase, winner: this.room.match.winner });
      this.ctx.waitUntil(this.changed());
      return;
    }
    if (now - this.lastSave >= CHECKPOINT_INTERVAL_MS) {
      this.lastSave = now;
      this.ctx.waitUntil(this.persist());
    }
  }

  checkConnections(now) {
    for (const socket of this.ctx.getWebSockets()) {
      const { slot, connectionId } = socket.deserializeAttachment();
      const seat = this.room.slots[slot];
      if (seat?.connected && seat.connectionId === connectionId && now - seat.lastSeen > HEARTBEAT_TIMEOUT) {
        this.room.disconnect(slot, connectionId, now);
        socket.close(4000, 'Connection timed out.');
      }
    }
  }

  broadcast() {
    const data = JSON.stringify({ type: 'state', state: this.room.snapshot() });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== SOCKET_OPEN) continue;
      try {
        socket.send(data);
      } catch {
        // The close/error callback handles the disconnected seat.
      }
    }
  }

  async changed() {
    // Lifecycle changes are sent and saved immediately, unlike periodic ticks.
    this.syncTimer();
    this.broadcast();
    await this.persist();

    if (this.room.phase === 'expired') {
      for (const socket of this.ctx.getWebSockets()) {
        if (socket.readyState === SOCKET_OPEN) socket.close(4002, 'Room closed.');
      }
    }
  }

  async persist() {
    if (this.room.phase === 'expired') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.put('room', this.room.serialize());

    // A platform-managed alarm checks idle connections and expires rooms even
    // when no JavaScript timer or browser request is running.
    const nextCheck = Math.min(this.room.expiresAt, Date.now() + HEARTBEAT_TIMEOUT);
    await this.ctx.storage.setAlarm(nextCheck);
  }

  log(event, fields = {}) {
    // Only lifecycle events and errors reach this logger. Never log tokens,
    // raw messages, heartbeat traffic or frame-by-frame snapshots.
    console.log(JSON.stringify({ event, roomId: this.roomId, ...fields }));
  }

  async alarm() {
    if (!this.room || this.room.phase === 'expired') return;

    const now = Date.now();
    this.checkConnections(now);
    if (now >= this.room.expiresAt) {
      this.room.expire();
      this.log('room_expired');
    }
    await this.changed();
  }
}
