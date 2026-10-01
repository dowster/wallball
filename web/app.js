import { Match, WIDTH, HEIGHT, POWERUPS } from './engine.js';
import { RemoteClient, roomRequest, ROOM_PATTERN, GAME_BASE } from './network.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), localControlHint = $('control-hint').innerHTML;
let match = null, mode = 'solo', previous = 0, remote = null, requestVersion = 0, lastRemotePhase = null;
const keys = new Set(), touches = new Map(), targets = {}, images = new Map();
for (const [type, label] of POWERUPS) {
  const image = new Image(); image.src = `assets/${type}.png`; images.set(type, image);
  const item = document.createElement('span'), icon = document.createElement('img');
  icon.src = image.src; icon.alt = ''; item.append(icon, document.createTextNode(label)); $('powerup-list').append(item);
}
function announce(text) { $('announcement').textContent = text; }
function clearInput() { keys.clear(); touches.clear(); for (const key of Object.keys(targets)) delete targets[key]; }
function errorMessage(message) { $('connection-error').hidden = !message; $('connection-error').textContent = message || ''; }
function menu() {
  requestVersion++;
  if (remote) { sessionStorage.removeItem(`wallball:${remote.room}`); remote.destroy(); remote = null; }
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
  match = null; lastRemotePhase = null; clearInput(); $('overlay').hidden = false; $('setup').hidden = false; $('back').hidden = true;
  $('room-bar').hidden = true; $('start').disabled = false; $('create-room').disabled = false; $('join-room').disabled = false;
  $('overlay-kicker').textContent = 'YOUR NEXT HIGH SCORE STARTS HERE'; $('overlay-title').textContent = 'Meet your match.';
  $('overlay-description').textContent = 'Return the ball. Collect power-ups. Be the last paddle standing.';
  $('start').firstChild.textContent = 'LET’S PLAY '; $('pause').disabled = true; errorMessage(null); setMode(mode); update();
}
function setMode(next) {
  mode = next;
  for (const id of ['solo','duo','online']) $(id).setAttribute('aria-pressed', String(mode === id));
  $('difficulty').disabled = mode === 'duo'; $('difficulty').closest('label').hidden = mode === 'online';
  $('online-setup').hidden = mode !== 'online'; $('start').hidden = mode === 'online' && !remote;
  $('right-touch').hidden = mode !== 'duo'; $('touch-player-name').textContent = mode === 'online' ? 'YOUR PADDLE' : 'Player 01';
  for (const button of document.querySelectorAll('[data-player="0"]')) button.setAttribute('aria-label', `${mode === 'online' ? 'Your paddle' : 'Player one'} ${button.dataset.direction === '-1' ? 'up' : 'down'}`);
  canvas.setAttribute('aria-label', mode === 'online' ? 'Game court. Use W and S, arrow keys, or drag to move your assigned paddle. Space requests pause.' : 'Game court. Player one uses W and S. Player two uses arrow keys. Space pauses.');
  $('control-hint').innerHTML = mode === 'online' ? '<kbd>W</kbd> <kbd>S</kbd> or <kbd>UP</kbd> <kbd>DOWN</kbd> YOUR PADDLE' : localControlHint;
  errorMessage(null); update();
}
$('solo').onclick = () => setMode('solo'); $('duo').onclick = () => setMode('duo'); $('online').onclick = () => setMode('online');
function start() {
  if (remote) { clearInput(); remote.ready(); canvas.focus(); return; }
  if (match?.status === 'paused') match.pause();
  else match = new Match({ mode, difficulty: Number($('difficulty').value) });
  clearInput(); $('overlay').hidden = true; $('pause').disabled = false; canvas.focus(); previous = performance.now();
  announce(mode === 'solo' ? 'Solo match started.' : 'Two-player match started.'); update();
}
$('start').onclick = start; $('back').onclick = menu; $('leave-room').onclick = menu;
function remoteOverlay() {
  if (!remote?.state) return;
  const state = remote.state, phase = remote.connected ? state.phase : 'disconnected';
  const you = state.players[remote.slot], opponent = state.players[1-remote.slot];
  $('setup').hidden = true; $('back').hidden = phase === 'playing'; $('start').hidden = phase === 'playing' || phase === 'expired';
  $('overlay').hidden = phase === 'playing'; $('pause').disabled = !['playing','paused'].includes(phase);
  $('start').disabled = !remote.connected || phase === 'disconnected' || you.ready;
  $('overlay-kicker').textContent = 'PRIVATE ROOM · ' + remote.room;
  if (phase === 'waiting') {
    $('overlay-title').textContent = opponent.connected ? 'Ready to rally?' : 'Bring a friend.';
    $('overlay-description').textContent = opponent.connected ? 'Both players choose Ready to start the match.' : 'Copy the invite above and send it to your opponent. Rooms wait for ten minutes.';
    $('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'READY TO PLAY ';
  } else if (phase === 'paused') {
    $('overlay-title').textContent = 'Rally on hold.'; $('overlay-description').textContent = 'Both players choose Resume to continue.';
    $('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'RESUME GAME ';
  } else if (phase === 'disconnected') {
    $('overlay-title').textContent = remote.connected ? 'Friend disconnected.' : 'Reconnecting…';
    $('overlay-description').textContent = 'The match is paused. Your seat is reserved for 60 seconds.'; $('start').firstChild.textContent = 'WAITING FOR CONNECTION ';
  } else if (phase === 'over') {
    const winner = state.match.winner === remote.slot ? 'You win.' : 'Your friend wins.';
    $('overlay-title').textContent = winner; $('overlay-description').textContent = 'Both players choose Rematch for another round.';
    $('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'REMATCH ';
  } else if (phase === 'expired') {
    $('overlay-title').textContent = 'Room closed.'; $('overlay-description').textContent = state.reason || 'Create a new room to play again.';
  }
  if (phase !== lastRemotePhase) {
    announce(phase === 'playing' ? 'Online match started.' : $('overlay-title').textContent);
    if (phase === 'playing') canvas.focus(); lastRemotePhase = phase;
  }
  update();
}
async function enterRoom(code = null) {
  const version = ++requestVersion; $('create-room').disabled = true; $('join-room').disabled = true; errorMessage(null);
  try {
    let room = code, token = room && sessionStorage.getItem(`wallball:${room}`);
    if (!token) {
      const result = await roomRequest(room ? `api/rooms/${room}/join` : 'api/rooms'); token = result.token; room ||= result.room;
    }
    if (version !== requestVersion) return;
    sessionStorage.setItem(`wallball:${room}`, token);
    const invite = new URL(GAME_BASE); invite.searchParams.set('room', room); history.replaceState(null, '', invite);
    $('invite-link').value = invite.href; $('active-room-code').textContent = room; $('room-bar').hidden = false;
    $('setup').hidden = true; $('start').hidden = true; $('back').hidden = false;
    $('overlay-title').textContent = 'Opening your room…'; $('overlay-description').textContent = 'Connecting you to the court.';
    remote = new RemoteClient(room, token, event => {
      if (!remote || version !== requestVersion) return;
      if (event.type === 'state') {
        match = event.state.match; $('your-seat').textContent = remote.slot === 0 ? 'YOU PLAY LEFT' : 'YOU PLAY RIGHT'; remoteOverlay();
      } else if (event.type === 'disconnected') { clearInput(); remoteOverlay(); }
      else if (event.type === 'error') {
        $('overlay').hidden = false; $('setup').hidden = true; $('start').hidden = true; $('back').hidden = false; $('pause').disabled = true;
        $('overlay-title').textContent = 'Connection closed.'; $('overlay-description').textContent = event.message; announce(event.message); update();
      }
    });
  } catch (error) { if (version === requestVersion) errorMessage(error.message); }
  finally { if (version === requestVersion) { $('create-room').disabled = false; $('join-room').disabled = false; } }
}
$('create-room').onclick = () => enterRoom();
function joinRoom() {
  const code = $('room-code').value.trim().toUpperCase();
  if (!ROOM_PATTERN.test(code)) { errorMessage('Enter the ten-character room code from your friend.'); return; }
  enterRoom(code);
}
$('join-room').onclick = joinRoom;
$('room-code').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); joinRoom(); } });
$('copy-invite').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite-link').value); $('copy-invite').textContent = 'Copied!'; setTimeout(() => { $('copy-invite').textContent = 'Copy invite'; }, 2000); }
  catch { $('invite-link').focus(); $('invite-link').select(); announce('Select and copy the invite link.'); }
};
function pause() {
  if (remote) { clearInput(); if (remote.state?.phase === 'playing') remote.pause(); else if (remote.state?.phase === 'paused') remote.ready(); return; }
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
    if (e.code === 'Space' && e.target.matches('button')) return;
    e.preventDefault();
    if (e.code === 'Space' && !e.repeat) pause(); else if (e.code === 'Escape') menu(); else keys.add(e.code);
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
function unfocused() { clearInput(); if (remote) remote.neutral(); else if (match?.status === 'playing') pause(); }
window.addEventListener('blur', unfocused); document.addEventListener('visibilitychange', () => { if (document.hidden) unfocused(); });
for (const button of document.querySelectorAll('[data-player]')) {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); touches.set(e.pointerId, { player: Number(button.dataset.player), direction: Number(button.dataset.direction) }); });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, e => touches.delete(e.pointerId));
}
function point(e) { const rect = canvas.getBoundingClientRect(); targets[0] = (e.clientY - rect.top) / rect.height * HEIGHT; }
canvas.addEventListener('pointerdown', e => { if (!['solo','online'].includes(mode) || match?.status !== 'playing') return; canvas.setPointerCapture(e.pointerId); point(e); });
canvas.addEventListener('pointermove', e => { if (canvas.hasPointerCapture(e.pointerId)) point(e); });
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => delete targets[0]);
function update() {
  $('left-name').textContent = remote?.slot === 0 ? 'YOU · PLAYER 01' : 'PLAYER 01';
  $('right-name').textContent = mode === 'solo' ? 'COMPUTER' : remote?.slot === 1 ? 'YOU · PLAYER 02' : 'PLAYER 02';
  for (const [i, side] of ['left','right'].entries()) {
    $(side+'-score').textContent = String(match?.players[i].points || 0).padStart(2,'0'); $(side+'-lives').textContent = `${match?.players[i].lives ?? 10} lives`;
  }
  if (remote) {
    const phase = remote.connected ? remote.state?.phase : 'disconnected';
    $('match-label').textContent = phase === 'playing' ? 'ONLINE MATCH' : phase === 'waiting' ? 'WAITING FOR PLAYERS' : phase === 'over' ? 'MATCH COMPLETE' : phase === 'expired' || remote.closed ? 'ROOM CLOSED' : phase === 'disconnected' ? 'RECONNECTING' : 'PAUSED';
  } else $('match-label').textContent = !match ? 'READY TO RALLY' : match.status === 'playing' ? (mode === 'solo' ? 'SOLO MATCH' : 'LOCAL TWO PLAYER') : match.status === 'paused' ? 'PAUSED' : 'MATCH COMPLETE';
  $('pause-text').textContent = match?.status === 'paused' ? 'Resume' : 'Pause';
  const effect = match?.effect;
  $('effect-label').textContent = effect ? `${POWERUPS.find(([type]) => type === effect.type)[1].toUpperCase()} · P${effect.owner+1} · ${Math.ceil(effect.until-match.time)}s` : remote?.latency != null ? `POWER-UPS · ${remote.latency}ms RTT` : 'POWER-UPS ENABLED';
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
  const dt = previous ? (now-previous)/1000 : 0; previous = now;
  const input = {0:Number(keys.has('KeyS'))-Number(keys.has('KeyW')),1:Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp')),targets};
  for (const {player,direction} of touches.values()) input[player] += direction;
  if (remote) {
    const display = remote.frame(now, {direction:Math.sign(input[0]+input[1]),target:targets[0] == null ? null : Math.max(0,Math.min(HEIGHT,targets[0]))});
    if (display) match = display; update();
  } else if (match?.status === 'playing') {
    input[0] = Math.sign(input[0]); input[1] = Math.sign(input[1]); match.step(dt,input);
    if (match.status === 'over') {
      $('overlay').hidden = false; $('setup').hidden = true; $('back').hidden = false; $('pause').disabled = true;
      const winner = match.winner === 0 ? 'Player 01' : mode === 'solo' ? 'Computer' : 'Player 02';
      $('overlay-kicker').textContent = 'THAT’S A WRAP'; $('overlay-title').textContent = `${winner} wins.`;
      $('overlay-description').textContent = `${match.players[0].points} : ${match.players[1].points} returns. Ready for a rematch?`;
      $('start').firstChild.textContent = 'PLAY AGAIN '; $('start').focus(); announce(`${winner} wins.`);
    }
    update();
  }
  render(); requestAnimationFrame(frame);
}
const inviteCode = new URL(location.href).searchParams.get('room')?.trim().toUpperCase();
setMode('solo'); menu();
if (inviteCode) { setMode('online'); $('room-code').value = inviteCode; joinRoom(); }
requestAnimationFrame(frame);
