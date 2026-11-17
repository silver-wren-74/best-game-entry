// Neon Void — everything that gets painted: the starfield arena, the ships and
// shards, the HUD, and the title / pause / game-over screens.
//
// The renderer only reads state; it never changes the simulation. Screens are drawn
// as overlays on the same canvas so a screenshot of any moment shows the real game,
// HUD included. Text uses a system font stack: no font files, no network.

import { COLORS, CONFIG } from './config.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

export class Renderer {
  constructor(ctx, rng) {
    this.ctx = ctx;
    // A fixed starfield, generated once from the seeded rng so it never twinkles
    // into a different sky between frames.
    this.stars = [];
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: rng.next(),
        y: rng.next(),
        size: rng.range(0.6, 2.1),
        bright: rng.chance(0.22),
        depth: rng.range(0.2, 1),
      });
    }
    // Decorative shards that drift behind the title screen.
    this.titleShards = [];
    for (let i = 0; i < 7; i++) {
      this.titleShards.push({
        x: rng.next(), y: rng.next(),
        radius: rng.range(12, 30),
        sides: rng.int(3, 6),
        spin: rng.range(-0.5, 0.5),
        drift: rng.range(4, 14),
        color: [COLORS.chaser, COLORS.weaver, COLORS.darter, COLORS.splitter, COLORS.spitter][i % 5],
      });
    }
  }

  draw(game) {
    const { ctx } = this;
    const { world, width, height } = game;
    ctx.save();
    if (game.shakeX || game.shakeY) ctx.translate(game.shakeX, game.shakeY);
    this.drawBackground(game);
    if (game.state !== 'title') {
      this.drawPickups(world);
      this.drawOrbs(world);
      this.drawEnemies(world);
      this.drawBullets(world);
      if (!world.dead) this.drawPlayer(world, game.time);
      this.drawParticles(world);
    } else {
      this.drawTitleShards(game);
      this.drawParticles(world);
    }
    ctx.restore();

    if (game.state === 'playing' || game.state === 'paused') {
      this.drawHud(game);
      if (game.waveBannerTimer > 0) this.drawWaveBanner(game);
    }
    if (game.state === 'title') this.drawTitleScreen(game);
    if (game.state === 'paused') this.drawPauseScreen(game);
    if (game.state === 'gameover') this.drawGameOverScreen(game);
    this.drawVignette(game);
  }

  // ------------------------------------------------------------------ scene

  drawBackground(game) {
    const { ctx, world } = this;
    const { width, height } = game;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(-24, -24, width + 48, height + 48);

    // Parallax starfield: deeper stars trail the ship a little.
    const px = world.player.x - width / 2;
    const py = world.player.y - height / 2;
    for (const star of this.stars) {
      const x = star.x * width - px * 0.03 * star.depth;
      const y = star.y * height - py * 0.03 * star.depth;
      ctx.fillStyle = star.bright ? COLORS.starBright : COLORS.starDim;
      ctx.globalAlpha = star.bright ? 0.9 : 0.55;
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    // Faint perspective grid.
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 72;
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // The arena edge.
    ctx.strokeStyle = COLORS.arenaEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  drawPlayer(world, time) {
    const { ctx } = this;
    const p = world.player;
    // Blink while invulnerable so the player can read their own safety.
    if (p.invulnerableTimer > 0 && p.dashTimer <= 0 && Math.floor(time * 14) % 2 === 0) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // Engine flame, longer the harder the ship thrusts or dashes.
    const flame = 10 + p.thrust * 12 + (p.dashTimer > 0 ? 16 : 0) + Math.sin(time * 31) * 3;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 0.7, 5);
    ctx.lineTo(-p.radius - flame, 0);
    ctx.lineTo(-p.radius * 0.7, -5);
    ctx.closePath();
    ctx.fillStyle = COLORS.playerFlame;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Hull: a sleek arrow.
    ctx.beginPath();
    ctx.moveTo(p.radius + 5, 0);
    ctx.lineTo(-p.radius * 0.6, p.radius * 0.85);
    ctx.lineTo(-p.radius * 0.25, 0);
    ctx.lineTo(-p.radius * 0.6, -p.radius * 0.85);
    ctx.closePath();
    ctx.fillStyle = '#0b2b3a';
    ctx.fill();
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(1, 0, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.playerCore;
    ctx.fill();
    ctx.restore();

    if (p.shield) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 9 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.shieldPickup;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (p.dashTimer > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.player;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawEnemies(world) {
    const { ctx } = this;
    for (const e of world.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      this.polygonPath(e.sides, e.radius);
      ctx.fillStyle = 'rgba(10, 8, 24, 0.9)';
      ctx.fill();
      ctx.strokeStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.lineWidth = e.type === 'tank' ? 3 : 2;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Inner core shrinks with health, so damage reads at a glance.
      const coreScale = 0.32 + 0.3 * (e.health / e.maxHealth);
      this.polygonPath(e.sides, e.radius * coreScale);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // A darter telegraphs its lunge with a flashing outline.
      if (e.type === 'darter' && e.state === 'aim') {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Tanks and splitters carry a health arc.
      if ((e.type === 'tank' || e.type === 'splitter') && e.health < e.maxHealth) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.health / e.maxHealth));
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  polygonPath(sides, radius) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  drawBullets(world) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = COLORS.bullet;
    ctx.shadowBlur = 8;
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.bulletCore;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(61, 243, 255, 0.35)';
      ctx.fill();
    }
    ctx.restore();
  }

  drawOrbs(world) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = COLORS.enemyOrb;
    ctx.shadowBlur = 10;
    for (const o of world.orbs) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.enemyOrb;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3e0';
      ctx.fill();
    }
    ctx.restore();
  }

  drawPickups(world) {
    const { ctx } = this;
    for (const item of world.pickups) {
      const bobY = Math.sin(item.bob) * 3;
      const blink = item.life < 2 && Math.floor(item.life * 8) % 2 === 0;
      ctx.save();
      ctx.translate(item.x, item.y + bobY);
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = item.color;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = { heart: '+', spread: 'W', rapid: 'R', shield: 'S', bomb: 'B' }[item.kind] ?? '?';
      ctx.fillText(glyph, 0, 1);
      ctx.restore();
    }
  }

  drawParticles(world) {
    const { ctx } = this;
    const fx = world.particles;
    for (const ring of fx.rings) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, ring.life / ring.maxLife) * 0.8;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of fx.sparks) {
      ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.font = `bold ${t.size}px ${FONT}`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  drawTitleShards(game) {
    const { ctx } = this;
    for (const shard of this.titleShards) {
      const x = ((shard.x + game.time * shard.drift * 0.004) % 1) * game.width;
      const y = shard.y * game.height + Math.sin(game.time * 0.7 + shard.x * 9) * 12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(game.time * shard.spin);
      this.polygonPath(shard.sides, shard.radius);
      ctx.strokeStyle = shard.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------- HUD

  drawHud(game) {
    const { ctx, world } = this;
    const { width } = game;
    const p = world.player;
    ctx.save();
    ctx.textBaseline = 'top';

    // Score, top-left.
    ctx.textAlign = 'left';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(String(world.score).padStart(6, '0'), 18, 12);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(`BEST ${Math.max(game.best, world.score)}`, 18, 42);

    // Wave, top-centre.
    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(world.wave > 0 ? `WAVE ${world.wave}` : 'GET READY', width / 2, 14);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    const hostiles = world.enemies.length + world.toSpawn;
    ctx.fillText(hostiles > 0 ? `${hostiles} hostiles` : 'sector clear', width / 2, 38);

    // Hull bar, top-right.
    const barW = 190;
    const barX = width - barW - 18;
    ctx.textAlign = 'right';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText('HULL', width - 18, 14);
    ctx.fillStyle = 'rgba(120, 140, 200, 0.25)';
    ctx.fillRect(barX, 32, barW, 12);
    const hullFraction = p.health / p.maxHealth;
    ctx.fillStyle = hullFraction > 0.35 ? COLORS.splitter : COLORS.danger;
    ctx.fillRect(barX, 32, barW * hullFraction, 12);
    if (p.shield) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = COLORS.shieldPickup;
      ctx.fillText('SHIELD ACTIVE', width - 18, 48);
    }

    // Combo meter, bottom-left: chain count, multiplier and the cooling bar.
    if (world.combo > 0) {
      ctx.textAlign = 'left';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillStyle = '#ffe93d';
      ctx.fillText(`x${world.multiplier} COMBO ${world.combo}`, 18, game.height - 52);
      ctx.fillStyle = 'rgba(120, 140, 200, 0.25)';
      ctx.fillRect(18, game.height - 26, 130, 6);
      ctx.fillStyle = '#ffe93d';
      ctx.fillRect(18, game.height - 26, 130 * (world.comboTimer / CONFIG.combo.window), 6);
    }

    // Weapon and dash status, bottom-right.
    ctx.textAlign = 'right';
    ctx.font = `13px ${FONT}`;
    let lineY = game.height - 24;
    if (p.spreadTimer > 0) {
      ctx.fillStyle = COLORS.spreadPickup;
      ctx.fillText(`TRIPLE CANNON ${p.spreadTimer.toFixed(0)}s`, width - 18, lineY - 18);
      lineY -= 18;
    }
    if (p.rapidTimer > 0) {
      ctx.fillStyle = COLORS.rapidPickup;
      ctx.fillText(`RAPID FIRE ${p.rapidTimer.toFixed(0)}s`, width - 18, lineY - 18);
      lineY -= 18;
    }
    ctx.fillStyle = p.dashCooldown <= 0 ? COLORS.player : COLORS.hudDim;
    ctx.fillText(p.dashCooldown <= 0 ? 'DASH READY' : 'DASH …', width - 18, lineY - 18);
    ctx.restore();
  }

  drawWaveBanner(game) {
    const { ctx, world } = this;
    const alpha = Math.min(1, game.waveBannerTimer / 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `bold 54px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.shadowColor = COLORS.titleGlow;
    ctx.shadowBlur = 24;
    ctx.fillText(`WAVE ${world.wave}`, game.width / 2, game.height / 2 - 90);
    ctx.shadowBlur = 0;
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    const hint = world.wave === 1
      ? 'shards incoming — hold the mouse button to fire'
      : world.wave % 5 === 0
        ? 'surge wave — good luck, pilot'
        : 'the void grows bolder';
    ctx.fillText(hint, game.width / 2, game.height / 2 - 48);
    ctx.restore();
  }

  // ---------------------------------------------------------------- screens

  drawTitleScreen(game) {
    const { ctx } = this;
    const { width, height } = game;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 5, 16, 0.55)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';

    const pulse = 18 + Math.sin(game.time * 2.2) * 6;
    ctx.font = `bold 92px ${FONT}`;
    ctx.shadowColor = COLORS.titleGlow;
    ctx.shadowBlur = pulse + 14;
    ctx.fillStyle = '#eaffff';
    ctx.fillText('NEON VOID', width / 2, height / 2 - 150);
    ctx.shadowBlur = 0;

    ctx.font = `19px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('One ship. Endless shards. How long can you hold the sector?', width / 2, height / 2 - 92);

    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    const lines = [
      'WASD / Arrow keys — fly        Mouse — aim',
      'Hold mouse button — fire        Shift / Space — dash (brief shield)',
      'Grab drops:  W triple cannon · R rapid fire · S shield · + hull · B void bomb',
      'Chain kills to raise your score multiplier. Survive the surge every 5th wave.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, width / 2, height / 2 - 40 + i * 27));

    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = COLORS.player;
    const blink = Math.floor(game.time * 1.6) % 2 === 0;
    if (blink) ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', width / 2, height / 2 + 96);

    if (game.best > 0) {
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = COLORS.hudDim;
      ctx.fillText(`Best score so far: ${game.best}`, width / 2, height / 2 + 138);
    }
    ctx.restore();
  }

  drawPauseScreen(game) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 5, 16, 0.66)';
    ctx.fillRect(0, 0, game.width, game.height);
    ctx.textAlign = 'center';
    ctx.font = `bold 48px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText('PAUSED', game.width / 2, game.height / 2 - 60);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('Press P or Esc to resume', game.width / 2, game.height / 2 - 8);
    ctx.restore();
  }

  drawGameOverScreen(game) {
    const { ctx, world } = this;
    const { width, height } = game;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 3, 10, 0.62)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';

    ctx.font = `bold 64px ${FONT}`;
    ctx.shadowColor = COLORS.danger;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffe9ee';
    ctx.fillText('THE VOID CLAIMS YOU', width / 2, height / 2 - 130);
    ctx.shadowBlur = 0;

    ctx.font = `bold 40px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(`SCORE ${world.score}`, width / 2, height / 2 - 52);

    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    const accuracy = world.shotsFired > 0
      ? Math.round((world.shotsHit / world.shotsFired) * 100)
      : 0;
    const stats = [
      `Reached wave ${Math.max(1, world.wave)}   ·   ${world.kills} shards shattered`,
      `Best combo x${world.bestCombo} chain   ·   accuracy ${accuracy}%   ·   survived ${world.timeAlive.toFixed(0)}s`,
      world.score >= game.best && world.score > 0 ? 'New best score!' : `Best score: ${game.best}`,
    ];
    stats.forEach((line, i) => ctx.fillText(line, width / 2, height / 2 + 2 + i * 28));

    ctx.font = `bold 23px ${FONT}`;
    ctx.fillStyle = COLORS.player;
    const blink = Math.floor(game.time * 1.6) % 2 === 0;
    if (blink) ctx.fillText('PRESS ENTER OR CLICK TO FLY AGAIN', width / 2, height / 2 + 118);
    ctx.restore();
  }

  drawVignette(game) {
    const { ctx } = this;
    const { width, height } = game;
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.42,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // A red edge pulse while the hull is critical.
    if (game.state === 'playing' && game.world.player.health <= 30 && !game.world.dead) {
      ctx.strokeStyle = `rgba(255, 61, 94, ${0.35 + Math.sin(game.time * 6) * 0.2})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, width, height);
    }
  }
}
