// Brawl Nexus — MVP Game Engine
// Controls: P1 = WASD + F(attack) + G(special) | P2 = Arrows + K(attack) + L(special)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = 800, H = 450;
const GROUND = H - 80;
const GRAVITY = 0.55;
const JUMP_FORCE = -13;
const MOVE_SPEED = 4;
const FRICTION = 0.75;

let gameRunning = false;
let isOnline = false;
let socket = null;
let myRole = null; // 'p1' or 'p2'
let remoteInputs = {};

const COLORS = {
  p1: { body: '#e63946', trim: '#ff6b6b', name: 'KADE' },
  p2: { body: '#4361ee', trim: '#72efdd', name: 'VEX' }
};

const ARENAS = [
  {
    name: 'Neon Alley',
    bg: '#0d0d1a',
    platforms: [
      { x: 0, y: GROUND, w: W, h: 80, color: '#1a1a2e' },
      { x: 120, y: 310, w: 140, h: 14, color: '#2a2a4e' },
      { x: 540, y: 310, w: 140, h: 14, color: '#2a2a4e' },
      { x: 310, y: 250, w: 160, h: 14, color: '#3a1a4e' },
    ],
    accentColor: '#ff006e',
    floorColor: '#ff006e'
  }
];

const arena = ARENAS[0];

function makePlayer(x, isP2) {
  return {
    x, y: GROUND - 60,
    vx: 0, vy: 0,
    w: 36, h: 60,
    hp: 100, maxHp: 100,
    mp: 100, maxMp: 100,
    facing: isP2 ? -1 : 1,
    onGround: false,
    attacking: false,
    attackTimer: 0,
    attackHit: false,
    specialTimer: 0,
    isSpecial: false,
    stunTimer: 0,
    knockback: { x: 0, y: 0 },
    comboCount: 0,
    comboTimer: 0,
    dead: false,
    isP2
  };
}

let players = {};
let keys = {};
let particles = [];
let roundWinner = null;
let roundTimer = 0;

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  canvas.style.left = (window.innerWidth - W * scale) / 2 + 'px';
  canvas.style.top = (window.innerHeight - H * scale) / 2 + 'px';
  canvas.width = W;
  canvas.height = H;
}

window.addEventListener('resize', resizeCanvas);

function startLocal() {
  document.getElementById('ui').style.display = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').style.display = 'flex';
  resizeCanvas();
  players.p1 = makePlayer(180, false);
  players.p2 = makePlayer(580, true);
  isOnline = false;
  gameRunning = true;
  roundWinner = null;
  requestAnimationFrame(gameLoop);
}

function showMulti() {
  document.getElementById('room-box').style.display = 'flex';
}

function joinRoom() {
  const code = document.getElementById('room-input').value.trim().toUpperCase();
  if (!code) return;
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Connecting...';

  try {
    socket = io();
    socket.on('connect', () => {
      statusEl.textContent = 'Connected. Joining room ' + code + '...';
      socket.emit('join', { room: code });
    });
    socket.on('role', ({ role, room }) => {
      myRole = role;
      statusEl.textContent = `You are ${role.toUpperCase()} in room ${room}. Waiting for opponent...`;
    });
    socket.on('start', () => {
      startOnline();
    });
    socket.on('input', (data) => {
      remoteInputs = data;
    });
    socket.on('disconnect', () => {
      if (gameRunning) showBanner('OPPONENT DISCONNECTED');
    });
    socket.on('connect_error', () => {
      statusEl.textContent = 'Server unavailable. Try Local 2-Player mode.';
    });
  } catch(e) {
    statusEl.textContent = 'Multiplayer requires server. Using Local mode.';
    startLocal();
  }
}

function startOnline() {
  document.getElementById('ui').style.display = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').style.display = 'flex';
  resizeCanvas();
  players.p1 = makePlayer(180, false);
  players.p2 = makePlayer(580, true);
  isOnline = true;
  gameRunning = true;
  roundWinner = null;
  requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup', e => { keys[e.code] = false; });

function getP1Input() {
  return {
    left: !!keys['KeyA'],
    right: !!keys['KeyD'],
    up: !!keys['KeyW'],
    attack: !!keys['KeyF'],
    special: !!keys['KeyG']
  };
}

function getP2Input() {
  return {
    left: !!keys['ArrowLeft'],
    right: !!keys['ArrowRight'],
    up: !!keys['ArrowUp'],
    attack: !!keys['KeyK'],
    special: !!keys['KeyL']
  };
}

function spawnParticle(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: 0.04 + Math.random() * 0.04,
      r: 3 + Math.random() * 4,
      color
    });
  }
}

