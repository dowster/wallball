import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomSession, parseMessage, RECONNECT_TIMEOUT } from '../worker/room.js';
const now = 1_000_000;
function connected() {
  const room = new RoomSession('host', now);
  room.join('guest', now);
  room.connect('host', 'h', now);
  room.connect('guest', 'g', now);
  return room;
}
function ready(room) {
  room.message(0, 'h', { type: 'ready' }, now);
  room.message(1, 'g', { type: 'ready' }, now);
}
test('two seats, valid tokens, both players must be ready', () => {
  const room = connected();
  assert.throws(() => room.join('third', now), /two players/);
  assert.throws(() => room.connect('invalid', 'x', now), /expired/);
  room.message(0, 'h', { type: 'ready' }, now);
  assert.equal(room.phase, 'waiting');
  room.message(1, 'g', { type: 'ready' }, now);
  assert.equal(room.phase, 'playing');
  assert.ok(!JSON.stringify(room.snapshot()).includes('host'));
  assert.ok(!JSON.stringify(room.snapshot()).includes('guest'));
});
test('strict protocol rejects oversized, nonfinite, spoofed and malformed inputs', () => {
  for (const data of [
    'null',
    '[]',
    'broken',
    JSON.stringify({ type: 'input', direction: 5, seq: 0 }),
    JSON.stringify({ type: 'input', direction: 0, seq: 0, target: 10000 }),
    JSON.stringify({ type: 'input', direction: 0, seq: -1 }),
    'x'.repeat(513),
  ])
    assert.throws(() => parseMessage(data));
  assert.deepEqual(
    parseMessage(JSON.stringify({ type: 'input', direction: 1, seq: 2, slot: 1, points: 100 })),
    { type: 'input', direction: 1, seq: 2, target: null },
  );
});
test('server input cannot teleport, choose another seat, replay sequence or move indefinitely', () => {
  const room = connected();
  ready(room);
  room.message(
    0,
    'h',
    parseMessage(JSON.stringify({ type: 'input', direction: 0, target: 500, seq: 1, slot: 1 })),
    now,
  );
  room.tick(0.1, now + 100);
  assert.ok(room.match.players[0].y <= 280.001);
  assert.equal(room.match.players[1].y, 250);
  room.message(0, 'h', { type: 'input', direction: -1, target: null, seq: 0 }, now + 100);
  assert.equal(room.slots[0].target, 500);
  const y = room.match.players[0].y;
  room.tick(0.1, now + 500);
  assert.equal(room.match.players[0].y, y);
  room.message(0, 'stale', { type: 'input', direction: -1, target: null, seq: 9 }, now + 500);
  assert.equal(room.slots[0].seq, 1);
});
test('pause and reconnect reserve the seat and require mutual resume', () => {
  const room = connected();
  ready(room);
  room.message(0, 'h', { type: 'pause' }, now + 1);
  assert.equal(room.phase, 'paused');
  room.message(0, 'h', { type: 'ready' }, now + 2);
  assert.equal(room.phase, 'paused');
  room.message(1, 'g', { type: 'ready' }, now + 2);
  assert.equal(room.phase, 'playing');
  room.disconnect(1, 'g', now + 3);
  assert.equal(room.phase, 'disconnected');
  assert.equal(room.expiresAt, now + 3 + RECONNECT_TIMEOUT);
  const time = room.match.time;
  room.tick(0.1, now + 4);
  assert.equal(room.match.time, time);
  room.connect('guest', 'g2', now + 4);
  assert.equal(room.phase, 'paused');
  room.disconnect(1, 'g', now + 5);
  assert.equal(room.slots[1].connected, true);
  room.message(0, 'h', { type: 'ready' }, now + 5);
  room.message(1, 'g2', { type: 'ready' }, now + 5);
  assert.equal(room.phase, 'playing');
});
test('room restore retains game state and supports consensual rematch', () => {
  const room = connected();
  ready(room);
  room.match.players[0].points = 42;
  room.match.spawnBall();
  const restored = RoomSession.restore(structuredClone(room.serialize()));
  assert.equal(restored.match.players[0].points, 42);
  assert.equal(restored.match.balls.length, 1);
  restored.tick(0.02, now + 20);
  assert.ok(restored.match.time > 0);
  restored.match.status = 'over';
  restored.match.winner = 1;
  restored.tick(0.02, now + 30);
  assert.equal(restored.phase, 'over');
  ready(restored);
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.match.players[0].points, 0);
  assert.equal(restored.match.players[0].lives, 10);
});
test('expired lobbies cannot start; leaving closes the room; input rate is bounded', () => {
  const room = connected();
  ready(room);
  for (let seq = 0; seq < 100; seq++)
    room.message(0, 'h', { type: 'input', direction: 1, target: null, seq }, now);
  assert.equal(room.slots[0].seq, 59);
  room.message(0, 'h', { type: 'leave' }, now);
  assert.equal(room.phase, 'expired');
  const stale = connected();
  stale.message(0, 'h', { type: 'ready' }, stale.expiresAt + 1);
  assert.equal(stale.phase, 'expired');
  assert.throws(() => stale.connect('host', 'h2', now), /expired/);
});
test('replacing an active socket pauses fairly and old close events cannot evict the new socket', () => {
  const room = connected();
  ready(room);
  room.connect('guest', 'g2', now + 1);
  assert.equal(room.phase, 'paused');
  room.disconnect(1, 'g', now + 2);
  assert.equal(room.slots[1].connected, true);
});
test('reconnecting after game over still requires a fresh rematch, not a zero-life resume', () => {
  const room = connected();
  ready(room);
  room.match.status = 'over';
  room.match.players[0].lives = 0;
  room.tick(0.01, now + 1);
  room.disconnect(1, 'g', now + 2);
  room.connect('guest', 'g2', now + 3);
  assert.equal(room.phase, 'over');
  room.message(0, 'h', { type: 'ready' }, now + 4);
  room.message(1, 'g2', { type: 'ready' }, now + 4);
  assert.equal(room.phase, 'playing');
  assert.equal(room.match.players[0].lives, 10);
});
test('heartbeats and replayed input do not restart movement after fresh input times out', () => {
  const room = connected();
  ready(room);
  room.message(0, 'h', { type: 'input', seq: 0, direction: 1, target: null }, now);
  room.tick(0.1, now + 100);
  const y = room.match.players[0].y;
  room.message(0, 'h', { type: 'ping' }, now + 500);
  room.message(0, 'h', { type: 'input', seq: 0, direction: 1, target: null }, now + 500);
  room.tick(0.1, now + 500);
  assert.equal(room.match.players[0].y, y);
  assert.equal(room.slots[0].lastSeen, now + 500);
});
