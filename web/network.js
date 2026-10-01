import { HEIGHT } from './engine.js';
export const ROOM_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
export const GAME_BASE = new URL('.', import.meta.url);
export async function roomRequest(path) {
  path = new URL(path.replace(/^\//, ''), GAME_BASE);
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  let body;
  try { body = await response.json(); } catch { throw new Error('Multiplayer is unavailable. Try again in a moment.'); }
  if (!response.ok) throw new Error(body.error || 'Could not open the room.');
  return body;
}
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function movePaddle(y, player, input, dt) {
  const distance = player.speed * dt;
  const change = input.target == null ? input.direction * distance : clamp(input.target - y, -distance, distance);
  return clamp(y + change, player.height / 2, HEIGHT - player.height / 2);
}
export class RemoteClient {
  constructor(room, token, notify) {
    this.room = room; this.token = token; this.notify = notify; this.slot = null; this.state = null;
    this.socket = null; this.closed = false; this.connected = false; this.seq = 0; this.pending = []; this.snapshots = [];
    this.predictedY = HEIGHT / 2; this.lastInput = 0; this.lastFrame = 0; this.retries = 0; this.retryTimer = null;
    this.disconnectAt = null; this.pingSent = 0; this.latency = null;
    this.heartbeat = setInterval(() => { if (this.connected) { this.pingSent = performance.now(); this.send({ type: 'ping' }); } }, 10_000);
    this.connect();
  }
  connect() {
    if (this.closed) return;
    const url = new URL(`api/rooms/${this.room}/socket`, GAME_BASE); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url, ['wallball', `session.${this.token}`]); this.socket = socket;
    socket.onmessage = event => {
      if (socket !== this.socket || this.closed) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'welcome') {
        this.slot = message.slot; this.connected = true; this.retries = 0; this.disconnectAt = null;
        this.seq = 0; this.pending = []; this.snapshots = []; this.lastInput = 0;
      }
      if (message.type === 'pong') { this.latency = Math.round(performance.now() - this.pingSent); return; }
      if (message.state) {
        this.state = message.state; const now = performance.now();
        this.pending = this.pending.filter(input => input.seq > this.state.players[this.slot].ack);
        const player = this.state.match.players[this.slot]; let corrected = player.y;
        if (this.state.phase === 'playing') for (const input of this.pending) corrected = movePaddle(corrected, player, input, 1 / 30);
        else this.pending = [];
        this.predictedY = message.type === 'welcome' || this.state.phase !== 'playing' ? corrected : this.predictedY + (corrected - this.predictedY) * .5;
        this.snapshots.push({ at: now, match: structuredClone(this.state.match) });
        if (this.snapshots.length > 8) this.snapshots.shift();
        this.notify({ type: 'state', state: this.state, slot: this.slot });
      }
    };
    socket.onclose = event => {
      if (socket !== this.socket || this.closed) return;
      this.connected = false; this.pending = [];
      if (event.code === 4001 || event.code === 4002) {
        this.closed = true; clearInterval(this.heartbeat);
        this.notify({ type: 'error', message: event.reason || 'This room has closed.' }); return;
      }
      this.disconnectAt ??= Date.now();
      if (Date.now() - this.disconnectAt >= 60_000) {
        this.closed = true; clearInterval(this.heartbeat); this.notify({ type: 'error', message: 'Could not reconnect. Create a new room to play again.' }); return;
      }
      this.notify({ type: 'disconnected' });
      this.retryTimer = setTimeout(() => this.connect(), Math.min(500 * 2 ** this.retries++, 5000));
    };
    socket.onerror = () => { /* onclose owns retry and error reporting. */ };
  }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  ready() { this.send({ type: 'ready' }); }
  pause() { this.send({ type: 'pause' }); }
  neutral() { if (this.connected) this.send({ type: 'input', direction: 0, target: null, seq: this.seq++ }); }
  frame(now, input) {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, .05) : 0; this.lastFrame = now;
    if (!this.state || this.slot == null) return null;
    if (this.connected && this.state.phase === 'playing') {
      this.predictedY = movePaddle(this.predictedY, this.state.match.players[this.slot], input, dt);
      if (now - this.lastInput >= 1000 / 30) {
        const command = { type: 'input', seq: this.seq++, direction: input.direction, target: input.target ?? null };
        this.send(command); this.pending.push(command); if (this.pending.length > 60) this.pending.shift(); this.lastInput = now;
      }
    }
    const display = structuredClone(this.state.match), at = now - 75;
    const older = this.snapshots.findLast(s => s.at <= at) || this.snapshots[0];
    const newer = this.snapshots.find(s => s.at >= at) || this.snapshots.at(-1);
    if (older && newer && this.state.phase === 'playing') {
      const alpha = older === newer ? 1 : clamp((at - older.at) / (newer.at - older.at), 0, 1);
      for (let i = 0; i < 2; i++) display.players[i].y = older.match.players[i].y + (newer.match.players[i].y - older.match.players[i].y) * alpha;
      for (const b of display.balls) {
        const before = older.match.balls.find(previous => previous.id === b.id), after = newer.match.balls.find(next => next.id === b.id);
        if (before && after) { b.x = before.x + (after.x - before.x) * alpha; b.y = before.y + (after.y - before.y) * alpha; }
      }
      if (this.connected) display.players[this.slot].y = this.predictedY;
    }
    return display;
  }
  destroy() {
    if (!this.closed) this.send({ type: 'leave' });
    this.closed = true; this.connected = false; clearInterval(this.heartbeat); clearTimeout(this.retryTimer);
    this.socket?.close(1000, 'Left room.');
  }
}