function spawnHitSpark(x, y) {
  spawnParticle(x, y, '#fff', 4);
  spawnParticle(x, y, '#ff9900', 6);
}

function spawnSpecialEffect(x, y, color) {
  spawnParticle(x, y, color, 18);
  spawnParticle(x, y, '#fff', 8);
}

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function getAttackBox(p, isSpecial) {
  const reach = isSpecial ? 90 : 55;
  return {
    x: p.facing > 0 ? p.x + p.w : p.x - reach,
    y: p.y + 10,
    w: reach, h: p.h - 20
  };
}

function platformCollide(p) {
  for (const plat of arena.platforms) {
    if (
      p.x + p.w > plat.x && p.x < plat.x + plat.w &&
      p.y + p.h > plat.y && p.y + p.h < plat.y + plat.h + 18 &&
      p.vy >= 0
    ) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.onGround = true;
      return true;
    }
  }
  return false;
}

function updatePlayer(p, input, other) {
  if (p.dead) return;
  if (p.stunTimer > 0) { p.stunTimer--; }

  // Movement
  if (p.stunTimer <= 0) {
    if (input.left) { p.vx -= MOVE_SPEED * 0.4; p.facing = -1; }
    if (input.right) { p.vx += MOVE_SPEED * 0.4; p.facing = 1; }
    if (input.up && p.onGround) { p.vy = JUMP_FORCE; p.onGround = false; }
  }

  // Attack
  if (p.attackTimer > 0) p.attackTimer--;
  if (p.specialTimer > 0) p.specialTimer--;

  if (input.attack && p.attackTimer <= 0 && p.stunTimer <= 0) {
    p.attacking = true;
    p.attackTimer = 22;
    p.attackHit = false;
    p.comboCount = Math.min(p.comboCount + 1, 5);
    p.comboTimer = 60;
    if (p.mp > 0) p.mp = Math.max(0, p.mp - 3);
  } else if (p.attackTimer <= 0) {
    p.attacking = false;
  }

  if (input.special && p.specialTimer <= 0 && p.mp >= 30 && p.stunTimer <= 0) {
    p.isSpecial = true;
    p.specialTimer = 40;
    p.attackHit = false;
    p.mp -= 30;
    spawnSpecialEffect(
      p.x + p.w / 2,
      p.y + p.h / 2,
      p.isP2 ? COLORS.p2.trim : COLORS.p1.trim
    );
  } else if (p.specialTimer <= 0) {
    p.isSpecial = false;
  }

  // Combo timer
  if (p.comboTimer > 0) p.comboTimer--;
  else p.comboCount = 0;

  // Hit detection
  if ((p.attacking || p.isSpecial) && !p.attackHit) {
    const aBox = getAttackBox(p, p.isSpecial);
    const oBox = { x: other.x, y: other.y, w: other.w, h: other.h };
    if (rectOverlap(aBox, oBox)) {
      p.attackHit = true;
      const dmg = p.isSpecial ? 18 + p.comboCount * 2 : 8 + p.comboCount;
      other.hp = Math.max(0, other.hp - dmg);
      other.stunTimer = p.isSpecial ? 30 : 14;
      const kbX = p.facing * (p.isSpecial ? 9 : 5);
      const kbY = p.isSpecial ? -8 : -3;
      other.vx += kbX;
      other.vy += kbY;
      spawnHitSpark(
        other.x + other.w / 2,
        other.y + other.h / 2
      );
      // MP regen on hit
      p.mp = Math.min(p.maxMp, p.mp + (p.isSpecial ? 5 : 8));
    }
  }

  // MP regen passively
  if (p.mp < p.maxMp && Math.random() < 0.01) p.mp = Math.min(p.maxMp, p.mp + 1);

  // Physics
  p.vy += GRAVITY;
  p.vx *= FRICTION;
  p.x += p.vx;
  p.y += p.vy;

  p.onGround = false;
  platformCollide(p);

  // Stage bounds
  p.x = Math.max(0, Math.min(W - p.w, p.x));
  if (p.y > H) { p.y = GROUND - p.h; p.vy = 0; p.onGround = true; }

  if (p.hp <= 0) p.dead = true;
}

