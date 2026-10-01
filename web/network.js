import { HEIGHT, clamp } from './constants.js';

export const ROOM_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
export const GAME_BASE = new URL('.', import.meta.url);
const INPUT_INTERVAL_MS = 1000 / 30;
const INTERPOLATION_DELAY_MS = 75;
const RECONNECT_TIMEOUT_MS = 60_000;

export async function roomRequest(path) {
  const url = new URL(path.replace(/^\//, ''), GAME_BASE);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Multiplayer is unavailable. Try again in a moment.');
  }
  if (!response.ok) throw new Error(body.error || 'Could not open the room.');
  return body;
}

// Prediction affects rendering only. The server independently limits movement
// and decides collisions, scores and lives using its authoritative paddle.
export function movePaddle(y, player, input, seconds) {
  const distance = player.speed * seconds;
  const change =
    input.target == null
      ? input.direction * distance
      : clamp(input.target - y, -distance, distance);
  return clamp(y + change, player.height / 2, HEIGHT - player.height / 2);
}

export class RemoteClient {
  constructor(room, token, notify) {
    this.room = room;
    this.token = token;
    this.notify = notify;
    this.slot = null;
    this.state = null;
    this.socket = null;
    this.closed = false;
    this.connected = false;
    this.seq = 0;
    this.pending = [];
    this.snapshots = [];
    this.predictedY = HEIGHT / 2;
    this.lastInput = 0;
    this.lastFrame = 0;
    this.retries = 0;
    this.retryTimer = null;
    this.disconnectAt = null;
    this.pingSent = 0;
    this.latency = null;

    this.heartbeat = setInterval(() => {
      if (!this.connected) return;
      this.pingSent = performance.now();
      this.send({ type: 'ping' });
    }, 10_000);
    this.connect();
  }

  connect() {
    if (this.closed) return;
    const url = new URL(`api/rooms/${this.room}/socket`, GAME_BASE);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    // The capability token identifies a reserved seat; it never enters invites.
    const socket = new WebSocket(url, ['wallball', `session.${this.token}`]);
    this.socket = socket;
    socket.onmessage = (event) => {
      if (socket !== this.socket || this.closed) return;
      this.receive(event.data);
    };
    socket.onclose = (event) => {
      if (socket !== this.socket || this.closed) return;
      this.disconnected(event);
    };
    socket.onerror = () => {
      // onclose owns retries and error reporting to avoid duplicate attempts.
    };
  }

  receive(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'welcome') {
      this.slot = message.slot;
      this.connected = true;
      this.retries = 0;
      this.disconnectAt = null;
      this.seq = 0;
      this.pending = [];
      this.snapshots = [];
      this.lastInput = 0;
    }
    if (message.type === 'pong') {
      this.latency = Math.round(performance.now() - this.pingSent);
      return;
    }
    if (message.state) this.acceptState(message);
  }

  acceptState(message) {
    this.state = message.state;
    const player = this.state.match.players[this.slot];
    const acknowledged = this.state.players[this.slot].ack;
    this.pending = this.pending.filter((input) => input.seq > acknowledged);

    // Start from the server's paddle and replay inputs it has not acknowledged.
    // Blend corrections so network timing doesn't visibly snap your paddle.
    let corrected = player.y;
    if (this.state.phase === 'playing') {
      for (const input of this.pending) corrected = movePaddle(corrected, player, input, 1 / 30);
    } else {
      this.pending = [];
    }
    this.predictedY =
      message.type === 'welcome' || this.state.phase !== 'playing'
        ? corrected
        : this.predictedY + (corrected - this.predictedY) * 0.5;

    this.snapshots.push({ at: performance.now(), match: structuredClone(this.state.match) });
    if (this.snapshots.length > 8) this.snapshots.shift();
    this.notify({ type: 'state', state: this.state, slot: this.slot });
  }

  disconnected(event) {
    this.connected = false;
    this.pending = [];
    if (event.code === 4001 || event.code === 4002) {
      this.fail(event.reason || 'This room has closed.');
      return;
    }

    this.disconnectAt ??= Date.now();
    if (Date.now() - this.disconnectAt >= RECONNECT_TIMEOUT_MS) {
      this.fail('Could not reconnect. Create a new room to play again.');
      return;
    }
    this.notify({ type: 'disconnected' });
    const retryDelay = Math.min(500 * 2 ** this.retries++, 5000);
    this.retryTimer = setTimeout(() => this.connect(), retryDelay);
  }

  fail(message) {
    this.closed = true;
    clearInterval(this.heartbeat);
    this.notify({ type: 'error', message });
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  ready() {
    this.send({ type: 'ready' });
  }
  pause() {
    this.send({ type: 'pause' });
  }

  neutral() {
    if (this.connected) {
      this.send({ type: 'input', direction: 0, target: null, seq: this.seq++ });
    }
  }

  frame(now, input) {
    const elapsed = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    if (!this.state || this.slot == null) return null;

    if (this.connected && this.state.phase === 'playing') {
      this.predictedY = movePaddle(
        this.predictedY,
        this.state.match.players[this.slot],
        input,
        elapsed,
      );
      this.sendInput(now, input);
    }
    return this.interpolate(now);
  }

  sendInput(now, input) {
    if (now - this.lastInput < INPUT_INTERVAL_MS) return;
    const command = {
      type: 'input',
      seq: this.seq++,
      direction: input.direction,
      target: input.target ?? null,
    };
    this.send(command);
    this.pending.push(command);
    if (this.pending.length > 60) this.pending.shift();
    this.lastInput = now;
  }

  interpolate(now) {
    const display = structuredClone(this.state.match);
    const renderTime = now - INTERPOLATION_DELAY_MS;
    const older =
      this.snapshots.findLast((snapshot) => snapshot.at <= renderTime) || this.snapshots[0];
    const newer =
      this.snapshots.find((snapshot) => snapshot.at >= renderTime) || this.snapshots.at(-1);
    if (!older || !newer || this.state.phase !== 'playing') return display;

    // Draw the remote world slightly behind real time, between two snapshots.
    const progress =
      older === newer ? 1 : clamp((renderTime - older.at) / (newer.at - older.at), 0, 1);
    for (let slot = 0; slot < 2; slot++) {
      const before = older.match.players[slot].y;
      const after = newer.match.players[slot].y;
      display.players[slot].y = before + (after - before) * progress;
    }
    for (const ball of display.balls) {
      const before = older.match.balls.find((previous) => previous.id === ball.id);
      const after = newer.match.balls.find((next) => next.id === ball.id);
      if (!before || !after) continue;
      ball.x = before.x + (after.x - before.x) * progress;
      ball.y = before.y + (after.y - before.y) * progress;
    }
    if (this.connected) display.players[this.slot].y = this.predictedY;
    return display;
  }

  destroy() {
    if (!this.closed) this.send({ type: 'leave' });
    this.closed = true;
    this.connected = false;
    clearInterval(this.heartbeat);
    clearTimeout(this.retryTimer);
    this.socket?.close(1000, 'Left room.');
  }
}
