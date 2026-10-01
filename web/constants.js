// Shared dimensions and defaults keep browser and Durable Object physics aligned.
export const WIDTH = 800;
export const HEIGHT = 500;
export const PADDLE_HEIGHT = 70;
export const PADDLE_SPEED = 300;
export const PADDLE_BOUNDARY = 30;
export const BALL_SPEED = 280;
export const BALL_RADIUS = 8;
export const MAX_BALLS = 8;
export const MAX_LIVES = 15;
export const SERVE_DELAY = 1;
export const EFFECT_DURATION = 12;
export const POWERUP_LIFETIME = 15;

export const POWERUPS = [
  ['ExtraLife', 'Extra life'],
  ['FastBall', 'Fast ball'],
  ['SlowBall', 'Slow ball'],
  ['GrowPaddle', 'Grow paddle'],
  ['ShrinkPaddle', 'Shrink paddle'],
  ['FastPaddle', 'Fast paddle'],
  ['GrowBall', 'Grow ball'],
  ['ShrinkBall', 'Shrink ball'],
  ['MultiBall', 'Multiball'],
];

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
