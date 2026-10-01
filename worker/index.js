import { RoomSession, parseMessage, HEARTBEAT_TIMEOUT } from './room.js';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
function json(data, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
function randomCode() { return Array.from(crypto.getRandomValues(new Uint8Array(10)), n => ALPHABET[n & 31]).join(''); }
export default {
  async fetch(request, env) {
    let url = new URL(request.url);
    if (url.pathname === '/wallball') return Response.redirect(url.origin + '/wallball/' + url.search, 308);
    if (url.pathname.startsWith('/wallball/')) {
      url.pathname = url.pathname.slice('/wallball'.length); request = new Request(url, request);
    }
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ multiplayer: true });
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'Use the game website to open a room.' }, 403);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = randomCode(), room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const result = await room.fetch(new Request('https://room/create', { method: 'POST' }));
        if (result.status === 409) continue;
        const body = await result.json(); return json({ ...body, room: code }, result.status);
      }
      return json({ error: 'Could not create a room. Try again.' }, 503);
    }
    const route = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|socket)$/);
    if (!route || !ROOM_CODE.test(route[1])) return json({ error: 'Room not found. Check the invite code.' }, 404);
    if (route[2] === 'join' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (route[2] === 'socket' && (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')) return json({ error: 'A WebSocket connection is required.' }, 426);
    const forwarded = new Request(request); const destination = new URL(forwarded.url); destination.pathname = '/' + route[2];
    return env.ROOMS.get(env.ROOMS.idFromName(route[1])).fetch(new Request(destination, forwarded));
  },
};
export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx; this.room = null; this.timer = null; this.lastTick = 0; this.lastBroadcast = 0; this.lastSave = 0; this.roomId = ctx.id.toString();
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (!saved) return;
      this.room = RoomSession.restore(saved);
      const active = new Map(ctx.getWebSockets().filter(ws => ws.readyState === 1).map(ws => { const a = ws.deserializeAttachment(); return [a.slot, a.connectionId]; }));
      for (let slot = 0; slot < 2; slot++) {
        const seat = this.room.slots[slot];
        if (seat?.connected && active.get(slot) !== seat.connectionId) this.room.disconnect(slot, seat.connectionId, Date.now());
      }
      this.syncTimer();
    });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname, now = Date.now();
    if (path === '/create') {
      if (this.room) return json({ error: 'Room exists.' }, 409);
      const token = crypto.randomUUID(); this.room = new RoomSession(token, now); await this.persist(); this.log('room_created');
      return json({ token, slot: 0 });
    }
    if (!this.room) return json({ error: 'Room not found. Check the invite code.' }, 404);
    if (this.room.phase !== 'expired' && now >= this.room.expiresAt) { this.room.expire(); await this.changed(); }
    if (this.room.phase === 'expired') return json({ error: this.room.reason }, 410);
    if (path === '/join') {
      const token = crypto.randomUUID();
      try { this.room.join(token, now); } catch (error) { return json({ error: error.message }, 409); }
      this.log('player_reserved', { slot: 1 }); await this.changed(); return json({ token, slot: 1 });
    }
    if (path !== '/socket') return json({ error: 'Not found.' }, 404);
    const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(s => s.trim()) || [];
    const token = protocols.find(p => p.startsWith('session.'))?.slice(8);
    if (!protocols.includes('wallball') || !token) return json({ error: 'Missing player session.' }, 401);
    const connectionId = crypto.randomUUID(); let slot;
    try { slot = this.room.connect(token, connectionId, now); } catch (error) { return json({ error: error.message }, 401); }
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ slot, connectionId }); this.log('player_connected', { slot });
    for (const old of this.ctx.getWebSockets()) {
      if (old !== server && old.deserializeAttachment().slot === slot && old.readyState === 1) old.close(4001, 'Connected in another tab.');
    }
    server.send(JSON.stringify({ type: 'welcome', slot, state: this.room.snapshot() }));
    await this.changed();
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'wallball' } });
  }
  async webSocketMessage(ws, raw) {
    if (!this.room) return;
    const { slot, connectionId } = ws.deserializeAttachment(); let message;
    try { message = parseMessage(raw); } catch { this.log('invalid_message', { slot }); ws.close(1008, 'Invalid game message.'); return; }
    const previous = this.room.phase; this.room.message(slot, connectionId, message, Date.now());
    if (previous !== this.room.phase) this.log('phase_changed', { from: previous, to: this.room.phase, slot });
    if (message.type === 'ping') { if (this.room.phase === 'expired') await this.changed(); else { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' })); if (this.room.phase !== 'playing') await this.persist(); } return; }
    if (message.type !== 'input') await this.changed();
  }
  async webSocketClose(ws) { await this.disconnected(ws); }
  async webSocketError(ws) { this.log('socket_error', { slot: ws.deserializeAttachment().slot }); await this.disconnected(ws); }
  async disconnected(ws) {
    if (!this.room) return;
    const { slot, connectionId } = ws.deserializeAttachment();
    const previous = this.room.phase; this.room.disconnect(slot, connectionId, Date.now());
    if (previous !== this.room.phase) this.log('player_disconnected', { slot }); await this.changed();
    try { ws.close(1000, 'Connection closed.'); } catch { /* Already closed. */ }
  }
  syncTimer() {
    if (this.room?.phase === 'playing' && !this.timer) {
      this.lastTick = performance.now(); this.lastBroadcast = 0; this.lastSave = Date.now();
      this.timer = setInterval(() => this.tick(), 1000 / 60);
    } else if (this.room?.phase !== 'playing' && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  tick() {
    const now = Date.now(), clock = performance.now(); this.checkConnections(now);
    this.room.tick((clock - this.lastTick) / 1000, now); this.lastTick = clock;
    if (clock - this.lastBroadcast >= 50) { this.broadcast(); this.lastBroadcast = clock; }
    if (this.room.phase !== 'playing') { this.log('match_stopped', { phase: this.room.phase, winner: this.room.match.winner }); this.ctx.waitUntil(this.changed()); return; }
    if (now - this.lastSave >= 5000) { this.lastSave = now; this.ctx.waitUntil(this.persist()); }
  }
  checkConnections(now) {
    for (const ws of this.ctx.getWebSockets()) {
      const { slot, connectionId } = ws.deserializeAttachment(), seat = this.room.slots[slot];
      if (seat?.connected && seat.connectionId === connectionId && now - seat.lastSeen > HEARTBEAT_TIMEOUT) {
        this.room.disconnect(slot, connectionId, now); ws.close(4000, 'Connection timed out.');
      }
    }
  }
  broadcast() {
    const data = JSON.stringify({ type: 'state', state: this.room.snapshot() });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) { try { ws.send(data); } catch { /* Close callback handles the disconnected seat. */ } }
    }
  }
  async changed() {
    this.syncTimer(); this.broadcast(); await this.persist();
    if (this.room.phase === 'expired') for (const ws of this.ctx.getWebSockets()) if (ws.readyState === 1) ws.close(4002, 'Room closed.');
  }
  async persist() {
    if (this.room.phase === 'expired') { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); return; }
    await this.ctx.storage.put('room', this.room.serialize());
    // Waiting rooms can hibernate; active matches deliberately keep a timer.
    await this.ctx.storage.setAlarm(Math.min(this.room.expiresAt, Date.now() + HEARTBEAT_TIMEOUT));
  }
  log(event, fields = {}) { console.log(JSON.stringify({ event, roomId: this.roomId, ...fields })); }
  async alarm() {
    if (!this.room || this.room.phase === 'expired') return;
    const now = Date.now(); this.checkConnections(now);
    if (now >= this.room.expiresAt) { this.room.expire(); this.log('room_expired'); }
    await this.changed();
  }
}
