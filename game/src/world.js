// Neon Void — the simulation: the player's ship, enemy shards, bullets, pickups
// and the wave director that keeps the pressure rising.
//
// This file owns every rule of the game: how each enemy type hunts, how damage and
// the score combo work, what drops when something dies. It never draws and never
// reads the clock directly; main.js feeds it a frame delta and an input snapshot,
// and render.js draws whatever state it leaves behind.

import { COLORS, CONFIG } from './config.js';
import { Particles } from './particles.js';

// Per-type enemy blueprints. `score` is paid through the combo multiplier on a kill.
export const ENEMY_TYPES = {
  chaser: { radius: 14, health: 2, speed: 128, damage: 14, score: 50, color: COLORS.chaser, sides: 3 },
  weaver: { radius: 12, health: 2, speed: 168, damage: 12, score: 70, color: COLORS.weaver, sides: 4 },
  darter: { radius: 11, health: 2, speed: 104, damage: 16, score: 90, color: COLORS.darter, sides: 3 },
  splitter: { radius: 19, health: 7, speed: 74, damage: 16, score: 120, color: COLORS.splitter, sides: 6 },
  mini: { radius: 8, health: 1, speed: 196, damage: 8, score: 30, color: COLORS.mini, sides: 6 },
  spitter: { radius: 14, health: 4, speed: 96, damage: 10, score: 110, color: COLORS.spitter, sides: 5 },
  tank: { radius: 27, health: 18, speed: 52, damage: 26, score: 250, color: COLORS.tank, sides: 5 },
};

// Which types may appear from each wave on, and how the director weights them.
const WAVE_UNLOCKS = [
  { wave: 1, type: 'chaser', weight: 10 },
  { wave: 2, type: 'weaver', weight: 6 },
  { wave: 3, type: 'darter', weight: 5 },
  { wave: 4, type: 'splitter', weight: 5 },
  { wave: 5, type: 'spitter', weight: 4 },
  { wave: 6, type: 'tank', weight: 3 },
];

export class World {
  constructor(rng, width, height) {
    this.rng = rng;
    this.width = width;
    this.height = height;
    this.particles = new Particles();
    this.reset();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.clampToArena(this.player);
  }

  /** Back to a fresh run: centred ship, full health, wave one about to start. */
  reset() {
    const p = CONFIG.player;
    this.player = {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: p.radius,
      health: p.maxHealth,
      maxHealth: p.maxHealth,
      fireTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      invulnerableTimer: 0,
      shield: false,
      spreadTimer: 0,
      rapidTimer: 0,
      thrust: 0, // 0..1, how hard the engine burns this frame; drives the flame
    };
    this.bullets = [];
    this.orbs = []; // enemy shots
    this.enemies = [];
    this.pickups = [];
    this.particles.clear();

    this.score = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.timeAlive = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.dead = false;

    this.wave = 0;
    this.waveState = 'rest'; // 'rest' counts down, 'active' spawns and fights
    this.waveTimer = 1.2; // a short breath before wave 1
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveAnnounced = false;
  }

  get multiplier() {
    return Math.min(
      CONFIG.combo.maxMultiplier,
      1 + Math.floor(this.combo / CONFIG.combo.killsPerStep),
    );
  }

  // ---------------------------------------------------------------- waves

  startWave(number) {
    this.wave = number;
    this.waveState = 'active';
    this.waveAnnounced = true;
    const surge = number % 5 === 0;
    this.toSpawn =
      CONFIG.waves.firstCount + (number - 1) * CONFIG.waves.countPerWave + (surge ? 6 : 0);
    this.spawnTimer = 0.2;
    this.spawnInterval = Math.max(
      CONFIG.waves.spawnIntervalFloor,
      CONFIG.waves.spawnInterval - (number - 1) * CONFIG.waves.spawnIntervalDecay,
    );
  }

