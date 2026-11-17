// Neon Void — synthesized sound effects and a pulsing bass loop, all WebAudio.
//
// No audio files exist in this game: every sound is an oscillator or a burst of
// filtered noise shaped in code. Browsers only allow audio after a gesture, so the
// engine stays locked until unlock() is called from the first click or key press.

export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.lastShotAt = 0;
  }

  /** Create the context (once) and start the music loop. Safe to call repeatedly. */
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.context.destination);
    this.startMusic();
  }

  /** A short oscillator blip with an exponential decay envelope. */
  tone({ frequency = 440, endFrequency = null, type = 'square', duration = 0.12, volume = 0.2, delay = 0 }) {
    if (!this.context) return;
    const t0 = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** A burst of white noise through a band-pass filter: explosions and impacts. */
  noise({ duration = 0.25, volume = 0.3, frequency = 900, delay = 0 }) {
    if (!this.context) return;
    const t0 = this.context.currentTime + delay;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t0);
  }

  shoot() {
    // Throttle: at full rapid-fire rate a blip per bullet would turn to mush.
    const now = performance.now();
    if (now - this.lastShotAt < 45) return;
    this.lastShotAt = now;
    this.tone({ frequency: 880, endFrequency: 320, type: 'square', duration: 0.07, volume: 0.07 });
  }

  enemyHit() {
    this.tone({ frequency: 300, endFrequency: 180, type: 'triangle', duration: 0.05, volume: 0.08 });
  }

  explosion(big = false) {
    this.noise({ duration: big ? 0.5 : 0.28, volume: big ? 0.5 : 0.3, frequency: big ? 420 : 760 });
    this.tone({ frequency: big ? 160 : 220, endFrequency: 40, type: 'sawtooth', duration: big ? 0.45 : 0.25, volume: 0.16 });
  }

  playerHurt() {
    this.tone({ frequency: 200, endFrequency: 60, type: 'sawtooth', duration: 0.3, volume: 0.3 });
    this.noise({ duration: 0.2, volume: 0.25, frequency: 500 });
  }

  dash() {
    this.noise({ duration: 0.16, volume: 0.14, frequency: 1800 });
    this.tone({ frequency: 300, endFrequency: 900, type: 'sine', duration: 0.14, volume: 0.08 });
  }

  pickup() {
    this.tone({ frequency: 660, type: 'sine', duration: 0.09, volume: 0.16 });
    this.tone({ frequency: 990, type: 'sine', duration: 0.12, volume: 0.16, delay: 0.07 });
  }

  bomb() {
    this.noise({ duration: 0.8, volume: 0.55, frequency: 300 });
    this.tone({ frequency: 120, endFrequency: 30, type: 'sawtooth', duration: 0.8, volume: 0.3 });
  }

  waveStart() {
    this.tone({ frequency: 392, type: 'triangle', duration: 0.12, volume: 0.18 });
    this.tone({ frequency: 523, type: 'triangle', duration: 0.12, volume: 0.18, delay: 0.1 });
    this.tone({ frequency: 784, type: 'triangle', duration: 0.2, volume: 0.2, delay: 0.2 });
  }

  gameOver() {
    this.tone({ frequency: 440, endFrequency: 55, type: 'sawtooth', duration: 1.1, volume: 0.25 });
    this.noise({ duration: 0.9, volume: 0.3, frequency: 350, delay: 0.05 });
  }

  uiClick() {
    this.tone({ frequency: 1200, type: 'sine', duration: 0.05, volume: 0.1 });
  }

  /** A dark two-bar bass pulse with a sparse sparkle on top, looped by interval. */
  startMusic() {
    if (!this.context || this.musicTimer !== null) return;
    const bassLine = [55, 55, 82.4, 55, 55, 98, 73.4, 65.4];
    this.musicTimer = window.setInterval(() => {
      if (!this.context || this.context.state !== 'running') return;
      const step = this.musicStep++;
      const note = bassLine[step % bassLine.length];
      this.tone({ frequency: note, type: 'triangle', duration: 0.22, volume: 0.12 });
      if (step % 4 === 2) this.tone({ frequency: note * 4, type: 'sine', duration: 0.3, volume: 0.035 });
    }, 214);
  }
}
