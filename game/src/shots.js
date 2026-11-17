// Neon Void — staged screenshot scenes.
//
// Opening the game with ?shot=start, ?shot=play or ?shot=end (and an optional
// &seed=n) freezes it on one deterministic frame of each screen the game has:
// the title, a mid-fight moment with the HUD busy, and the game-over results.
// The maker's screenshot tool renders these frames; live play never passes a
// shot parameter, so nothing here runs for a real player.

import { COLORS } from './config.js';

export function parseShotRequest() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot !== 'start' && shot !== 'play' && shot !== 'end') return null;
  const seed = Number(params.get('seed') ?? 1) || 1;
  return { shot, seed };
}

export function stageShot(game, request) {
  const { world } = game;
  game.time = 1.3; // a frozen clock where the blinking prompts are lit

  if (request.shot === 'start') {
    game.state = 'title';
    return;
  }

  if (request.shot === 'end') {
    stageGameOver(game);
    return;
  }

  stageGameplay(game);
}

/** A believable mid-fight frame: wave 4, combo hot, one pickup waiting. */
function stageGameplay(game) {
  const { world } = game;
  const p = world.player;
  game.state = 'playing';
  world.wave = 4;
  world.waveState = 'active';
  world.score = 12450;
  world.kills = 63;
  world.combo = 12;
  world.comboTimer = 1.7;
  world.bestCombo = 12;
  world.timeAlive = 96;
  p.x = game.width * 0.36;
  p.y = game.height * 0.58;
  p.health = 72;
  p.spreadTimer = 8;
  p.angle = Math.atan2(game.height * 0.3 - p.y, game.width * 0.72 - p.x);

  // A volley already in flight toward the pack.
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    world.bullets.push({
      x: p.x + Math.cos(p.angle) * (60 + t * 300),
      y: p.y + Math.sin(p.angle) * (60 + t * 300),
      vx: Math.cos(p.angle) * 760,
      vy: Math.sin(p.angle) * 760,
      radius: 4,
      life: 0.8,
    });
  }

  const spots = [
    ['chaser', 0.74, 0.3], ['weaver', 0.82, 0.44], ['chaser', 0.66, 0.18],
    ['splitter', 0.88, 0.68], ['darter', 0.58, 0.82], ['spitter', 0.16, 0.2],
    ['weaver', 0.24, 0.86], ['chaser', 0.93, 0.24],
  ];
  for (const [type, fx, fy] of spots) {
    world.spawnEnemy(type);
    const e = world.enemies[world.enemies.length - 1];
    e.x = game.width * fx;
    e.y = game.height * fy;
  }
  world.toSpawn = 5;

  world.pickups.push({
    kind: 'rapid', color: COLORS.rapidPickup,
    x: game.width * 0.55, y: game.height * 0.42,
    vx: 0, vy: 0, radius: 11, life: 8, bob: 1.2,
  });

  // Sparks from a kill that happened a frame ago.
  world.particles.burst(world.rng, game.width * 0.62, game.height * 0.36, COLORS.chaser, 18, 300, 0.6, 2.6);
  world.particles.ring(game.width * 0.62, game.height * 0.36, COLORS.chaser, 70);
  world.particles.addText(game.width * 0.62, game.height * 0.3, '+150', '#ffffff', 16);
  game.waveBannerTimer = 0;
}

/** The results screen after a good run: the ship is gone, the numbers remain. */
function stageGameOver(game) {
  const { world } = game;
  game.state = 'gameover';
  world.wave = 6;
  world.score = 28740;
  world.kills = 148;
  world.bestCombo = 23;
  world.shotsFired = 412;
  world.shotsHit = 297;
  world.timeAlive = 214;
  world.dead = true;
  game.best = Math.max(game.best, world.score);
  world.particles.burst(world.rng, world.player.x, world.player.y, COLORS.player, 42, 460, 1.1, 3);
  world.particles.ring(world.player.x, world.player.y, COLORS.player, 170, 0.7);
}