  pickEnemyType() {
    let total = 0;
    for (const entry of WAVE_UNLOCKS) if (this.wave >= entry.wave) total += entry.weight;
    let roll = this.rng.range(0, total);
    for (const entry of WAVE_UNLOCKS) {
      if (this.wave < entry.wave) continue;
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return 'chaser';
  }

  spawnEnemy(type = null) {
    const kind = type ?? this.pickEnemyType();
    const base = ENEMY_TYPES[kind];
    // Spawn on the arena rim, never close enough to the ship to feel unfair.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const side = this.rng.int(0, 3);
      if (side === 0) { x = this.rng.range(30, this.width - 30); y = 26; }
      if (side === 1) { x = this.rng.range(30, this.width - 30); y = this.height - 26; }
      if (side === 2) { x = 26; y = this.rng.range(30, this.height - 30); }
      if (side === 3) { x = this.width - 26; y = this.rng.range(30, this.height - 30); }
      const dx = x - this.player.x;
      const dy = y - this.player.y;
      if (dx * dx + dy * dy > 200 * 200) break;
    }
    const healthScale = 1 + (this.wave - 1) * CONFIG.waves.healthGrowth;
    const speedScale = Math.min(
      CONFIG.waves.speedGrowthCap,
      1 + (this.wave - 1) * CONFIG.waves.speedGrowth,
    );
    this.enemies.push({
      type: kind,
      x, y,
      vx: 0, vy: 0,
      angle: this.rng.range(0, Math.PI * 2),
      spin: this.rng.range(-1.4, 1.4),
      radius: base.radius,
      health: Math.max(1, Math.round(base.health * healthScale)),
      maxHealth: Math.max(1, Math.round(base.health * healthScale)),
      speed: base.speed * speedScale * this.rng.range(0.9, 1.1),
      damage: base.damage,
      score: base.score,
      color: base.color,
      sides: base.sides,
      phase: this.rng.range(0, Math.PI * 2), // weaver sway / darter timing
      state: 'hunt',
      stateTimer: this.rng.range(0.4, 0.9),
      fireTimer: this.rng.range(1.2, 2.4),
      flash: 0, // hit flash, decays
    });
  }

  // ---------------------------------------------------------------- update

