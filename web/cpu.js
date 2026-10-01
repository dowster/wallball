import { WIDTH, HEIGHT, clamp } from './constants.js';

// Difficulty is deliberately imperfect: decisions are delayed, aiming error
// stays consistent for one incoming ball, and easier levels occasionally miss
// a read entirely. Rolling error every physics tick would average toward perfect aim.
export const CPU_LEVELS = [
  { name: 'Easy', speed: 0.5, reactionDelay: 0.28, startsAt: 560, aimError: 60, missChance: 0.18 },
  {
    name: 'Medium',
    speed: 0.7,
    reactionDelay: 0.16,
    startsAt: 480,
    aimError: 34,
    missChance: 0.08,
  },
  { name: 'Hard', speed: 0.85, reactionDelay: 0.1, startsAt: 360, aimError: 20, missChance: 0.035 },
  {
    name: 'Very hard',
    speed: 0.95,
    reactionDelay: 0.065,
    startsAt: 220,
    aimError: 10,
    missChance: 0.015,
  },
  { name: 'Expert', speed: 1.05, reactionDelay: 0.04, startsAt: 0, aimError: 4, missChance: 0 },
];

export class CpuController {
  constructor(difficulty, random = Math.random) {
    this.settings = CPU_LEVELS[difficulty] || CPU_LEVELS[1];
    this.random = random;
    this.ball = null;
    this.target = HEIGHT / 2;
    this.nextDecisionAt = 0;
    this.aimOffset = 0;
    this.missedRead = false;
  }

  direction(balls, player, time) {
    // Choose the closest ball travelling toward the computer's right paddle.
    // No trajectory prediction or advance knowledge of future wall bounces.
    const approaching =
      balls
        .filter((ball) => ball.vx > 0 && ball.x > this.settings.startsAt && ball.x < WIDTH)
        .sort((first, second) => second.x - first.x)[0] || null;

    if (approaching !== this.ball) {
      this.ball = approaching;
      this.target = player.y;
      this.nextDecisionAt = time + this.settings.reactionDelay;
      this.aimOffset = approaching ? (this.random() * 2 - 1) * this.settings.aimError : 0;
      this.missedRead = approaching ? this.random() < this.settings.missChance : false;
    }

    if (time >= this.nextDecisionAt) {
      this.nextDecisionAt = time + this.settings.reactionDelay;
      const desired = approaching && !this.missedRead ? approaching.y + this.aimOffset : HEIGHT / 2;
      this.target = clamp(desired, player.height / 2, HEIGHT - player.height / 2);
    }

    // A small dead zone avoids visibly shaking around a settled target.
    return Math.abs(this.target - player.y) > 9 ? Math.sign(this.target - player.y) : 0;
  }
}
