import {
  WIDTH,
  HEIGHT,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_BOUNDARY,
  BALL_SPEED,
  BALL_RADIUS,
  MAX_BALLS,
  MAX_LIVES,
  SERVE_DELAY,
  EFFECT_DURATION,
  POWERUP_LIFETIME,
  POWERUPS,
  clamp,
} from './constants.js';
import { CpuController } from './cpu.js';

// Existing browser/server consumers can keep importing these from the engine.
export { WIDTH, HEIGHT, POWERUPS } from './constants.js';
const PHYSICS_STEP = 1 / 240;
const MAX_FRAME_TIME = 0.1;

export class Match {
  constructor({ mode = 'solo', difficulty = 1, random = Math.random } = {}) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.random = random;
    this.cpu = mode === 'solo' ? new CpuController(difficulty, random) : null;
    this.players = [0, 1].map(() => ({
      y: HEIGHT / 2,
      height: PADDLE_HEIGHT,
      speed: PADDLE_SPEED,
      lives: 10,
      points: 0,
    }));
    this.balls = [];
    this.time = 0;
    this.serveIn = SERVE_DELAY;
    this.powerup = null;
    this.effect = null;
    this.status = 'playing';
    this.winner = null;
    this.nextBallId = 1;
  }

  spawnBall() {
    const effect = this.effect?.type;
    let speedMultiplier = 1;
    let radius = BALL_RADIUS;
    if (effect === 'FastBall') speedMultiplier = 1.6;
    if (effect === 'SlowBall') speedMultiplier = 0.7;
    if (effect === 'GrowBall') radius = 14;
    if (effect === 'ShrinkBall') radius = 4;

    this.balls.push({
      id: this.nextBallId++,
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: (this.random() < 0.5 ? -1 : 1) * BALL_SPEED * speedMultiplier,
      vy: (this.random() - 0.5) * 220,
      radius,
    });
  }

  pause() {
    if (this.status === 'playing') this.status = 'paused';
    else if (this.status === 'paused') this.status = 'playing';
  }

  step(seconds, input = {}) {
    if (this.status !== 'playing' || seconds <= 0) return;

    // Limit large frame gaps and split movement into small collision steps.
    // This prevents a fast ball from passing completely through a paddle.
    let remaining = Math.min(seconds, MAX_FRAME_TIME);
    while (remaining > 0 && this.status === 'playing') {
      const elapsed = Math.min(remaining, PHYSICS_STEP);
      this.tick(elapsed, input);
      remaining -= elapsed;
    }
  }

  tick(seconds, input) {
    this.time += seconds;
    this.expirePowerups();
    this.movePlayers(seconds, input);

    if (!this.balls.length) {
      this.serveIn -= seconds;
      if (this.serveIn <= 0) this.spawnBall();
    }
    this.moveBalls(seconds);
  }

  expirePowerups() {
    if (this.effect && this.time >= this.effect.until) this.clearEffect();
    if (this.powerup && this.time >= this.powerup.until) this.powerup = null;
  }

  movePlayers(seconds, input) {
    this.players.forEach((player, slot) => {
      const computer = slot === 1 && this.cpu;
      const direction = computer
        ? this.cpu.direction(this.balls, player, this.time)
        : input[slot] || 0;
      const target = input.targets?.[slot];

      if (target != null && !computer) {
        // Local solo/duo dragging is immediate. Remote touch controls are
        // converted to bounded direction input by RoomSession on the server.
        player.y = target;
      } else {
        const speedMultiplier = computer ? this.cpu.settings.speed : 1;
        player.y += direction * player.speed * speedMultiplier * seconds;
      }
      player.y = clamp(player.y, player.height / 2, HEIGHT - player.height / 2);
    });
  }

  moveBalls(seconds) {
    const survivors = [];
    const originalCount = this.balls.length;

    // Collecting Multiball appends a ball. Process only the original balls
    // this step, then preserve any additions for the next step.
    for (const ball of this.balls.slice()) {
      const previousX = ball.x;
      ball.x += ball.vx * seconds;
      ball.y += ball.vy * seconds;
      this.bounceWalls(ball);
      this.bouncePaddle(ball, previousX);

      if (ball.x < -ball.radius || ball.x > WIDTH + ball.radius) {
        this.miss(ball.x < 0 ? 0 : 1);
        continue;
      }

      if (
        this.powerup &&
        Math.hypot(ball.x - this.powerup.x, ball.y - this.powerup.y) < ball.radius + 18
      ) {
        // Travel direction identifies the last player to return the ball.
        this.collect(ball.vx > 0 ? 0 : 1, ball);
      }
      survivors.push(ball);
    }
    this.balls = [...survivors, ...this.balls.slice(originalCount)];
  }

  bounceWalls(ball) {
    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y > HEIGHT - ball.radius) {
      ball.y = HEIGHT - ball.radius;
      ball.vy = -Math.abs(ball.vy);
    }
  }

  bouncePaddle(ball, previousX) {
    const slot = ball.vx < 0 ? 0 : 1;
    const player = this.players[slot];
    const boundary = slot === 0 ? PADDLE_BOUNDARY : WIDTH - PADDLE_BOUNDARY;
    const crossedPaddle =
      slot === 0
        ? previousX - ball.radius >= boundary && ball.x - ball.radius <= boundary
        : previousX + ball.radius <= boundary && ball.x + ball.radius >= boundary;
    const withinPaddle = Math.abs(ball.y - player.y) <= player.height / 2 + ball.radius;

    // Crossing is required: moving into a ball already behind you cannot save it.
    if (!crossedPaddle || !withinPaddle) return;

    ball.x = boundary + (slot === 0 ? ball.radius : -ball.radius);
    ball.vx = Math.abs(ball.vx) * (slot === 0 ? 1 : -1);
    const contactOffset = (ball.y - player.y) / (player.height / 2);
    ball.vy = clamp(contactOffset, -1, 1) * BALL_SPEED;
    player.points++;
    if (!this.powerup && !this.effect) this.spawnPowerup();
  }

  miss(slot) {
    const player = this.players[slot];
    player.lives = Math.max(0, player.lives - 1);
    this.serveIn = SERVE_DELAY;
    if (!player.lives) {
      this.status = 'over';
      this.winner = 1 - slot;
    }
  }

  spawnPowerup() {
    this.powerup = {
      type: POWERUPS[Math.floor(this.random() * POWERUPS.length)][0],
      x: 180 + this.random() * 440,
      y: 70 + this.random() * 360,
      until: this.time + POWERUP_LIFETIME,
    };
  }

  collect(owner, ball) {
    const type = this.powerup.type;
    const player = this.players[owner];
    this.powerup = null;

    if (type === 'ExtraLife') {
      player.lives = Math.min(MAX_LIVES, player.lives + 1);
      return;
    }
    if (type === 'MultiBall') {
      if (this.balls.length < MAX_BALLS) {
        this.balls.push({
          ...ball,
          id: this.nextBallId++,
          vx: -ball.vx,
          vy: -ball.vy || 100,
        });
      }
      return;
    }

    this.effect = { type, owner, until: this.time + EFFECT_DURATION };
    if (type === 'GrowPaddle') player.height = 105;
    if (type === 'ShrinkPaddle') player.height = 45;
    if (type === 'FastPaddle') player.speed = 480;
    for (const activeBall of this.balls) {
      if (type === 'FastBall') activeBall.vx *= 1.6;
      if (type === 'SlowBall') activeBall.vx *= 0.7;
      if (type === 'GrowBall') activeBall.radius = 14;
      if (type === 'ShrinkBall') activeBall.radius = 4;
    }
  }

  clearEffect() {
    const { type, owner } = this.effect;
    this.players[owner].height = PADDLE_HEIGHT;
    this.players[owner].speed = PADDLE_SPEED;
    for (const ball of this.balls) {
      // Invert the exact speed multiplier to avoid accumulating rounding drift.
      if (type === 'FastBall') ball.vx /= 1.6;
      if (type === 'SlowBall') ball.vx /= 0.7;
      ball.radius = BALL_RADIUS;
    }
    this.effect = null;
  }
}