function drawBackground() {
  ctx.fillStyle = arena.bg;
  ctx.fillRect(0, 0, W, H);

  // Background grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Platforms
  for (const plat of arena.platforms) {
    const grad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + plat.h);
    grad.addColorStop(0, plat.color);
    grad.addColorStop(1, '#0a0a12');
    ctx.fillStyle = grad;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    // glow line on top
    ctx.strokeStyle = arena.floorColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(plat.x, plat.y); ctx.lineTo(plat.x + plat.w, plat.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(p, colorKey) {
  const c = COLORS[colorKey];
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  ctx.save();
  if (p.stunTimer > 0) ctx.globalAlpha = 0.6;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, GROUND, p.w * 0.6, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = c.body;
  ctx.fillRect(p.x + 6, p.y + 20, p.w - 12, p.h - 20);

  // Head
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(cx, p.y + 14, 14, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#0a0a12';
  const eyeOff = p.facing * 4;
  ctx.beginPath(); ctx.arc(cx + eyeOff + 3, p.y + 12, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + eyeOff - 3, p.y + 12, 2.5, 0, Math.PI * 2); ctx.fill();

  // Arms
  ctx.strokeStyle = c.body;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  if (p.attacking || p.isSpecial) {
    const punchX = p.x + (p.facing > 0 ? p.w + 25 : -25);
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(punchX, p.y + 28); ctx.stroke();
    if (p.isSpecial) {
      ctx.strokeStyle = c.trim;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(punchX, p.y + 28, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(p.x + 2, p.y + 42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, p.y + 30); ctx.lineTo(p.x + p.w - 2, p.y + 42); ctx.stroke();
  }

  // Legs
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx - 6, p.y + p.h - 8); ctx.lineTo(p.x + 4, p.y + p.h + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, p.y + p.h - 8); ctx.lineTo(p.x + p.w - 4, p.y + p.h + 6); ctx.stroke();

  // Trim
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(p.x + 6, p.y + 20, p.w - 12, p.h - 20);
  ctx.globalAlpha = 1;

  // Combo label
  if (p.comboCount >= 2) {
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 13px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(p.comboCount + 'x COMBO', cx, p.y - 8);
  }

  ctx.restore();
}

function drawParticles() {
  for (const pt of particles) {
    ctx.save();
    ctx.globalAlpha = pt.life;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function updateParticles() {
  for (const pt of particles) {
    pt.x += pt.vx; pt.y += pt.vy;
    pt.vy += 0.15;
    pt.life -= pt.decay;
    pt.r *= 0.96;
  }
  particles = particles.filter(p => p.life > 0);
}

function updateHUD() {
  const p1 = players.p1, p2 = players.p2;
  document.getElementById('p1-hp').style.width = (p1.hp / p1.maxHp * 100) + '%';
  document.getElementById('p1-mp').style.width = (p1.mp / p1.maxMp * 100) + '%';
  document.getElementById('p2-hp').style.width = (p2.hp / p2.maxHp * 100) + '%';
  document.getElementById('p2-mp').style.width = (p2.mp / p2.maxMp * 100) + '%';
}

function showBanner(text) {
  const b = document.getElementById('round-banner');
  b.textContent = text;
  b.style.display = 'block';
  setTimeout(() => { b.style.display = 'none'; }, 2500);
}

function checkRound() {
  if (roundWinner) return;
  const p1 = players.p1, p2 = players.p2;
  if (p1.dead || p1.hp <= 0) {
    roundWinner = 'p2';
    showBanner('VEX WINS!');
    setTimeout(resetRound, 3000);
  } else if (p2.dead || p2.hp <= 0) {
    roundWinner = 'p1';
    showBanner('KADE WINS!');
    setTimeout(resetRound, 3000);
  }
}

function resetRound() {
  players.p1 = makePlayer(180, false);
  players.p2 = makePlayer(580, true);
  roundWinner = null;
  particles = [];
  showBanner('ROUND START!');
}

let lastTime = 0;
function gameLoop(ts) {
  const dt = ts - lastTime; lastTime = ts;
  ctx.clearRect(0, 0, W, H);

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

  updatePlayer(players.p1, inp1, players.p2);
  updatePlayer(players.p2, inp2, players.p1);
  updateParticles();
  checkRound();

  drawBackground();
  drawParticles();
  drawPlayer(players.p1, 'p1');
  drawPlayer(players.p2, 'p2');
  updateHUD();

  if (gameRunning) requestAnimationFrame(gameLoop);
}
