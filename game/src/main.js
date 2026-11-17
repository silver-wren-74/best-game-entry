// Neon Void — entry point: owns the canvas, the frame loop and the game states
// (title -> playing -> paused -> game over -> playing again), and wires the
// simulation (world.js), the painter (render.js), the controls (input.js) and
// the synthesized sound (audio.js) together.
//
// A run of the loop: read input, step the world by the frame's delta, decay the
// screen shake, draw. The delta is clamped so a stalled tab never teleports the
// action. With a ?shot= parameter the game instead stages one frozen frame for
// the maker's screenshots (shots.js) and flags window.__shotReady when drawn.

import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { createRng } from './random.js';
import { Renderer } from './render.js';
import { parseShotRequest, stageShot } from './shots.js';
import { World } from './world.js';

const BEST_KEY = 'neon-void-best-score';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.status = document.getElementById('status');
    this.input = new Input(this.canvas);
    this.sound = new SoundBank();

    const shotRequest = parseShotRequest();
    this.shotRequest = shotRequest;
    // Live runs seed from the clock; screenshot scenes seed fixed, for sameness.
    const seed = shotRequest ? shotRequest.seed * 7919 + 13 : (Date.now() % 2147483646) + 1;
    this.rng = createRng(seed);
    this.world = new World(this.rng, window.innerWidth, window.innerHeight);
    this.renderer = new Renderer(this.ctx, createRng(4242));

    this.state = 'title';
    this.time = 0;
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    this.shakeMagnitude = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.waveBannerTimer = 0;
    this.deathTimer = 0;
    this.lastTimestamp = performance.now();

    // The bridge the simulation uses to ask for sound, shake and banners.
    this.fx = {
      sound: this.sound,
      shake: (magnitude) => {
        this.shakeMagnitude = Math.min(22, Math.max(this.shakeMagnitude, magnitude));
      },
      announceWave: (wave) => {
        this.waveBannerTimer = 2.2;
        this.setStatus(`Wave ${wave} incoming`);
      },
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());

    if (shotRequest) {
      stageShot(this, shotRequest);
      this.drawFrame();
      window.__shotReady = true;
    }

    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.world.resize(this.width, this.height);
  }

  setStatus(text) {
    if (this.status) this.status.textContent = text;
  }

  startRun() {
    this.sound.unlock();
    this.sound.uiClick();
    this.world.reset();
    this.state = 'playing';
    this.deathTimer = 0;
    this.waveBannerTimer = 0;
    this.setStatus('Run started. Wave 1 incoming.');
  }

  finishRun() {
    this.state = 'gameover';
    if (this.world.score > this.best) {
      this.best = this.world.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.setStatus(`Game over. Score ${this.world.score}, wave ${Math.max(1, this.world.wave)}.`);
  }

  frame(timestamp) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    if (dt > 1 / 20) dt = 1 / 20;
    if (dt < 0) dt = 0;

    // Screenshot scenes hold their staged frame; only the painter runs.
    if (this.shotRequest) {
      this.drawFrame();
      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.handleStateInput();

    if (this.state === 'playing') {
      this.world.update(dt, this.input, this.fx);
      this.waveBannerTimer = Math.max(0, this.waveBannerTimer - dt);
      if (this.world.dead) {
        this.deathTimer += dt;
        if (this.deathTimer > 1.15) this.finishRun();
      }
    }

    // Screen shake: a decaying random offset, re-rolled every frame.
    if (this.shakeMagnitude > 0.15) {
      this.shakeX = (Math.random() * 2 - 1) * this.shakeMagnitude;
      this.shakeY = (Math.random() * 2 - 1) * this.shakeMagnitude;
      this.shakeMagnitude *= Math.exp(-7 * dt);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMagnitude = 0;
    }

    this.drawFrame();
    this.input.endFrame();
  }

  handleStateInput() {
    const input = this.input;
    if (this.state === 'title') {
      if (input.mouseClicked || input.wasPressed('Enter', 'Space')) this.startRun();
      return;
    }
    if (this.state === 'gameover') {
      if (input.mouseClicked || input.wasPressed('Enter', 'KeyR')) this.startRun();
      return;
    }
    if (input.wasPressed('KeyP', 'Escape')) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.setStatus('Paused');
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.setStatus('Resumed');
      }
    }
    // Any first gesture unlocks the audio engine (autoplay policy).
    if (input.mouseClicked || input.keysPressed.size > 0) this.sound.unlock();
  }

  drawFrame() {
    this.renderer.draw(this);
  }
}

new Game();
