// Touch first: drag anywhere for a floating stick; a quick tap, a second finger, or the throw
// button throws. Keyboard (WASD / arrows + Space, J or K) and a gamepad (left stick + A) work too.

const STICK_R = 46; // px of drag for full speed
const DEAD = 6; // px
const TAP_MS = 220;
const TAP_PX = 14;

export interface StickView {
  on: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export class Input {
  mx = 0;
  mz = 0;
  /** Throws requested since the last read. */
  private throws = 0;
  /** Any input this frame (used to start audio, wake cards). */
  touched = false;
  readonly stick: StickView = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
  private pid = -1;
  private downAt = 0;
  private maxMove = 0;
  private noTap = false;
  private keys = new Set<string>();
  private padThrow = false;
  /** Called for a tap/press that should go to a card instead of the game. */
  onPress: () => boolean = () => false;
  onKey: (code: string) => void = () => {};

  constructor(surface: HTMLElement, throwBtn: HTMLElement) {
    surface.addEventListener('pointerdown', (e) => this.down(e));
    surface.addEventListener('pointermove', (e) => this.move(e));
    surface.addEventListener('pointerup', (e) => this.up(e));
    surface.addEventListener('pointercancel', (e) => this.up(e, true));
    throwBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touched = true;
      if (!this.onPress()) this.throws++;
    });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.touched = true;
      const c = e.code;
      if (['Space', 'KeyJ', 'KeyK', 'Enter'].includes(c)) {
        e.preventDefault();
        if (!this.onPress()) this.throws++;
        return;
      }
      if (c.startsWith('Arrow')) e.preventDefault();
      this.keys.add(c);
      this.onKey(c);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  private down(e: PointerEvent) {
    this.touched = true;
    if (this.pid !== -1 && e.pointerId !== this.pid) {
      // a second finger while steering: throw
      if (!this.onPress()) this.throws++;
      return;
    }
    // a touch that dismisses a card can still turn into a drag, but its release isn't a throw
    this.noTap = this.onPress();
    this.pid = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.downAt = performance.now();
    this.maxMove = 0;
    const s = this.stick;
    s.on = true;
    s.ox = s.x = e.clientX;
    s.oy = s.y = e.clientY;
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.pid) return;
    const s = this.stick;
    s.x = e.clientX;
    s.y = e.clientY;
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    this.maxMove = Math.max(this.maxMove, d);
    if (d > STICK_R) {
      // the stick's base follows the thumb, so a long drag never runs out of travel
      s.ox = s.x - (dx / d) * STICK_R;
      s.oy = s.y - (dy / d) * STICK_R;
      dx = s.x - s.ox;
      dy = s.y - s.oy;
    }
  }

  private up(e: PointerEvent, cancel = false) {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    this.stick.on = false;
    if (!cancel && !this.noTap && performance.now() - this.downAt < TAP_MS && this.maxMove < TAP_PX) this.throws++;
  }

  /** Poll keyboard and gamepad, combine with the touch stick. Call once per frame. */
  poll() {
    let mx = 0;
    let mz = 0;
    const s = this.stick;
    if (s.on) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > DEAD) {
        const m = Math.min(1, (d - DEAD) / (STICK_R - DEAD));
        mx = (dx / d) * m;
        mz = (-dy / d) * m;
      }
    }
    const k = this.keys;
    const kx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const kz = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      mx = kx / l;
      mz = kz / l;
    }
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      const az = -(p.axes[1] ?? 0);
      const d = Math.hypot(ax, az);
      if (d > 0.18) {
        const m = Math.min(1, (d - 0.18) / 0.72);
        mx = (ax / d) * m;
        mz = (az / d) * m;
      }
      const a = !!(p.buttons[0]?.pressed || p.buttons[1]?.pressed || p.buttons[7]?.pressed);
      if (a && !this.padThrow) {
        this.touched = true;
        if (!this.onPress()) this.throws++;
      }
      this.padThrow = a;
      break;
    }
    this.mx = mx;
    this.mz = mz;
  }

  takeThrow(): boolean {
    if (this.throws > 0) {
      this.throws = 0;
      return true;
    }
    return false;
  }
}
