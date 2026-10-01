import { Match, HEIGHT } from '../web/engine.js';

export const LOBBY_TIMEOUT = 10 * 60_000;
export const RECONNECT_TIMEOUT = 60_000;
export const HEARTBEAT_TIMEOUT = 35_000;

// Keep the network protocol small and discard fields the client cannot control,
// such as player identity, scores and lives. GameRoom supplies the seat identity.
export function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 512) {
    throw new Error('Invalid message.');
  }

  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON.');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('Invalid message.');
  }
  if (['ready', 'pause', 'ping', 'leave'].includes(message.type)) {
    return { type: message.type };
  }

  const validDirection = [-1, 0, 1].includes(message.direction);
  const validSequence = Number.isSafeInteger(message.seq) && message.seq >= 0;
  if (message.type !== 'input' || !validDirection || !validSequence) {
    throw new Error('Invalid input.');
  }
  if (
    message.target != null &&
    (!Number.isFinite(message.target) || message.target < 0 || message.target > HEIGHT)
  ) {
    throw new Error('Invalid target.');
  }

  return {
    type: 'input',
    direction: message.direction,
    seq: message.seq,
    target: message.target ?? null,
  };
}

// Pure room/game logic: no Cloudflare APIs, sockets, timers or storage here.
// GameRoom owns those resources and calls this model from its event handlers.
export class RoomSession {
  constructor(hostToken, now = Date.now()) {
    this.createdAt = now;
    this.expiresAt = now + LOBBY_TIMEOUT;
    this.phase = 'waiting';
    this.reason = null;
    this.slots = [this.seat(hostToken, now), null];
    this.match = new Match({ mode: 'duo' });
    this.match.status = 'paused';
  }

  seat(token, now) {
    return {
      token,
      connected: false,
      connectionId: null,
      ready: false,
      lastSeen: now,
      lastInputAt: 0,
      direction: 0,
      target: null,
      seq: -1,
      rateStart: now,
      rateCount: 0,
    };
  }

  join(token, now) {
    if (this.phase === 'expired' || now >= this.expiresAt) {
      throw new Error('This room has expired.');
    }
    if (this.slots[1]) {
      throw new Error('This room already has two players.');
    }

    this.slots[1] = this.seat(token, now);
    return 1;
  }

  connect(token, connectionId, now) {
    const slot = this.slots.findIndex((seat) => seat?.token === token);
    if (slot < 0 || this.phase === 'expired' || now >= this.expiresAt) {
      throw new Error('This room or player session has expired.');
    }

    const seat = this.slots[slot];
    // A reload can establish its new socket before the old close callback runs.
    // Pause in either order so a player never resumes into a moving match.
    if (this.phase === 'playing' && seat.connected) {
      this.phase = 'paused';
      this.match.status = 'paused';
      this.reason = 'A player reconnected. Both players must choose Resume.';
      this.slots.forEach((player) => {
        player.ready = false;
        player.direction = 0;
        player.target = null;
      });
      this.expiresAt = now + LOBBY_TIMEOUT;
    }

    Object.assign(seat, {
      connected: true,
      connectionId,
      lastSeen: now,
      lastInputAt: 0,
      direction: 0,
      target: null,
      seq: -1,
      rateStart: now,
      rateCount: 0,
    });

    if (this.phase === 'disconnected' && this.slots.every((player) => player?.connected)) {
      this.phase = this.match.status === 'over' ? 'over' : 'paused';
      this.reason =
        this.phase === 'over'
          ? 'Both players must choose Rematch.'
          : 'Reconnected. Both players must choose Resume.';
      this.expiresAt = now + LOBBY_TIMEOUT;
    }
    return slot;
  }

  disconnect(slot, connectionId, now) {
    const seat = this.slots[slot];
    // Ignore a replaced socket's delayed close; it no longer owns this seat.
    if (
      !seat ||
      seat.connectionId !== connectionId ||
      !seat.connected ||
      this.phase === 'expired'
    ) {
      return;
    }

    seat.connected = false;
    seat.direction = 0;
    seat.target = null;
    this.slots.forEach((player) => {
      if (player) player.ready = false;
    });
    this.phase = 'disconnected';
    this.match.status = this.match.status === 'over' ? 'over' : 'paused';
    this.reason = 'A player disconnected. Waiting up to 60 seconds for them to return.';
    this.expiresAt = now + RECONNECT_TIMEOUT;
  }

