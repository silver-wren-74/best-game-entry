// Neon Void — tuning constants and the neon palette.
//
// Everything that decides how the game feels lives in this one file: ship handling,
// weapon timing, enemy pressure per wave and the colours each thing is drawn with.
// The simulation files read from here and hold no magic numbers of their own.

export const CONFIG = {
  // The arena is the whole window; these margins keep ships off the very edge.
  arenaMargin: 14,

  player: {
    radius: 13,
    maxHealth: 100,
    acceleration: 2500,
    damping: 5.2, // velocity kept per second is exp(-damping * dt)
    maxSpeed: 345,
    fireInterval: 0.145, // seconds between shots for the base cannon
    bulletSpeed: 760,
    bulletRadius: 4,
    bulletLife: 0.9,
    dashSpeed: 1080,
    dashDuration: 0.16,
    dashCooldown: 1.5,
    invulnerableAfterHit: 0.9,
  },

  weapons: {
    spreadDuration: 12,
    spreadPellets: 3,
    spreadAngle: 0.16, // radians between pellets
    rapidDuration: 10,
    rapidMultiplier: 1.9,
  },

  combo: {
    window: 2.2, // seconds to land the next kill before the chain cools
    killsPerStep: 5, // chain kills needed per +1 multiplier
    maxMultiplier: 8,
  },

  waves: {
    firstCount: 7,
    countPerWave: 3,
    spawnInterval: 0.85, // seconds between spawns in wave 1
    spawnIntervalFloor: 0.28,
    spawnIntervalDecay: 0.045,
    healthGrowth: 0.13, // extra enemy health fraction per wave after the first
    speedGrowth: 0.03,
    speedGrowthCap: 1.45,
    restBetweenWaves: 2.6, // banner time before the next wave pours in
  },

  drops: {
    chance: 0.13, // chance a destroyed enemy drops a pickup
    lifetime: 9,
    magnetRadius: 96,
    magnetSpeed: 340,
    heartWeight: 3,
    spreadWeight: 4,
    rapidWeight: 4,
    shieldWeight: 3,
    bombWeight: 1,
  },
};

// One palette for the whole game: deep space blues, a cyan hero, hot enemy hues.
export const COLORS = {
  background: '#05060f',
  gridLine: 'rgba(64, 90, 180, 0.13)',
  arenaEdge: '#27407c',
  starDim: '#3d4a7a',
  starBright: '#9fd8ff',

  player: '#3df3ff',
  playerCore: '#eaffff',
  playerFlame: '#ff9a3d',
  bullet: '#b8fbff',
  bulletCore: '#ffffff',
  enemyOrb: '#ff7a59',

  chaser: '#ff3d7f',
  weaver: '#ffb02e',
  darter: '#c86bff',
  splitter: '#52ff8a',
  mini: '#8dffb0',
  spitter: '#ff5d5d',
  tank: '#ff3860',

  heart: '#ff5d7a',
  spreadPickup: '#3df3ff',
  rapidPickup: '#ffe93d',
  shieldPickup: '#7ab8ff',
  bombPickup: '#ff9a3d',

  hudText: '#d9f6ff',
  hudDim: '#7f95c9',
  titleGlow: '#3df3ff',
  danger: '#ff3d5e',
};
