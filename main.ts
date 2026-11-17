// Neon Void — entry program for make.fun best-game-01 (Node 22, standard library only).
//
// The playable game lives in game/ as plain static files: game/index.html plus the ES
// modules under game/src/. There is no build step and the game makes no network request;
// any static file server can host it. This program is only the courier: it copies game/
// and screenshots/ into the output directory and writes dossier.json there with
// buildDossier from the vendored make.fun library, exactly as the bounty requires.
//
// Run it the way the grader does, with the output directory standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the sealed scorer's gate, so this program refuses an entry the
// scorer would refuse instead of handing in something invalid: the dossier text is
// capped at 160 KiB, screenshots at 4 files of at most 256 KiB each, and game/ at 993
// entries, 48 MiB in total and 1,000 bytes per path.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
