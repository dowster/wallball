import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, POWERUPS } from '../web/engine.js';
const match = () => new Match({ mode: 'duo', random: () => .5 });
const advance = (g, seconds, input) => { for (let i=0;i<seconds*60;i++) g.step(1/60,input); };
test('serve, player input, paddle limits and pause', () => {
  const g=match(); advance(g,1.1,{0:-1}); assert.equal(g.balls.length,1); assert.equal(g.players[0].y,35);
  g.pause(); const time=g.time; advance(g,2,{0:1}); assert.equal(g.time,time); assert.equal(g.players[0].y,35);
  g.pause(); advance(g,1,{0:1}); assert.ok(g.players[0].y>35);
});
test('paddle return awards points and powerup; walls bounce', () => {
  const g=match(); g.balls=[{x:40,y:250,vx:-280,vy:0,radius:8}]; g.step(.05);
  assert.equal(g.players[0].points,1); assert.ok(g.balls[0].vx>0); assert.ok(g.powerup);
  g.balls=[{x:400,y:9,vx:280,vy:-200,radius:8}]; g.step(.02); assert.ok(g.balls[0].vy>0);
});
test('miss costs a life without awarding a return; zero lives ends match', () => {
  const g=match(); g.players[0].lives=1; g.balls=[{x:1,y:40,vx:-280,vy:0,radius:8}]; g.step(.1);
  assert.equal(g.players[0].lives,0); assert.equal(g.players[0].points,0); assert.equal(g.status,'over'); assert.equal(g.winner,1);
});
test('all powerups collect and timed effects restore exact defaults', () => {
  for (const [type] of POWERUPS) {
    const g=match(); g.spawnBall(); const b=g.balls[0]; g.players[0].lives=10;
    g.powerup={type}; g.collect(0,b);
    if(type==='ExtraLife') assert.equal(g.players[0].lives,11);
    else if(type==='MultiBall') {assert.equal(g.balls.length,2); assert.notEqual(g.balls[0],g.balls[1]);}
    else {
      if(type==='ShrinkBall') assert.equal(b.radius,4);
      if(type==='FastBall') assert.equal(Math.abs(b.vx),448);
      if(type==='ShrinkPaddle') assert.equal(g.players[0].height,45);
      g.clearEffect(); assert.equal(g.players[0].height,70); assert.equal(g.players[0].speed,300); assert.equal(b.radius,8); assert.ok(Math.abs(Math.abs(b.vx)-280)<.001);
    }
  }
});
test('powerup ownership follows last hitter and multiball is retained', () => {
  const g=match(); g.balls=[{x:400,y:250,vx:280,vy:0,radius:8}];
  g.powerup={type:'MultiBall',x:400,y:250,until:99}; g.step(1/60); assert.equal(g.balls.length,2); assert.ok(g.balls[1].vx<0);
  g.powerup={type:'ExtraLife',x:g.balls[0].x,y:250,until:99}; g.step(1/60); assert.equal(g.players[0].lives,11);
});
test('effect expires using simulation time and survives a new serve', () => {
  const g=match(); g.spawnBall(); g.powerup={type:'GrowBall'}; g.collect(0,g.balls[0]);
  g.balls=[]; g.spawnBall(); assert.equal(g.balls[0].radius,14);
  g.effect.until=.05; g.step(.1); assert.equal(g.effect,null); assert.equal(g.balls[0].radius,8);
});
test('solo CPU tracks approaching balls; two-player stays human', () => {
  const g=new Match({difficulty:4}); g.balls=[{x:500,y:400,vx:280,vy:0,radius:8}]; g.step(.1); assert.ok(g.players[1].y>250);
  const duo=match(); duo.balls=[{x:500,y:400,vx:280,vy:0,radius:8}]; duo.step(.1); assert.equal(duo.players[1].y,250);
});
test('life cap and stale powerups', () => {
  const g=match(); g.players[0].lives=15; g.powerup={type:'ExtraLife'}; g.collect(0,{}); assert.equal(g.players[0].lives,15);
  g.powerup={type:'FastBall',until:.01,x:100,y:100}; g.step(.1); assert.equal(g.powerup,null);
});
test('a ball already behind a paddle cannot be rescued by moving into its path', () => {
  const g=match(); g.balls=[{x:10,y:250,vx:-280,vy:0,radius:8}]; g.step(.1);
  assert.equal(g.players[0].points,0); assert.equal(g.players[0].lives,9);
});
