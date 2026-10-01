import { Match, WIDTH, HEIGHT, POWERUPS } from './engine.js';
import { RemoteClient, roomRequest, ROOM_PATTERN, GAME_BASE } from './network.js';
const byId = (id) => document.getElementById(id);
const canvas = byId('game'),
  ctx = canvas.getContext('2d'),
  localControlHint = byId('control-hint').innerHTML;
// Local modes simulate here; online mode draws snapshots owned by GameRoom.
let match = null,
  mode = 'solo',
  previous = 0,
  remote = null,
  requestVersion = 0,
  lastRemotePhase = null;
const keys = new Set(),
  touches = new Map(),
  targets = {},
  images = new Map();
for (const [type, label] of POWERUPS) {
  const image = new Image();
  image.src = `assets/${type}.png`;
  images.set(type, image);
  const item = document.createElement('span'),
    icon = document.createElement('img');
  icon.src = image.src;
  icon.alt = '';
  item.append(icon, document.createTextNode(label));
  byId('powerup-list').append(item);
}
function announce(text) {
  byId('announcement').textContent = text;
}
function clearInput() {
  keys.clear();
  touches.clear();
  for (const key of Object.keys(targets)) delete targets[key];
}
function errorMessage(message) {
  byId('connection-error').hidden = !message;
  byId('connection-error').textContent = message || '';
}
function menu() {
  requestVersion++;
  if (remote) {
    sessionStorage.removeItem(`wallball:${remote.room}`);
    remote.destroy();
    remote = null;
  }
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  match = null;
  lastRemotePhase = null;
  clearInput();
  byId('overlay').hidden = false;
  byId('setup').hidden = false;
  byId('back').hidden = true;
  byId('room-bar').hidden = true;
  byId('start').disabled = false;
  byId('create-room').disabled = false;
  byId('join-room').disabled = false;
  byId('overlay-kicker').textContent = 'YOUR NEXT HIGH SCORE STARTS HERE';
  byId('overlay-title').textContent = 'Meet your match.';
  byId('overlay-description').textContent =
    'Return the ball. Collect power-ups. Be the last paddle standing.';
  byId('start').firstChild.textContent = 'LET’S PLAY ';
  byId('pause').disabled = true;
  errorMessage(null);
  setMode(mode);
  update();
}
function setMode(next) {
  mode = next;
  for (const id of ['solo', 'duo', 'online'])
    byId(id).setAttribute('aria-pressed', String(mode === id));
  byId('difficulty').disabled = mode === 'duo';
  byId('difficulty').closest('label').hidden = mode === 'online';
  byId('online-setup').hidden = mode !== 'online';
  byId('start').hidden = mode === 'online' && !remote;
  byId('right-touch').hidden = mode !== 'duo';
  byId('touch-player-name').textContent = mode === 'online' ? 'YOUR PADDLE' : 'Player 01';
  for (const button of document.querySelectorAll('[data-player="0"]'))
    button.setAttribute(
      'aria-label',
      `${mode === 'online' ? 'Your paddle' : 'Player one'} ${button.dataset.direction === '-1' ? 'up' : 'down'}`,
    );
  canvas.setAttribute(
    'aria-label',
    mode === 'online'
      ? 'Game court. Use W and S, arrow keys, or drag to move your assigned paddle. Space requests pause.'
      : 'Game court. Player one uses W and S. Player two uses arrow keys. Space pauses.',
  );
  byId('control-hint').innerHTML =
    mode === 'online'
      ? '<kbd>W</kbd> <kbd>S</kbd> or <kbd>UP</kbd> <kbd>DOWN</kbd> YOUR PADDLE'
      : localControlHint;
  errorMessage(null);
  update();
}
byId('solo').onclick = () => setMode('solo');
byId('duo').onclick = () => setMode('duo');
byId('online').onclick = () => setMode('online');
function start() {
  if (remote) {
    clearInput();
    remote.ready();
    canvas.focus();
    return;
  }
  if (match?.status === 'paused') match.pause();
  else match = new Match({ mode, difficulty: Number(byId('difficulty').value) });
  clearInput();
  byId('overlay').hidden = true;
  byId('pause').disabled = false;
  canvas.focus();
  previous = performance.now();
  announce(mode === 'solo' ? 'Solo match started.' : 'Two-player match started.');
  update();
}
byId('start').onclick = start;
byId('back').onclick = menu;
byId('leave-room').onclick = menu;
function remoteOverlay() {
  if (!remote?.state) return;
  const state = remote.state,
    phase = remote.connected ? state.phase : 'disconnected';
  const you = state.players[remote.slot],
    opponent = state.players[1 - remote.slot];
  byId('setup').hidden = true;
  byId('back').hidden = phase === 'playing';
  byId('start').hidden = phase === 'playing' || phase === 'expired';
  byId('overlay').hidden = phase === 'playing';
  byId('pause').disabled = !['playing', 'paused'].includes(phase);
  byId('start').disabled = !remote.connected || phase === 'disconnected' || you.ready;
  byId('overlay-kicker').textContent = 'PRIVATE ROOM · ' + remote.room;
  if (phase === 'waiting') {
    byId('overlay-title').textContent = opponent.connected ? 'Ready to rally?' : 'Bring a friend.';
    byId('overlay-description').textContent = opponent.connected
      ? 'Both players choose Ready to start the match.'
      : 'Copy the invite above and send it to your opponent. Rooms wait for ten minutes.';
    byId('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'READY TO PLAY ';
  } else if (phase === 'paused') {
    byId('overlay-title').textContent = 'Rally on hold.';
    byId('overlay-description').textContent = 'Both players choose Resume to continue.';
    byId('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'RESUME GAME ';
  } else if (phase === 'disconnected') {
    byId('overlay-title').textContent = remote.connected ? 'Friend disconnected.' : 'Reconnecting…';
    byId('overlay-description').textContent =
      'The match is paused. Your seat is reserved for 60 seconds.';
    byId('start').firstChild.textContent = 'WAITING FOR CONNECTION ';
  } else if (phase === 'over') {
    const winner = state.match.winner === remote.slot ? 'You win.' : 'Your friend wins.';
    byId('overlay-title').textContent = winner;
    byId('overlay-description').textContent = 'Both players choose Rematch for another round.';
    byId('start').firstChild.textContent = you.ready ? 'WAITING FOR FRIEND ' : 'REMATCH ';
  } else if (phase === 'expired') {
    byId('overlay-title').textContent = 'Room closed.';
    byId('overlay-description').textContent = state.reason || 'Create a new room to play again.';
  }
  if (phase !== lastRemotePhase) {
    announce(phase === 'playing' ? 'Online match started.' : byId('overlay-title').textContent);
    if (phase === 'playing') canvas.focus();
    lastRemotePhase = phase;
  }
  update();
}
// Ignore a late room request if the player has already left the menu.
async function enterRoom(code = null) {
  const version = ++requestVersion;
  byId('create-room').disabled = true;
  byId('join-room').disabled = true;
  errorMessage(null);
  try {
    let room = code,
      token = room && sessionStorage.getItem(`wallball:${room}`);
    if (!token) {
      const result = await roomRequest(room ? `api/rooms/${room}/join` : 'api/rooms');
      token = result.token;
      room ||= result.room;
    }
    if (version !== requestVersion) return;
    sessionStorage.setItem(`wallball:${room}`, token);
    const invite = new URL(GAME_BASE);
    invite.searchParams.set('room', room);
    history.replaceState(null, '', invite);
    byId('invite-link').value = invite.href;
    byId('active-room-code').textContent = room;
    byId('room-bar').hidden = false;
    byId('setup').hidden = true;
    byId('start').hidden = true;
    byId('back').hidden = false;
    byId('overlay-title').textContent = 'Opening your room…';
    byId('overlay-description').textContent = 'Connecting you to the court.';
    remote = new RemoteClient(room, token, (event) => {
      if (!remote || version !== requestVersion) return;
      if (event.type === 'state') {
        match = event.state.match;
        byId('your-seat').textContent = remote.slot === 0 ? 'YOU PLAY LEFT' : 'YOU PLAY RIGHT';
        remoteOverlay();
      } else if (event.type === 'disconnected') {
        clearInput();
        remoteOverlay();
      } else if (event.type === 'error') {
        byId('overlay').hidden = false;
        byId('setup').hidden = true;
        byId('start').hidden = true;
        byId('back').hidden = false;
        byId('pause').disabled = true;
        byId('overlay-title').textContent = 'Connection closed.';
        byId('overlay-description').textContent = event.message;
        announce(event.message);
        update();
      }
    });
  } catch (error) {
    if (version === requestVersion) errorMessage(error.message);
  } finally {
    if (version === requestVersion) {
      byId('create-room').disabled = false;
      byId('join-room').disabled = false;
    }
  }
}
byId('create-room').onclick = () => enterRoom();
function joinRoom() {
  const code = byId('room-code').value.trim().toUpperCase();
  if (!ROOM_PATTERN.test(code)) {
    errorMessage('Enter the ten-character room code from your friend.');
    return;
  }
  enterRoom(code);
}
byId('join-room').onclick = joinRoom;
byId('room-code').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    joinRoom();
  }
});
byId('copy-invite').onclick = async () => {
  try {
    await navigator.clipboard.writeText(byId('invite-link').value);
    byId('copy-invite').textContent = 'Copied!';
    setTimeout(() => {
      byId('copy-invite').textContent = 'Copy invite';
    }, 2000);
  } catch {
    byId('invite-link').focus();
    byId('invite-link').select();
    announce('Select and copy the invite link.');
  }
};
function pause() {
  if (remote) {
    clearInput();
    if (remote.state?.phase === 'playing') remote.pause();
    else if (remote.state?.phase === 'paused') remote.ready();
    return;
  }
  if (!match || match.status === 'over') return;
  match.pause();
  clearInput();
  byId('overlay').hidden = match.status !== 'paused';
  if (match.status === 'paused') {
    byId('setup').hidden = true;
    byId('back').hidden = false;
    byId('overlay-kicker').textContent = 'TAKE A BREATHER';
    byId('overlay-title').textContent = 'Rally on hold.';
    byId('overlay-description').textContent = 'Your match will be right here.';
    byId('start').firstChild.textContent = 'RESUME GAME ';
    byId('start').focus();
    announce('Game paused.');
  } else {
    canvas.focus();
    announce('Game resumed.');
  }
  update();
}
byId('pause').onclick = pause;
window.addEventListener('keydown', (e) => {
  if (e.target.matches('select, input, textarea')) return;
  if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Space', 'Escape'].includes(e.code) && match) {
    if (e.code === 'Space' && e.target.matches('button')) return;
    e.preventDefault();
    if (e.code === 'Space' && !e.repeat) pause();
    else if (e.code === 'Escape') menu();
    else keys.add(e.code);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function unfocused() {
  clearInput();
  if (remote) remote.neutral();
  else if (match?.status === 'playing') pause();
}
window.addEventListener('blur', unfocused);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) unfocused();
});
for (const button of document.querySelectorAll('[data-player]')) {
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, {
      player: Number(button.dataset.player),
      direction: Number(button.dataset.direction),
    });
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(event, (e) => touches.delete(e.pointerId));
}
function point(e) {
  const rect = canvas.getBoundingClientRect();
  targets[0] = ((e.clientY - rect.top) / rect.height) * HEIGHT;
}
canvas.addEventListener('pointerdown', (e) => {
  if (!['solo', 'online'].includes(mode) || match?.status !== 'playing') return;
  canvas.setPointerCapture(e.pointerId);
  point(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (canvas.hasPointerCapture(e.pointerId)) point(e);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(event, () => delete targets[0]);
function update() {
  byId('left-name').textContent = remote?.slot === 0 ? 'YOU · PLAYER 01' : 'PLAYER 01';
  byId('right-name').textContent =
    mode === 'solo' ? 'COMPUTER' : remote?.slot === 1 ? 'YOU · PLAYER 02' : 'PLAYER 02';
  for (const [i, side] of ['left', 'right'].entries()) {
    byId(side + '-score').textContent = String(match?.players[i].points || 0).padStart(2, '0');
    byId(side + '-lives').textContent = `${match?.players[i].lives ?? 10} lives`;
  }
  if (remote) {
    const phase = remote.connected ? remote.state?.phase : 'disconnected';
    byId('match-label').textContent =
      phase === 'playing'
        ? 'ONLINE MATCH'
        : phase === 'waiting'
          ? 'WAITING FOR PLAYERS'
          : phase === 'over'
            ? 'MATCH COMPLETE'
            : phase === 'expired' || remote.closed
              ? 'ROOM CLOSED'
              : phase === 'disconnected'
                ? 'RECONNECTING'
                : 'PAUSED';
  } else
    byId('match-label').textContent = !match
      ? 'READY TO RALLY'
      : match.status === 'playing'
        ? mode === 'solo'
          ? 'SOLO MATCH'
          : 'LOCAL TWO PLAYER'
        : match.status === 'paused'
          ? 'PAUSED'
          : 'MATCH COMPLETE';
  byId('pause-text').textContent = match?.status === 'paused' ? 'Resume' : 'Pause';
  const effect = match?.effect;
  byId('effect-label').textContent = effect
    ? `${POWERUPS.find(([type]) => type === effect.type)[1].toUpperCase()} · P${effect.owner + 1} · ${Math.ceil(effect.until - match.time)}s`
    : remote?.latency != null
      ? `POWER-UPS · ${remote.latency}ms RTT`
      : 'POWER-UPS ENABLED';
}
function drawCourt() {
  ctx.fillStyle = '#0c1014';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#202a31';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 16);
  ctx.lineTo(WIDTH / 2, HEIGHT - 16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#1a232b';
  ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
}

function drawPlayer(player, slot) {
  ctx.fillStyle = slot === 0 ? '#9bf5d1' : '#ffb377';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.fillRect(slot === 0 ? 20 : WIDTH - 30, player.y - player.height / 2, 10, player.height);
  ctx.shadowBlur = 0;
}

function drawBall(ball) {
  ctx.fillStyle = '#f0f1ec';
  ctx.shadowColor = '#f0f1ec';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPowerup(powerup) {
  if (!powerup) return;
  ctx.strokeStyle = '#9bf5d1';
  ctx.strokeRect(powerup.x - 19, powerup.y - 19, 38, 38);
  const image = images.get(powerup.type);
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, powerup.x - 14, powerup.y - 14, 28, 28);
  }
}

function render() {
  drawCourt();
  const players = match?.players || [
    { y: 250, height: 70 },
    { y: 250, height: 70 },
  ];
  players.forEach(drawPlayer);
  const balls = match?.balls || [{ x: WIDTH / 2, y: HEIGHT / 2, radius: 8 }];
  balls.forEach(drawBall);
  drawPowerup(match?.powerup);
  if (match?.status === 'playing' && !match.balls.length) {
    ctx.fillStyle = '#989faa';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GET READY', WIDTH / 2, HEIGHT / 2 - 30);
  }
}
// Rendering runs every animation frame. Network inputs and server snapshots
// use their own lower rates in RemoteClient.
function frame(now) {
  const dt = previous ? (now - previous) / 1000 : 0;
  previous = now;
  const input = {
    0: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    1: Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
    targets,
  };
  for (const { player, direction } of touches.values()) input[player] += direction;
  if (remote) {
    const display = remote.frame(now, {
      direction: Math.sign(input[0] + input[1]),
      target: targets[0] == null ? null : Math.max(0, Math.min(HEIGHT, targets[0])),
    });
    if (display) match = display;
    update();
  } else if (match?.status === 'playing') {
    input[0] = Math.sign(input[0]);
    input[1] = Math.sign(input[1]);
    match.step(dt, input);
    if (match.status === 'over') {
      byId('overlay').hidden = false;
      byId('setup').hidden = true;
      byId('back').hidden = false;
      byId('pause').disabled = true;
      const winner = match.winner === 0 ? 'Player 01' : mode === 'solo' ? 'Computer' : 'Player 02';
      byId('overlay-kicker').textContent = 'THAT’S A WRAP';
      byId('overlay-title').textContent = `${winner} wins.`;
      byId('overlay-description').textContent =
        `${match.players[0].points} : ${match.players[1].points} returns. Ready for a rematch?`;
      byId('start').firstChild.textContent = 'PLAY AGAIN ';
      byId('start').focus();
      announce(`${winner} wins.`);
    }
    update();
  }
  render();
  requestAnimationFrame(frame);
}
const inviteCode = new URL(location.href).searchParams.get('room')?.trim().toUpperCase();
setMode('solo');
menu();
if (inviteCode) {
  setMode('online');
  byId('room-code').value = inviteCode;
  joinRoom();
}
requestAnimationFrame(frame);
