// Brawl Nexus — MVP Plus
// P1: WASD + F(attack) G(special) Shift(dash)
// P2: Arrows + K(attack) L(special) /(dash)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 800, H = 450;
const GROUND = H - 80;
const GRAVITY = 0.55;
const JUMP_FORCE = -12.6;
const MOVE_ACCEL = 1.7;
const MAX_SPEED = 5.2;
const FRICTION = 0.8;
const WIN_ROUNDS = 2;

let gameRunning = false;
let gamePaused = false;
let isOnline = false;
let socket = null;
let myRole = null;
let remoteInputs = {};
let shake = 0;
let hitStop = 0;
let effects = [];

const COLORS = {
  p1: { body: '#e63946', trim: '#ff9f6e', name: 'KADE' },
  p2: { body: '#4361ee', trim: '#72efdd', name: 'VEX' }
};

const arena = {
  bg: '#0d0d1a',
  floorColor: '#ff006e',
  platforms: [
    { x: 0, y: GROUND, w: W, h: 80, color: '#1a1a2e' },
    { x: 120, y: 312, w: 145, h: 14, color: '#2a2a4e' },
    { x: 535, y: 312, w: 145, h: 14, color: '#2a2a4e' },
    { x: 306, y: 252, w: 188, h: 14, color: '#34174e' }
  ]
};

function makePlayer(x, isP2) {
  return {
    x, y: GROUND - 60,
    vx: 0, vy: 0,
    w: 36, h: 60,
    hp: 100, maxHp: 100,
    mp: 100, maxMp: 100,
    facing: isP2 ? -1 : 1,
    onGround: false,
    attacking: false, attackTimer: 0, attackHit: false,
    specialTimer: 0, isSpecial: false,
    stunTimer: 0,
    comboCount: 0, comboTimer: 0,
    dashCd: 0, trail: 0,
    dead: false, score: 0, isP2
  };
}

let players = {};
let keys = {};
let particles = [];
let roundWinner = null;
let bannerTimer = 0;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener('resize', resizeCanvas);

function showUI(playing) {
  document.getElementById('ui').style.display = playing ? 'none' : 'block';
  canvas.style.display = playing ? 'block' : 'none';
  document.getElementById('hud').style.display = playing ? 'flex' : 'none';
  document.getElementById('controls').style.display = playing ? 'flex' : 'none';
}

function startLocal() { showUI(true); resizeCanvas(); bootMatch(false); }

function showMulti() { document.getElementById('room-box').style.display = 'flex'; }

function joinRoom() {
  const code = document.getElementById('room-input').value.trim().toUpperCase();
  const statusEl = document.getElementById('status');
  if (!code) return;
  statusEl.textContent = 'Connecting...';
  socket = io();
  socket.on('connect', () => { statusEl.textContent = 'Connected. Joining ' + code + '...'; socket.emit('join', { room: code }); });
  socket.on('role', ({ role, room }) => { myRole = role; });
  socket.on('status', ({ msg }) => statusEl.textContent = msg);
  socket.on('start', () => startOnline());
  socket.on('input', (data) => { remoteInputs = data || {}; });
  socket.on('peer-left', () => showBanner('OPPONENT LEFT'));
  socket.on('connect_error', () => { statusEl.textContent = 'Server unavailable. Try local mode.'; });
}

function startOnline() { showUI(true); resizeCanvas(); bootMatch(true); }

