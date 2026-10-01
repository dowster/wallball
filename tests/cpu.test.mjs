import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CpuController } from '../web/cpu.js';
import { Match } from '../web/engine.js';

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// These identical shots exercise the actual engine's walls, movement and
// paddle collisions. A hit is a real return, not a guessed targeting distance.
export function catchRate(difficulty, legacy = false) {
  const fixtureRandom = seededRandom(20261001);
  let returns = 0;
  const shotCount = 300;
  for (let shot = 0; shot < shotCount; shot++) {
    const game = new Match({ difficulty, random: seededRandom(shot + 1) });
    game.balls = [
      {
        id: 1,
        x: 450,
        y: 20 + fixtureRandom() * 460,
        vx: 280,
        vy: (fixtureRandom() * 2 - 1) * 280,
        radius: 8,
      },
    ];
    if (legacy) {
      // Previous browser Medium: no reaction delay/error, continuous tracking.
      game.cpu = {
        settings: { speed: 0.8 },
        direction(balls, player) {
          const ball = balls
            .filter((candidate) => candidate.vx > 0)
            .sort((first, second) => second.x - first.x)[0];
          const target = ball && ball.x > 480 ? ball.y : 250;
          return Math.abs(target - player.y) > 9 ? Math.sign(target - player.y) : 0;
        },
      };
    }
    for (let frame = 0; frame < 120; frame++) {
      game.step(1 / 60);
      if (game.players[1].points > 0 || game.players[1].lives < 10) break;
    }
    if (game.players[1].points > 0) returns++;
  }
  return returns / shotCount;
}

test('computer waits to react and keeps one aiming error for an incoming ball', () => {
  const cpu = new CpuController(1, () => 0.75);
  const ball = { x: 600, y: 400, vx: 280 };
  const player = { y: 250, height: 70 };
  assert.equal(cpu.direction([ball], player, 0), 0);
  assert.equal(cpu.direction([ball], player, 0.1), 0);
  assert.equal(cpu.direction([ball], player, 0.17), 1);
  const offset = cpu.aimOffset;
  ball.y = 370;
  cpu.direction([ball], player, 0.4);
  assert.equal(cpu.aimOffset, offset);
});

test('missed reads and visibility delay create exploitable openings', () => {
  const cpu = new CpuController(1, () => 0);
  const player = { y: 250, height: 70 };
  const ball = { x: 600, y: 450, vx: 280 };
  cpu.direction([ball], player, 0);
  assert.equal(cpu.direction([ball], player, 1), 0);
  assert.equal(cpu.missedRead, true);
  const easy = new CpuController(0, () => 0.5);
  assert.equal(easy.direction([{ ...ball, x: 500 }], player, 1), 0);
});

test('difficulty tuning separates Easy, Medium and challenging Expert across repeatable shots', () => {
  const easy = catchRate(0),
    medium = catchRate(1),
    hard = catchRate(2),
    veryHard = catchRate(3),
    expert = catchRate(4),
    previous = catchRate(1, true);
  console.log('Seeded shot return rates:', { easy, medium, hard, veryHard, expert, previous });
  assert.ok(medium > easy, 'Medium should return more shots than Easy');
  assert.ok(hard > medium, 'Hard should return more shots than Medium');
  assert.ok(veryHard > hard, 'Very hard should return more shots than Hard');
  assert.ok(expert > veryHard, 'Expert should return more shots than Very hard');
  assert.ok(
    medium < previous - 0.1,
    'Medium should have substantially more openings than its previous version',
  );
});