  message(slot, connectionId, message, now) {
    const seat = this.slots[slot];
    if (!seat?.connected || seat.connectionId !== connectionId || this.phase === 'expired') {
      return;
    }
    if (this.phase !== 'playing' && now >= this.expiresAt) {
      this.expire();
      return;
    }

    seat.lastSeen = now;
    if (message.type === 'leave') {
      this.expire('A player left the room.');
      return;
    }
    if (message.type === 'ping') return;

    if (message.type === 'input') {
      if (now - seat.rateStart >= 1000) {
        seat.rateStart = now;
        seat.rateCount = 0;
      }
      if (++seat.rateCount > 60 || message.seq <= seat.seq) return;

      // Connection liveness and fresh controls have separate clocks. A ping or
      // replayed command must not revive movement from an old held key.
      seat.seq = message.seq;
      seat.lastInputAt = now;
      seat.direction = this.phase === 'playing' ? message.direction : 0;
      seat.target = this.phase === 'playing' ? message.target : null;
      return;
    }

    if (message.type === 'pause' && this.phase === 'playing') {
      this.phase = 'paused';
      this.match.status = 'paused';
      this.reason = 'Both players must choose Resume to continue.';
      this.expiresAt = now + LOBBY_TIMEOUT;
      this.slots.forEach((player) => {
        if (!player) return;
        player.ready = false;
        player.direction = 0;
        player.target = null;
      });
    }

    // Start, resume and rematch all require consent from both connected players.
    if (message.type === 'ready' && ['waiting', 'paused', 'over'].includes(this.phase)) {
      seat.ready = true;
      if (this.slots.every((player) => player?.connected && player.ready)) {
        if (this.phase === 'over') this.match = new Match({ mode: 'duo' });
        this.match.status = 'playing';
        this.phase = 'playing';
        this.reason = null;
        this.slots.forEach((player) => {
          player.ready = false;
          player.direction = 0;
          player.target = null;
        });
        this.expiresAt = now + LOBBY_TIMEOUT;
      }
    }
  }

  tick(dt, now) {
    if (this.phase !== 'playing') return;

    const inputs = {};
    for (let slot = 0; slot < 2; slot++) {
      const seat = this.slots[slot];
      const player = this.match.players[slot];

      if (now - seat.lastInputAt > 250) {
        inputs[slot] = 0;
      } else if (seat.target == null) {
        inputs[slot] = seat.direction;
      } else {
        // Touch targets request a direction. The shared engine still limits
        // movement to paddle speed, so remote clients cannot teleport paddles.
        const distance = seat.target - player.y;
        inputs[slot] = Math.abs(distance) > 2 ? Math.sign(distance) : 0;
      }
    }

    this.match.step(dt, inputs);
    this.expiresAt = now + LOBBY_TIMEOUT;
    if (this.match.status === 'over') {
      this.phase = 'over';
      this.reason = 'Both players must choose Rematch to play again.';
      this.slots.forEach((seat) => {
        seat.ready = false;
      });
    }
  }

  expire(reason = 'This room has expired. Create a new room to play again.') {
    this.phase = 'expired';
    this.reason = reason;
    if (this.match.status !== 'over') this.match.status = 'paused';
    this.slots.forEach((seat) => {
      if (!seat) return;
      seat.ready = false;
      seat.direction = 0;
      seat.target = null;
    });
  }

  snapshot() {
    // Public state goes to both browsers. Seat tokens and connection IDs are
    // deliberately excluded; they belong only in the private checkpoint.
    const match = this.match;
    return {
      phase: this.phase,
      reason: this.reason,
      expiresAt: this.expiresAt,
      players: this.slots.map((seat) => ({
        connected: !!seat?.connected,
        ready: !!seat?.ready,
        ack: seat?.seq ?? -1,
      })),
      match: {
        players: match.players.map((player) => ({ ...player })),
        balls: match.balls.map((ball) => ({ ...ball })),
        time: match.time,
        serveIn: match.serveIn,
        powerup: match.powerup && { ...match.powerup },
        effect: match.effect && { ...match.effect },
        status: match.status,
        winner: match.winner,
      },
    };
  }

  serialize() {
    return {
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      phase: this.phase,
      reason: this.reason,
      slots: this.slots,
      match: { ...this.snapshot().match, nextBallId: this.match.nextBallId },
    };
  }

  static restore(saved) {
    const room = new RoomSession(saved.slots[0].token, saved.createdAt);
    Object.assign(room, saved);
    // Restore data onto an engine instance so its physics methods still exist.
    room.match = Object.assign(new Match({ mode: 'duo' }), saved.match);
    return room;
  }
}
