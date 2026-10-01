import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, POWERUPS } from '../web/engine.js';
const match = () => new Match({ mode: 'duo', random: () => 0.5 });
const advance = (game, seconds, input) => {
  for (let i = 0; i < seconds * 60; i++) game.step(1 / 60, input);
};
test('serve, player input, paddle limits and pause', () => {
  const game = match();
  advance(game, 1.1, { 0: -1 });
  assert.equal(game.balls.length, 1);
  assert.equal(game.players[0].y, 35);
  game.pause();
  const time = game.time;
  advance(game, 2, { 0: 1 });
  assert.equal(game.time, time);
  assert.equal(game.players[0].y, 35);
  game.pause();
  advance(game, 1, { 0: 1 });
  assert.ok(game.players[0].y > 35);
});
test('paddle return awards points and powerup; walls bounce', () => {
  const game = match();
  game.balls = [{ x: 40, y: 250, vx: -280, vy: 0, radius: 8 }];
  game.step(0.05);
  assert.equal(game.players[0].points, 1);
  assert.ok(game.balls[0].vx > 0);
  assert.ok(game.powerup);
  game.balls = [{ x: 400, y: 9, vx: 280, vy: -200, radius: 8 }];
  game.step(0.02);
  assert.ok(game.balls[0].vy > 0);
});
test('miss costs a life without awarding a return; zero lives ends match', () => {
  const game = match();
  game.players[0].lives = 1;
  game.balls = [{ x: 1, y: 40, vx: -280, vy: 0, radius: 8 }];
  game.step(0.1);
  assert.equal(game.players[0].lives, 0);
  assert.equal(game.players[0].points, 0);
  assert.equal(game.status, 'over');
  assert.equal(game.winner, 1);
});
test('all powerups collect and timed effects restore exact defaults', () => {
  for (const [type] of POWERUPS) {
    const game = match();
    game.spawnBall();
    const ball = game.balls[0];
    game.players[0].lives = 10;
    game.powerup = { type };
    game.collect(0, ball);
    if (type === 'ExtraLife') assert.equal(game.players[0].lives, 11);
    else if (type === 'MultiBall') {
      assert.equal(game.balls.length, 2);
      assert.notEqual(game.balls[0], game.balls[1]);
      for (let i = 0; i < 10; i++) {
        game.powerup = { type };
        game.collect(0, ball);
      }
      assert.equal(game.balls.length, 8);
      assert.equal(new Set(game.balls.map((ball) => ball.id)).size, 8);
    } else {
      if (type === 'ShrinkBall') assert.equal(ball.radius, 4);
      if (type === 'FastBall') assert.equal(Math.abs(ball.vx), 448);
      if (type === 'ShrinkPaddle') assert.equal(game.players[0].height, 45);
      game.clearEffect();
      assert.equal(game.players[0].height, 70);
      assert.equal(game.players[0].speed, 300);
      assert.equal(ball.radius, 8);
      assert.ok(Math.abs(Math.abs(ball.vx) - 280) < 0.001);
    }
  }
});
test('powerup ownership follows last hitter and multiball is retained', () => {
  const game = match();
  game.balls = [{ x: 400, y: 250, vx: 280, vy: 0, radius: 8 }];
  game.powerup = { type: 'MultiBall', x: 400, y: 250, until: 99 };
  game.step(1 / 60);
  assert.equal(game.balls.length, 2);
  assert.ok(game.balls[1].vx < 0);
  game.powerup = { type: 'ExtraLife', x: game.balls[0].x, y: 250, until: 99 };
  game.step(1 / 60);
  assert.equal(game.players[0].lives, 11);
});
test('effect expires using simulation time and survives a new serve', () => {
  const game = match();
  game.spawnBall();
  game.powerup = { type: 'GrowBall' };
  game.collect(0, game.balls[0]);
  game.balls = [];
  game.spawnBall();
  assert.equal(game.balls[0].radius, 14);
  game.effect.until = 0.05;
  game.step(0.1);
  assert.equal(game.effect, null);
  assert.equal(game.balls[0].radius, 8);
});
test('solo CPU tracks approaching balls; two-player stays human', () => {
  const game = new Match({ difficulty: 4 });
  game.balls = [{ x: 500, y: 400, vx: 280, vy: 0, radius: 8 }];
  game.step(0.1);
  assert.ok(game.players[1].y > 250);
  const duo = match();
  duo.balls = [{ x: 500, y: 400, vx: 280, vy: 0, radius: 8 }];
  duo.step(0.1);
  assert.equal(duo.players[1].y, 250);
});
test('life cap and stale powerups', () => {
  const game = match();
  game.players[0].lives = 15;
  game.powerup = { type: 'ExtraLife' };
  game.collect(0, {});
  assert.equal(game.players[0].lives, 15);
  game.powerup = { type: 'FastBall', until: 0.01, x: 100, y: 100 };
  game.step(0.1);
  assert.equal(game.powerup, null);
});
test('a ball already behind a paddle cannot be rescued by moving into its path', () => {
  const game = match();
  game.balls = [{ x: 10, y: 250, vx: -280, vy: 0, radius: 8 }];
  game.step(0.1);
  assert.equal(game.players[0].points, 0);
  assert.equal(game.players[0].lives, 9);
});