function bootMatch(online) {
  isOnline = online;
  gameRunning = true;
  gamePaused = false;
  shake = 0; hitStop = 0; roundWinner = null;
  particles = []; effects = [];
  players.p1 = makePlayer(170, false);
  players.p2 = makePlayer(594, true);
  showBanner('ROUND 1');
  updateHUD();
  requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyR') restartMatch();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

function togglePause() { if (!gameRunning) return; gamePaused = !gamePaused; showBanner(gamePaused ? 'PAUSED' : 'FIGHT!'); }

function restartMatch() {
  if (!gameRunning) return;
  players.p1 = makePlayer(170, false);
  players.p2 = makePlayer(594, true);
  particles = []; effects = []; roundWinner = null;
  showBanner('MATCH RESET');
  updateHUD();
}

function getP1Input() {
  return { left: !!keys['KeyA'], right: !!keys['KeyD'], up: !!keys['KeyW'], attack: !!keys['KeyF'], special: !!keys['KeyG'], dash: !!keys['ShiftLeft'] };
}
function getP2Input() {
  return { left: !!keys['ArrowLeft'], right: !!keys['ArrowRight'], up: !!keys['ArrowUp'], attack: !!keys['KeyK'], special: !!keys['KeyL'], dash: !!keys['Slash'] };
}

function spawnParticle(x, y, color, count = 6, speed = 4) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 1, decay: 0.03 + Math.random() * 0.035, r: 2 + Math.random() * 4, color });
  }
}
function spawnText(x, y, text, color = '#ffde59') { effects.push({ x, y, vy: -0.6, life: 1, decay: 0.02, text, color }); }
function addShake(p = 5) { shake = Math.max(shake, p); }
function addHitStop(f = 3) { hitStop = Math.max(hitStop, f); }

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function getAttackBox(p, special) {
  const reach = special ? 92 : 58;
  return { x: p.facing > 0 ? p.x + p.w : p.x - reach, y: p.y + 10, w: reach, h: p.h - 20 };
}
function platformCollide(p) {
  for (const plat of arena.platforms) {
    if (p.x + p.w > plat.x && p.x < plat.x + plat.w &&
        p.y + p.h > plat.y && p.y + p.h < plat.y + plat.h + 18 && p.vy >= 0) {
      if (!p.onGround && p.vy > 1) spawnParticle(p.x + p.w / 2, plat.y, '#c2d4ff', 5, 2);
      p.y = plat.y - p.h; p.vy = 0; p.onGround = true;
      return true;
    }
  }
  return false;
}

function dashPlayer(p) {
  if (p.dashCd > 0 || !p.onGround) return;
  p.vx += p.facing * 9;
  p.dashCd = 40; p.trail = 10;
  spawnParticle(p.x + p.w / 2, p.y + p.h / 2, p.isP2 ? COLORS.p2.trim : COLORS.p1.trim, 10, 3);
  addShake(2);
}

function updatePlayer(p, input, other) {
  if (p.dead) return;
  if (p.stunTimer > 0) p.stunTimer--;
  if (p.attackTimer > 0) p.attackTimer--;
  if (p.specialTimer > 0) p.specialTimer--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.comboTimer > 0) p.comboTimer--; else p.comboCount = 0;
  if (p.trail > 0) p.trail--;

  if (p.stunTimer <= 0) {
    if (input.left) { p.vx -= MOVE_ACCEL; p.facing = -1; }
    if (input.right) { p.vx += MOVE_ACCEL; p.facing = 1; }
    if (input.up && p.onGround) { p.vy = JUMP_FORCE; p.onGround = false; spawnParticle(p.x + p.w / 2, p.y + p.h, '#c2d4ff', 5, 2); }
    if (input.dash) dashPlayer(p);
  }

  if (input.attack && p.attackTimer <= 0 && p.stunTimer <= 0) {
    p.attacking = true; p.attackTimer = 18; p.attackHit = false;
    p.comboCount = Math.min(p.comboCount + 1, 5); p.comboTimer = 54;
    p.mp = Math.max(0, p.mp - 2);
  } else if (p.attackTimer <= 0) p.attacking = false;

  if (input.special && p.specialTimer <= 0 && p.mp >= 30 && p.stunTimer <= 0) {
    p.isSpecial = true; p.specialTimer = 34; p.attackHit = false; p.mp -= 30;
    spawnParticle(p.x + p.w / 2, p.y + p.h / 2, p.isP2 ? COLORS.p2.trim : COLORS.p1.trim, 18, 5);
    addShake(4);
  } else if (p.specialTimer <= 0) p.isSpecial = false;

  if ((p.attacking || p.isSpecial) && !p.attackHit) {
    const aBox = getAttackBox(p, p.isSpecial);
    const oBox = { x: other.x, y: other.y, w: other.w, h: other.h };
    if (rectOverlap(aBox, oBox)) {
      p.attackHit = true;
      const dmg = p.isSpecial ? 18 + p.comboCount * 2 : 8 + p.comboCount;
      other.hp = Math.max(0, other.hp - dmg);
      other.stunTimer = p.isSpecial ? 26 : 12;
      other.vx += p.facing * (p.isSpecial ? 9 : 4.8);
      other.vy += p.isSpecial ? -8 : -2.7;
      p.mp = Math.min(p.maxMp, p.mp + (p.isSpecial ? 6 : 8));
      spawnParticle(other.x + other.w / 2, other.y + other.h / 2, '#ffffff', 5, 4);
      spawnParticle(other.x + other.w / 2, other.y + other.h / 2, '#ff9900', 8, p.isSpecial ? 6 : 4);
      spawnText(other.x + other.w / 2, other.y - 4, '-' + dmg, p.isSpecial ? '#ff8c42' : '#ffde59');
      addShake(p.isSpecial ? 8 : 4);
      addHitStop(p.isSpecial ? 5 : 2);
    }
  }

  if (p.mp < p.maxMp && Math.random() < 0.012) p.mp = Math.min(p.maxMp, p.mp + 1);

  p.vy += GRAVITY;
  p.vx *= FRICTION;
  p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
  p.x += p.vx;
  p.y += p.vy;

  p.onGround = false;
  platformCollide(p);
  p.x = Math.max(0, Math.min(W - p.w, p.x));
  if (p.y > H) { p.y = GROUND - p.h; p.vy = 0; p.onGround = true; spawnParticle(p.x + p.w / 2, GROUND, '#c2d4ff', 6, 2); }
  if (p.hp <= 0) p.dead = true;
}

