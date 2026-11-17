// Neon Void — keyboard and mouse state, read by the simulation once per frame.
//
// The game polls this object instead of reacting to events directly, which keeps the
// controls identical in live play and in the scripted screenshot scenes. Movement
// accepts WASD and the arrow keys; aiming follows the mouse anywhere over the canvas.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set(); // edge-triggered: filled by events, drained each frame
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // edge-triggered, drained each frame
    this.enabled = true;

    window.addEventListener('keydown', (event) => {
      if (!this.keysDown.has(event.code)) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** True while any of the given key codes is held. */
  isDown(...codes) {
    return codes.some((code) => this.keysDown.has(code));
  }

  /** True only on the frame the key went down. */
  wasPressed(...codes) {
    return codes.some((code) => this.keysPressed.has(code));
  }

  /** The movement vector the player asked for, normalized, from keys alone. */
  moveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyW', 'ArrowUp')) y -= 1;
    if (this.isDown('KeyS', 'ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  get firing() {
    return this.mouseDown || this.isDown('KeyJ');
  }

  get dashRequested() {
    return this.wasPressed('ShiftLeft', 'ShiftRight', 'Space', 'KeyK');
  }

  /** Call once at the end of every frame so edge triggers fire exactly once. */
  endFrame() {
    this.keysPressed.clear();
    this.mouseClicked = false;
  }

  /** Forget all held state; used when a screenshot scene takes over the controls. */
  reset() {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.mouseDown = false;
    this.mouseClicked = false;
  }
}