  update(dt, input, fx) {
    if (this.dead) {
      this.particles.update(dt);
      return;
    }
    this.timeAlive += dt;
    this.updateWaveDirector(dt, fx);
    this.updatePlayer(dt, input, fx);
    this.updateBullets(dt);
    this.updateEnemies(dt, fx);
    this.updatePickups(dt, fx);
    this.particles.update(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  updateWaveDirector(dt, fx) {
    if (this.waveState === 'rest') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.startWave(this.wave + 1);
        fx.sound.waveStart();
        fx.announceWave(this.wave);
      }
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval * this.rng.range(0.7, 1.3);
        this.spawnEnemy();
        this.toSpawn--;
      }
    } else if (this.enemies.length === 0) {
      // Wave cleared: bonus for a clean finish, then a breath before the next.
      const bonus = 100 * this.wave;
      this.score += bonus;
      this.particles.addText(
        this.width / 2, this.height / 2 - 60, `WAVE ${this.wave} CLEAR  +${bonus}`, '#ffe93d', 22,
      );
      this.waveState = 'rest';
      this.waveTimer = CONFIG.waves.restBetweenWaves;
    }
  }

  updatePlayer(dt, input, fx) {
    const p = this.player;
    const cfg = CONFIG.player;

    const move = input.moveVector();
    p.thrust = Math.min(1, Math.abs(move.x) + Math.abs(move.y));
    p.vx += move.x * cfg.acceleration * dt;
    p.vy += move.y * cfg.acceleration * dt;
    const damping = Math.exp(-cfg.damping * dt);
    p.vx *= damping;
    p.vy *= damping;

    // Dash: a short invulnerable burst in the movement (or facing) direction.
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (input.dashRequested && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      let dx = move.x;
      let dy = move.y;
      if (dx === 0 && dy === 0) {
        dx = Math.cos(p.angle);
        dy = Math.sin(p.angle);
      }
      const len = Math.hypot(dx, dy) || 1;
      p.vx = (dx / len) * cfg.dashSpeed;
      p.vy = (dy / len) * cfg.dashSpeed;
      p.dashTimer = cfg.dashDuration;
      p.dashCooldown = cfg.dashCooldown;
      p.invulnerableTimer = Math.max(p.invulnerableTimer, cfg.dashDuration + 0.08);
      fx.sound.dash();
      this.particles.spray(this.rng, p.x, p.y, Math.atan2(-dy, -dx), COLORS.player, 10, 0.7, 300);
    }
    p.dashTimer = Math.max(0, p.dashTimer - dt);
    p.invulnerableTimer = Math.max(0, p.invulnerableTimer - dt);

    const speed = Math.hypot(p.vx, p.vy);
    const cap = p.dashTimer > 0 ? cfg.dashSpeed : cfg.maxSpeed;
    if (speed > cap) {
      p.vx = (p.vx / speed) * cap;
      p.vy = (p.vy / speed) * cap;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this.clampToArena(p);

    // Aim at the mouse, always.
    p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

    // Engine embers while thrusting.
    if (p.thrust > 0.1 && this.rng.chance(0.75)) {
      const back = p.angle + Math.PI;
      const nx = p.x + Math.cos(back) * p.radius * 0.9;
      const ny = p.y + Math.sin(back) * p.radius * 0.9;
      this.particles.ember(this.rng, nx, ny, p.vx * 0.25, p.vy * 0.25, COLORS.playerFlame);
    }

    // Firing.
    p.fireTimer -= dt;
    p.spreadTimer = Math.max(0, p.spreadTimer - dt);
    p.rapidTimer = Math.max(0, p.rapidTimer - dt);
    if (input.firing) {
      const interval = cfg.fireInterval / (p.rapidTimer > 0 ? CONFIG.weapons.rapidMultiplier : 1);
      while (p.fireTimer <= 0) {
        p.fireTimer += interval;
        this.fireBullet(fx);
      }
    } else if (p.fireTimer < 0) {
      p.fireTimer = 0;
    }
  }

  fireBullet(fx) {
    const p = this.player;
    const cfg = CONFIG.player;
    const offsets = p.spreadTimer > 0
      ? [-CONFIG.weapons.spreadAngle, 0, CONFIG.weapons.spreadAngle]
      : [0];
    for (const offset of offsets) {
      const angle = p.angle + offset + this.rng.range(-0.012, 0.012);
      this.bullets.push({
        x: p.x + Math.cos(p.angle) * (p.radius + 6),
        y: p.y + Math.sin(p.angle) * (p.radius + 6),
        vx: Math.cos(angle) * cfg.bulletSpeed + p.vx * 0.25,
        vy: Math.sin(angle) * cfg.bulletSpeed + p.vy * 0.25,
        radius: cfg.bulletRadius,
        life: cfg.bulletLife,
      });
      this.shotsFired++;
    }
    const muzzleX = p.x + Math.cos(p.angle) * (p.radius + 8);
    const muzzleY = p.y + Math.sin(p.angle) * (p.radius + 8);
    this.particles.spray(this.rng, muzzleX, muzzleY, p.angle, COLORS.bullet, 2, 0.35, 200);
    fx.sound.shoot();
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > this.width + 20 || b.y < -20 || b.y > this.height + 20) {
        this.bullets.splice(i, 1);
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.life <= 0 || o.x < -20 || o.x > this.width + 20 || o.y < -20 || o.y > this.height + 20) {
        this.orbs.splice(i, 1);
      }
    }
  }

  updateEnemies(dt, fx) {
    const p = this.player;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.angle += e.spin * dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      e.phase += dt * 3;

      if (e.type === 'weaver') {
        const sway = Math.sin(e.phase) * 0.85;
        const px = -uy * sway;
        const py = ux * sway;
        e.vx += (ux + px) * 620 * dt;
        e.vy += (uy + py) * 620 * dt;
        this.capEnemySpeed(e);
      } else if (e.type === 'darter') {
        e.stateTimer -= dt;
        if (e.state === 'hunt') {
          e.vx += ux * 260 * dt;
          e.vy += uy * 260 * dt;
          this.capEnemySpeed(e, 0.55);
          if (e.stateTimer <= 0) { e.state = 'aim'; e.stateTimer = 0.28; }
        } else if (e.state === 'aim') {
          e.vx *= Math.exp(-6 * dt);
          e.vy *= Math.exp(-6 * dt);
          e.lockX = ux;
          e.lockY = uy;
          if (e.stateTimer <= 0) {
            e.state = 'dash';
            e.stateTimer = 0.34;
            e.vx = e.lockX * 540;
            e.vy = e.lockY * 540;
          }
        } else if (e.state === 'dash') {
          if (e.stateTimer <= 0) { e.state = 'hunt'; e.stateTimer = this.rng.range(0.5, 1); }
        }
      } else if (e.type === 'spitter') {
        // Keeps its distance and lobs plasma orbs at the ship.
        const want = dist < 240 ? -1 : dist > 300 ? 1 : 0;
        const strafe = Math.sin(e.phase * 0.6) * 0.6;
        e.vx += (ux * want - uy * strafe) * 380 * dt;
        e.vy += (uy * want + ux * strafe) * 380 * dt;
        this.capEnemySpeed(e);
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && dist < 460) {
          e.fireTimer = this.rng.range(2, 2.8);
          this.orbs.push({
            x: e.x, y: e.y,
            vx: ux * 245, vy: uy * 245,
            radius: 6, life: 3.2,
          });
          this.particles.spray(this.rng, e.x, e.y, Math.atan2(uy, ux), COLORS.enemyOrb, 4, 0.4, 160);
        }
      } else {
        // chaser, splitter, mini, tank: straight at the ship, heavier = slower push.
        const push = e.type === 'tank' ? 170 : 430;
        e.vx += ux * push * dt;
        e.vy += uy * push * dt;
        this.capEnemySpeed(e);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      this.clampToArena(e);
    }

    // Gentle separation so shards read as individuals, not one blob.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push * 0.5;
          a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5;
          b.y += dy * push * 0.5;
        }
      }
    }

    this.resolveBulletHits(fx);
    this.resolvePlayerCollisions(fx);
    this.enemies = this.enemies.filter((e) => !e.remove);
  }

  capEnemySpeed(e, factor = 1) {
    const speed = Math.hypot(e.vx, e.vy);
    const cap = e.speed * factor;
    if (speed > cap) {
      e.vx = (e.vx / speed) * cap;
      e.vy = (e.vy / speed) * cap;
    }
  }

  resolveBulletHits(fx) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let consumed = false;
      for (const e of this.enemies) {
        if (e.remove) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const reach = e.radius + b.radius;
        if (dx * dx + dy * dy <= reach * reach) {
          consumed = true;
          this.shotsHit++;
          e.health -= 1;
          e.flash = 1;
          // A touch of knockback so hits feel physical.
          e.vx += b.vx * 0.06;
          e.vy += b.vy * 0.06;
          this.particles.spray(this.rng, b.x, b.y, Math.atan2(b.vy, b.vx), e.color, 3, 0.8, 220);
          if (e.health <= 0) this.killEnemy(e, fx);
          else fx.sound.enemyHit();
          break;
        }
      }
      if (consumed) this.bullets.splice(i, 1);
    }
  }

  killEnemy(e, fx) {
    e.remove = true;
    this.kills++;
    this.combo++;
    this.comboTimer = CONFIG.combo.window;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = e.score * this.multiplier;
    this.score += gained;
    const big = e.type === 'tank' || e.type === 'splitter';
    this.particles.burst(this.rng, e.x, e.y, e.color, big ? 30 : 16, big ? 420 : 330, 0.55, 2.6);
    this.particles.ring(e.x, e.y, e.color, big ? 110 : 64);
    this.particles.addText(e.x, e.y - e.radius, `+${gained}`, '#ffffff', this.multiplier > 1 ? 17 : 14);
    fx.sound.explosion(big);
    fx.shake(big ? 7 : 3.5);

    if (e.type === 'splitter') {
      for (let k = 0; k < 3; k++) {
        const angle = this.rng.range(0, Math.PI * 2);
        const mini = ENEMY_TYPES.mini;
        this.enemies.push({
          type: 'mini',
          x: e.x + Math.cos(angle) * 12,
          y: e.y + Math.sin(angle) * 12,
          vx: Math.cos(angle) * 190,
          vy: Math.sin(angle) * 190,
          angle: angle,
          spin: this.rng.range(-3, 3),
          radius: mini.radius,
          health: 1, maxHealth: 1,
          speed: mini.speed,
          damage: mini.damage,
          score: mini.score,
          color: mini.color,
          sides: mini.sides,
          phase: this.rng.range(0, 6),
          state: 'hunt', stateTimer: 1,
          fireTimer: 99, flash: 0,
        });
      }
    }

    if (this.rng.chance(CONFIG.drops.chance)) this.dropPickup(e.x, e.y);
  }

  dropPickup(x, y) {
    const d = CONFIG.drops;
    const table = [
      ['heart', d.heartWeight, COLORS.heart],
      ['spread', d.spreadWeight, COLORS.spreadPickup],
      ['rapid', d.rapidWeight, COLORS.rapidPickup],
      ['shield', d.shieldWeight, COLORS.shieldPickup],
      ['bomb', d.bombWeight, COLORS.bombPickup],
    ];
    let total = 0;
    for (const [, weight] of table) total += weight;
    let roll = this.rng.range(0, total);
    let kind = 'spread';
    let color = COLORS.spreadPickup;
    for (const [name, weight, c] of table) {
      roll -= weight;
      if (roll <= 0) { kind = name; color = c; break; }
    }
    this.pickups.push({
      kind, color, x, y, vx: 0, vy: 0,
      radius: 11, life: d.lifetime, bob: this.rng.range(0, Math.PI * 2),
    });
  }

  updatePickups(dt, fx) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      item.life -= dt;
      item.bob += dt * 4;
      if (item.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }
      const dx = p.x - item.x;
      const dy = p.y - item.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < CONFIG.drops.magnetRadius) {
        item.vx += (dx / dist) * CONFIG.drops.magnetSpeed * 4 * dt;
        item.vy += (dy / dist) * CONFIG.drops.magnetSpeed * 4 * dt;
      }
      item.vx *= Math.exp(-3 * dt);
      item.vy *= Math.exp(-3 * dt);
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      if (dist < p.radius + item.radius + 4) {
        this.applyPickup(item, fx);
        this.pickups.splice(i, 1);
      }
    }
  }

  applyPickup(item, fx) {
    const p = this.player;
    fx.sound.pickup();
    this.particles.ring(item.x, item.y, item.color, 46, 0.3);
    if (item.kind === 'heart') {
      p.health = Math.min(p.maxHealth, p.health + 30);
      this.particles.addText(p.x, p.y - 26, '+30 HULL', COLORS.heart, 15);
    } else if (item.kind === 'spread') {
      p.spreadTimer = CONFIG.weapons.spreadDuration;
      this.particles.addText(p.x, p.y - 26, 'TRIPLE CANNON', COLORS.spreadPickup, 15);
    } else if (item.kind === 'rapid') {
      p.rapidTimer = CONFIG.weapons.rapidDuration;
      this.particles.addText(p.x, p.y - 26, 'RAPID FIRE', COLORS.rapidPickup, 15);
    } else if (item.kind === 'shield') {
      p.shield = true;
      this.particles.addText(p.x, p.y - 26, 'SHIELD UP', COLORS.shieldPickup, 15);
    } else if (item.kind === 'bomb') {
      this.detonateBomb(fx);
    }
  }

  /** The bomb pickup: every shard on screen dies, paid at half score, huge feedback. */
  detonateBomb(fx) {
    fx.sound.bomb();
    fx.shake(16);
    this.particles.ring(this.player.x, this.player.y, COLORS.bombPickup, Math.max(this.width, this.height), 0.7);
    for (const e of this.enemies) {
      if (e.remove) continue;
      e.remove = true;
      this.kills++;
      this.score += Math.floor(e.score / 2);
      this.particles.burst(this.rng, e.x, e.y, e.color, 12, 320, 0.5, 2.4);
    }
    this.orbs.length = 0;
    this.particles.addText(this.player.x, this.player.y - 34, 'VOID BOMB', COLORS.bombPickup, 20);
  }

  resolvePlayerCollisions(fx) {
    const p = this.player;
    if (p.invulnerableTimer > 0) return;

    for (const o of this.orbs) {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const reach = p.radius + o.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        o.life = 0;
        this.hurtPlayer(10, fx);
        return;
      }
    }
    for (const e of this.enemies) {
      if (e.remove) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const reach = p.radius + e.radius - 3;
      if (dx * dx + dy * dy <= reach * reach) {
        e.remove = true;
        this.particles.burst(this.rng, e.x, e.y, e.color, 16, 330, 0.5, 2.4);
        this.hurtPlayer(e.damage, fx);
        return;
      }
    }
  }

  hurtPlayer(amount, fx) {
    const p = this.player;
    if (p.shield) {
      p.shield = false;
      p.invulnerableTimer = CONFIG.player.invulnerableAfterHit;
      fx.sound.explosion(false);
      this.particles.ring(p.x, p.y, COLORS.shieldPickup, 60, 0.35);
      this.particles.addText(p.x, p.y - 26, 'SHIELD DOWN', COLORS.shieldPickup, 15);
      return;
    }
    p.health -= amount;
    p.invulnerableTimer = CONFIG.player.invulnerableAfterHit;
    this.combo = 0;
    this.comboTimer = 0;
    fx.sound.playerHurt();
    fx.shake(10);
    this.particles.burst(this.rng, p.x, p.y, COLORS.danger, 22, 380, 0.6, 2.6);
    if (p.health <= 0) {
      p.health = 0;
      this.dead = true;
      this.particles.burst(this.rng, p.x, p.y, COLORS.player, 60, 520, 1.1, 3.2);
      this.particles.burst(this.rng, p.x, p.y, COLORS.playerFlame, 30, 380, 0.9, 2.6);
      this.particles.ring(p.x, p.y, COLORS.player, 190, 0.7);
      fx.sound.explosion(true);
      fx.sound.gameOver();
      fx.shake(20);
    }
  }

  clampToArena(entity) {
    const m = CONFIG.arenaMargin;
    entity.x = Math.min(this.width - m, Math.max(m, entity.x));
    entity.y = Math.min(this.height - m, Math.max(m, entity.y));
  }
}