function updateEffects() {
  for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.14; pt.life -= pt.decay; pt.r *= 0.97; }
  particles = particles.filter(p => p.life > 0);
  for (const fx of effects) { fx.y += fx.vy; fx.life -= fx.decay; }
  effects = effects.filter(f => f.life > 0);
  if (shake > 0) shake *= 0.82;
}

function drawBackground() {
  ctx.fillStyle = arena.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (const plat of arena.platforms) {
    const grad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + plat.h);
    grad.addColorStop(0, plat.color); grad.addColorStop(1, '#0a0a12');
    ctx.fillStyle = grad;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.strokeStyle = arena.floorColor;
    ctx.globalAlpha = 0.38;
    ctx.beginPath(); ctx.moveTo(plat.x, plat.y); ctx.lineTo(plat.x + plat.w, plat.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(p, key) {
  const c = COLORS[key];
  const cx = p.x + p.w / 2;

  if (p.trail > 0) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = c.trim;
    ctx.fillRect(p.x + 6 - p.facing * 10, p.y + 20, p.w - 12, p.h - 20);
    ctx.globalAlpha = 1;
  }

  ctx.save();
  if (p.stunTimer > 0) ctx.globalAlpha = 0.62;

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(cx, GROUND, p.w * 0.62, 6, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = c.body;
  ctx.fillRect(p.x + 6, p.y + 20, p.w - 12, p.h - 20);

  ctx.fillStyle = '#f4a261';
  ctx.beginPath(); ctx.arc(cx, p.y + 14, 14, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#0a0a12';
  const eyeOff = p.facing * 4;
  ctx.beginPath(); ctx.arc(cx + eyeOff + 3, p.y + 12, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + eyeOff - 3, p.y + 12, 2.5, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = c.body;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  if (p.attacking || p.isSpecial) {
    const px = p.x + (p.facing > 0 ? p.w + 26 : -26);
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(px, p.y + 28); ctx.stroke();
    if (p.isSpecial) {
      ctx.strokeStyle = c.trim; ctx.lineWidth = 3; ctx.globalAlpha = 0.72;
      ctx.beginPath(); ctx.arc(px, p.y + 28, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(p.x + 2, p.y + 42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(p.x + p.w - 2, p.y + 42); ctx.stroke();
  }

  ctx.strokeStyle = '#202020'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx - 6, p.y + p.h - 8); ctx.lineTo(p.x + 4, p.y + p.h + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, p.y + p.h - 8); ctx.lineTo(p.x + p.w - 4, p.y + p.h + 6); ctx.stroke();

  ctx.strokeStyle = c.trim; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
  ctx.strokeRect(p.x + 6, p.y + 20, p.w - 12, p.h - 20);
  ctx.globalAlpha = 1;

  if (p.comboCount >= 2) {
    ctx.fillStyle = '#ffde59';
    ctx.font = 'bold 13px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(p.comboCount + 'x COMBO', cx, p.y - 8);
  }
  ctx.restore();
}

function drawEffects() {
  for (const pt of particles) {
    ctx.save(); ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const fx of effects) {
    ctx.save(); ctx.globalAlpha = fx.life; ctx.fillStyle = fx.color;
    ctx.font = 'bold 16px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(fx.text, fx.x, fx.y);
    ctx.restore();
  }
}

function updateHUD() {
  const p1 = players.p1, p2 = players.p2;
  if (!p1 || !p2) return;
  document.getElementById('p1-hp').style.width = (p1.hp / p1.maxHp * 100) + '%';
  document.getElementById('p1-mp').style.width = (p1.mp / p1.maxMp * 100) + '%';
  document.getElementById('p2-hp').style.width = (p2.hp / p2.maxHp * 100) + '%';
  document.getElementById('p2-mp').style.width = (p2.mp / p2.maxMp * 100) + '%';
  document.getElementById('p1-score').textContent = 'Rounds: ' + p1.score;
  document.getElementById('p2-score').textContent = 'Rounds: ' + p2.score;
}

function showBanner(text) {
  const b = document.getElementById('round-banner');
  b.textContent = text; b.style.display = 'block';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.style.display = 'none', 2000);
}

function checkRound() {
  if (roundWinner) return;
  const p1 = players.p1, p2 = players.p2;
  if (p1.dead || p1.hp <= 0) finishRound('p2');
  else if (p2.dead || p2.hp <= 0) finishRound('p1');
}

function finishRound(winner) {
  roundWinner = winner;
  players[winner].score += 1;
  addShake(10);
  spawnParticle(W / 2, H / 2, '#ff9900', 30, 7);
  spawnParticle(W / 2, H / 2, '#ffffff', 12, 5);
  showBanner(COLORS[winner].name + ' WINS!');
  updateHUD();
  if (players[winner].score >= WIN_ROUNDS) {
    setTimeout(() => { showBanner(COLORS[winner].name + ' TAKES THE MATCH!'); setTimeout(restartMatch, 2400); }, 1200);
  } else {
    setTimeout(nextRound, 1800);
  }
}

function nextRound() {
  const s1 = players.p1.score, s2 = players.p2.score;
  players.p1 = makePlayer(170, false);
  players.p2 = makePlayer(594, true);
  players.p1.score = s1; players.p2.score = s2;
  particles = []; effects = []; roundWinner = null;
  showBanner('ROUND ' + (s1 + s2 + 1));
  updateHUD();
}

let lastTime = 0;
function gameLoop(ts) {
  if (!gameRunning) return;
  if (gamePaused) { requestAnimationFrame(gameLoop); return; }
  lastTime = ts;
  if (hitStop > 0) { hitStop--; drawFrame(); requestAnimationFrame(gameLoop); return; }

  let inp1, inp2;
  if (isOnline) {
    const myInput = getP1Input();
    if (socket && socket.connected) socket.emit('input', myInput);
    inp1 = myRole === 'p1' ? myInput : remoteInputs;
    inp2 = myRole === 'p2' ? myInput : remoteInputs;
  } else {
    inp1 = getP1Input();
    inp2 = getP2Input();
  }

  updatePlayer(players.p1, inp1 || {}, players.p2);
  updatePlayer(players.p2, inp2 || {}, players.p1);
  updateEffects();
  checkRound();
  updateHUD();
  drawFrame();
  requestAnimationFrame(gameLoop);
}

function drawFrame() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  drawEffects();
  drawPlayer(players.p1, 'p1');
  drawPlayer(players.p2, 'p2');
  ctx.restore();
}
