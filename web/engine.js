export const WIDTH = 800, HEIGHT = 500;
export const POWERUPS = [
  ['ExtraLife', 'Extra life'], ['FastBall', 'Fast ball'], ['SlowBall', 'Slow ball'],
  ['GrowPaddle', 'Grow paddle'], ['ShrinkPaddle', 'Shrink paddle'], ['FastPaddle', 'Fast paddle'],
  ['GrowBall', 'Grow ball'], ['ShrinkBall', 'Shrink ball'], ['MultiBall', 'Multiball'],
];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export class Match {
  constructor({ mode = 'solo', difficulty = 1, random = Math.random } = {}) {
    this.mode = mode; this.difficulty = difficulty; this.random = random;
    this.players = [0, 1].map(() => ({ y: HEIGHT / 2, height: 70, speed: 300, lives: 10, points: 0 }));
    this.balls = []; this.time = 0; this.serveIn = 1; this.powerup = null; this.effect = null;
    this.status = 'playing'; this.winner = null;
  }
  spawnBall() {
    const type = this.effect?.type;
    const speed = type === 'FastBall' ? 1.6 : type === 'SlowBall' ? .7 : 1;
    this.balls.push({ x: WIDTH / 2, y: HEIGHT / 2, vx: (this.random() < .5 ? -1 : 1) * 280 * speed, vy: (this.random() - .5) * 220, radius: type === 'GrowBall' ? 14 : type === 'ShrinkBall' ? 4 : 8 });
  }
  pause() { if (this.status === 'playing') this.status = 'paused'; else if (this.status === 'paused') this.status = 'playing'; }
  step(dt, input = {}) {
    if (this.status !== 'playing' || dt <= 0) return;
    // Small physics steps prevent tunneling even with fast-ball powerups.
    let remaining = Math.min(dt, .1);
    while (remaining > 0 && this.status === 'playing') {
      const tick = Math.min(remaining, 1 / 240); this.tick(tick, input); remaining -= tick;
    }
  }
  tick(dt, input) {
    this.time += dt;
    if (this.effect && this.time >= this.effect.until) this.clearEffect();
    if (this.powerup && this.time >= this.powerup.until) this.powerup = null;
    this.players.forEach((p, i) => {
      let direction = input[i] || 0;
      if (i === 1 && this.mode === 'solo') {
        const approaching = this.balls.filter(b => b.vx > 0).sort((a,b) => b.x - a.x)[0];
        const reaction = [590, 480, 360, 220, 0][this.difficulty];
        const target = approaching && approaching.x > reaction ? approaching.y : HEIGHT / 2;
        direction = Math.abs(target - p.y) > 9 ? Math.sign(target - p.y) : 0;
      }
      if (input.targets?.[i] != null && !(i === 1 && this.mode === 'solo')) p.y = input.targets[i];
      else p.y += direction * p.speed * dt * (i === 1 && this.mode === 'solo' ? [.6, .8, 1, 1.15, 1.35][this.difficulty] : 1);
      p.y = clamp(p.y, p.height / 2, HEIGHT - p.height / 2);
    });
    if (!this.balls.length) {
      this.serveIn -= dt;
      if (this.serveIn <= 0) this.spawnBall();
    }
    const survivors = [], initialCount = this.balls.length;
    for (const b of this.balls.slice()) {
      const previousX = b.x;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < b.radius) { b.y = b.radius; b.vy = Math.abs(b.vy); }
      if (b.y > HEIGHT - b.radius) { b.y = HEIGHT - b.radius; b.vy = -Math.abs(b.vy); }
      const side = b.vx < 0 ? 0 : 1, p = this.players[side];
      const boundary = side === 0 ? 30 : WIDTH - 30;
      if ((side === 0 ? previousX - b.radius >= boundary && b.x - b.radius <= boundary : previousX + b.radius <= boundary && b.x + b.radius >= boundary) && Math.abs(b.y - p.y) <= p.height / 2 + b.radius) {
        b.x = boundary + (side === 0 ? b.radius : -b.radius);
        b.vx = Math.abs(b.vx) * (side === 0 ? 1 : -1);
        b.vy = clamp((b.y - p.y) / (p.height / 2), -1, 1) * 280;
        p.points++;
        if (!this.powerup && !this.effect) this.spawnPowerup();
      }
      if (b.x < -b.radius || b.x > WIDTH + b.radius) {
        const loser = b.x < 0 ? 0 : 1;
        this.players[loser].lives = Math.max(0, this.players[loser].lives - 1);
        if (!this.players[loser].lives) { this.status = 'over'; this.winner = 1 - loser; }
        this.serveIn = 1;
        continue;
      }
      if (this.powerup && Math.hypot(b.x - this.powerup.x, b.y - this.powerup.y) < b.radius + 18) this.collect(b.vx > 0 ? 0 : 1, b);
      survivors.push(b);
    }
    // collect() can add a ball; keep it without processing it twice this tick.
    this.balls = [...survivors, ...this.balls.slice(initialCount)];
  }
  spawnPowerup() {
    this.powerup = { type: POWERUPS[Math.floor(this.random() * POWERUPS.length)][0], x: 180 + this.random() * 440, y: 70 + this.random() * 360, until: this.time + 15 };
  }
  collect(owner, ball) {
    const type = this.powerup.type, p = this.players[owner]; this.powerup = null;
    if (type === 'ExtraLife') { p.lives = Math.min(15, p.lives + 1); return; }
    if (type === 'MultiBall') { this.balls.push({ ...ball, vx: -ball.vx, vy: -ball.vy || 100 }); return; }
    this.effect = { type, owner, until: this.time + 12 };
    if (type === 'GrowPaddle') p.height = 105;
    if (type === 'ShrinkPaddle') p.height = 45;
    if (type === 'FastPaddle') p.speed = 480;
    for (const b of this.balls) {
      if (type === 'FastBall' || type === 'SlowBall') b.vx *= type === 'FastBall' ? 1.6 : .7;
      if (type === 'GrowBall' || type === 'ShrinkBall') b.radius = type === 'GrowBall' ? 14 : 4;
    }
  }
  clearEffect() {
    const { type, owner } = this.effect;
    this.players[owner].height = 70; this.players[owner].speed = 300;
    for (const b of this.balls) {
      if (type === 'FastBall' || type === 'SlowBall') b.vx /= type === 'FastBall' ? 1.6 : .7;
      b.radius = 8;
    }
    this.effect = null;
  }
}
