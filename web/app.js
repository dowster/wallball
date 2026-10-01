import { Match, WIDTH, HEIGHT, POWERUPS } from './engine.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let match = null, mode = 'solo', previous = 0;
const keys = new Set(), touches = new Map(), targets = {}, images = new Map();
for (const [type, label] of POWERUPS) {
  const image = new Image(); image.src = `assets/${type}.png`; images.set(type, image);
  const item = document.createElement('span'), icon = document.createElement('img');
  icon.src = image.src; icon.alt = ''; item.append(icon, document.createTextNode(label)); $('powerup-list').append(item);
}
function announce(text) { $('announcement').textContent = text; }
function clearInput() { keys.clear(); touches.clear(); for (const key of Object.keys(targets)) delete targets[key]; }
function menu() {
  match = null; clearInput(); $('overlay').hidden = false; $('setup').hidden = false; $('back').hidden = true;
  $('overlay-kicker').textContent = 'YOUR NEXT HIGH SCORE STARTS HERE'; $('overlay-title').textContent = 'Meet your match.';
  $('overlay-description').textContent = 'Return the ball. Collect power-ups. Be the last paddle standing.';
  $('start').firstChild.textContent = 'LET’S PLAY '; $('pause').disabled = true; update();
}
function setMode(next) {
  mode = next; $('solo').setAttribute('aria-pressed', String(mode === 'solo')); $('duo').setAttribute('aria-pressed', String(mode === 'duo'));
  $('difficulty').disabled = mode === 'duo'; $('right-touch').hidden = mode === 'solo'; update();
}
$('solo').onclick = () => setMode('solo'); $('duo').onclick = () => setMode('duo');
function start() {
  if (match?.status === 'paused') { match.pause(); }
  else { match = new Match({ mode, difficulty: Number($('difficulty').value) }); }
  clearInput(); $('overlay').hidden = true; $('pause').disabled = false; canvas.focus(); previous = performance.now();
  announce(mode === 'solo' ? 'Solo match started.' : 'Two-player match started.'); update();
}
$('start').onclick = start; $('back').onclick = menu;
function pause() {
  if (!match || match.status === 'over') return;
  match.pause(); clearInput(); $('overlay').hidden = match.status !== 'paused';
  if (match.status === 'paused') {
    $('setup').hidden = true; $('back').hidden = false; $('overlay-kicker').textContent = 'TAKE A BREATHER';
    $('overlay-title').textContent = 'Rally on hold.'; $('overlay-description').textContent = 'Your match will be right here.'; $('start').firstChild.textContent = 'RESUME GAME ';
    $('start').focus(); announce('Game paused.');
  } else { canvas.focus(); announce('Game resumed.'); }
  update();
}
$('pause').onclick = pause;
window.addEventListener('keydown', e => {
  if (e.target.matches('select, input, textarea')) return;
  if (['KeyW','KeyS','ArrowUp','ArrowDown','Space','Escape'].includes(e.code) && match) {
    // Let focused buttons handle Space natively; otherwise it would pause twice.
    if (e.code === 'Space' && e.target.matches('button')) return;
    e.preventDefault();
    if (e.code === 'Space' && !e.repeat) pause();
    else if (e.code === 'Escape') menu();
    else keys.add(e.code);
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { clearInput(); if (match?.status === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && match?.status === 'playing') pause(); });
for (const button of document.querySelectorAll('[data-player]')) {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); touches.set(e.pointerId, { player: Number(button.dataset.player), direction: Number(button.dataset.direction) }); });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, e => touches.delete(e.pointerId));
}
function point(e) {
  const rect = canvas.getBoundingClientRect(); targets[0] = (e.clientY - rect.top) / rect.height * HEIGHT;
}
canvas.addEventListener('pointerdown', e => { if (mode !== 'solo' || match?.status !== 'playing') return; canvas.setPointerCapture(e.pointerId); point(e); });
canvas.addEventListener('pointermove', e => { if (canvas.hasPointerCapture(e.pointerId)) point(e); });
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => delete targets[0]);
function update() {
  $('right-name').textContent = mode === 'solo' ? 'COMPUTER' : 'PLAYER 02';
  for (const [i, side] of ['left','right'].entries()) {
    $(''+side+'-score').textContent = String(match?.players[i].points || 0).padStart(2,'0');
    $(''+side+'-lives').textContent = `${match?.players[i].lives ?? 10} lives`;
  }
  $('match-label').textContent = !match ? 'READY TO RALLY' : match.status === 'playing' ? (mode === 'solo' ? 'SOLO MATCH' : 'LOCAL TWO PLAYER') : match.status === 'paused' ? 'PAUSED' : 'MATCH COMPLETE';
  $('pause-text').textContent = match?.status === 'paused' ? 'Resume' : 'Pause';
  const effect = match?.effect;
  $('effect-label').textContent = effect ? `${POWERUPS.find(([type]) => type === effect.type)[1].toUpperCase()} · P${effect.owner + 1} · ${Math.ceil(effect.until-match.time)}s` : 'POWER-UPS ENABLED';
}
function render() {
  ctx.fillStyle = '#0c1014'; ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.strokeStyle = '#202a31'; ctx.lineWidth = 1; ctx.setLineDash([4,10]);
  ctx.beginPath(); ctx.moveTo(WIDTH/2,16); ctx.lineTo(WIDTH/2,HEIGHT-16); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#1a232b'; ctx.strokeRect(12,12,WIDTH-24,HEIGHT-24);
  const players = match?.players || [{y:250,height:70},{y:250,height:70}];
  players.forEach((p,i)=>{
    ctx.fillStyle = i ? '#ffb377' : '#9bf5d1'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur=14;
    ctx.fillRect(i ? WIDTH-30 : 20,p.y-p.height/2,10,p.height); ctx.shadowBlur=0;
  });
  for (const b of match?.balls || [{x:WIDTH/2,y:HEIGHT/2,radius:8}]) {
    ctx.fillStyle='#f0f1ec'; ctx.shadowColor='#f0f1ec'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  const powerup = match?.powerup;
  if (powerup) {
    ctx.strokeStyle='#9bf5d1'; ctx.strokeRect(powerup.x-19,powerup.y-19,38,38);
    const image = images.get(powerup.type);
    if (image.complete && image.naturalWidth) ctx.drawImage(image,powerup.x-14,powerup.y-14,28,28);
  }
  if (match?.status === 'playing' && !match.balls.length) {
    ctx.fillStyle='#989faa'; ctx.font='bold 16px Arial'; ctx.textAlign='center'; ctx.fillText('GET READY',WIDTH/2,HEIGHT/2-30);
  }
}
function frame(now) {
  const dt = previous ? (now-previous)/1000 : 0; previous=now;
  if (match?.status === 'playing') {
    const input={0:Number(keys.has('KeyS'))-Number(keys.has('KeyW')),1:Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp')),targets};
    for (const {player,direction} of touches.values()) input[player]+=direction;
    input[0]=Math.sign(input[0]); input[1]=Math.sign(input[1]); match.step(dt,input);
    if (match.status === 'over') {
      $('overlay').hidden=false; $('setup').hidden=true; $('back').hidden=false; $('pause').disabled=true;
      const winner=match.winner===0 ? 'Player 01' : mode==='solo' ? 'Computer' : 'Player 02';
      $('overlay-kicker').textContent='THAT’S A WRAP'; $('overlay-title').textContent=`${winner} wins.`;
      $('overlay-description').textContent=`${match.players[0].points} : ${match.players[1].points} returns. Ready for a rematch?`;
      $('start').firstChild.textContent='PLAY AGAIN '; $('start').focus(); announce(`${winner} wins.`);
    }
    update();
  }
  render(); requestAnimationFrame(frame);
}
setMode('solo'); menu(); requestAnimationFrame(frame);
