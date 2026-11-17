// Neon Void — particles and floating score text: the juice layer.
//
// Every hit, explosion, pickup and dash writes into this system and the renderer
// reads it back. Particles are plain objects in flat arrays, recycled by swapping
// the dead ones out, so a screen full of sparks costs no allocation per frame.

export class Particles {
  constructor() {
    this.sparks = [];
    this.rings = [];
    this.texts = [];
  }

  clear() {
    this.sparks.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
  }

  /** A radial burst of short-lived sparks in one colour. */
  burst(rng, x, y, color, count = 14, speed = 320, life = 0.5, size = 2.4) {
    for (let i = 0; i < count; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const velocity = rng.range(speed * 0.25, speed);
      this.sparks.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rng.range(life * 0.5, life),
        maxLife: life,
        size: rng.range(size * 0.5, size * 1.4),
        color,
        drag: 3.2,
        gravity: 0,
      });
    }
  }

  /** A few sparks sprayed along a direction: muzzle flashes and dash trails. */
  spray(rng, x, y, direction, color, count = 5, spread = 0.5, speed = 260) {
    for (let i = 0; i < count; i++) {
      const angle = direction + rng.range(-spread, spread);
      const velocity = rng.range(speed * 0.4, speed);
      this.sparks.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rng.range(0.12, 0.3),
        maxLife: 0.3,
        size: rng.range(1.2, 2.6),
        color,
        drag: 4,
        gravity: 0,
      });
    }
  }

  /** One engine-trail ember that falls behind the ship and fades. */
  ember(rng, x, y, vx, vy, color) {
    this.sparks.push({
      x: x + rng.range(-3, 3),
      y: y + rng.range(-3, 3),
      vx: vx + rng.range(-24, 24),
      vy: vy + rng.range(-24, 24),
      life: rng.range(0.2, 0.42),
      maxLife: 0.42,
      size: rng.range(1.6, 3.4),
      color,
      drag: 2,
      gravity: 0,
    });
  }

  /** An expanding shockwave ring, used for explosions and the bomb. */
  ring(x, y, color, maxRadius = 90, life = 0.38) {
    this.rings.push({ x, y, color, radius: 6, maxRadius, life, maxLife: life });
  }

  /** Floating score text that rises and fades. */
  addText(x, y, text, color = '#d9f6ff', size = 15) {
    this.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9 });
  }

  update(dt) {
    const sparks = this.sparks;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        sparks[i] = sparks[sparks.length - 1];
        sparks.pop();
        continue;
      }
      const dragFactor = Math.exp(-p.drag * dt);
      p.vx *= dragFactor;
      p.vy = p.vy * dragFactor + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const rings = this.rings;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.radius = 6 + (r.maxRadius - 6) * (1 - (1 - t) * (1 - t));
    }
    const texts = this.texts;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.y -= 44 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
  }
}
