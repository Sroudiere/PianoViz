import { BlurFilter, Container, Graphics } from 'pixi.js';
import type { FrameContext, VisualMode } from './mode';

interface Bar {
  note: number;
  color: number;
  /** Bas et haut de la barre, en fraction de la hauteur de zone mesurée depuis le bas. */
  bottom: number;
  top: number;
  held: boolean;
}

/**
 * Mode de base : une barre naît au ras de la touche, grandit tant qu'elle est tenue,
 * puis se détache, monte et s'estompe en haut de la zone.
 */
export class RisingBars implements VisualMode {
  readonly id = 'bars';
  readonly container = new Container();
  private readonly halo = new Graphics();
  private readonly core = new Graphics();
  private readonly haloBlur = new BlurFilter({ strength: 14, quality: 3 });
  private bars: Bar[] = [];
  private held = new Map<number, Bar>();

  constructor() {
    this.halo.filters = [this.haloBlur];
    this.halo.blendMode = 'add';
    this.core.blendMode = 'add';
    this.container.addChild(this.halo, this.core);
  }

  noteOn(note: number, _velocity: number, color: number): void {
    const prev = this.held.get(note);
    if (prev) prev.held = false;
    const bar: Bar = { note, color, bottom: 0, top: 0, held: true };
    this.bars.push(bar);
    this.held.set(note, bar);
  }

  noteOff(note: number): void {
    const bar = this.held.get(note);
    if (bar) bar.held = false;
    this.held.delete(note);
  }

  update(dt: number, ctx: FrameContext): void {
    const { width: W, height: H, model, settings } = ctx;
    const speed = settings.riseSpeed;
    this.halo.visible = settings.halo;
    this.halo.clear();
    this.core.clear();

    const alive: Bar[] = [];
    for (const b of this.bars) {
      b.top += speed * dt;
      if (!b.held) b.bottom += speed * dt;
      if (b.bottom >= 1) continue;
      alive.push(b);

      const key = model.key(b.note);
      if (!key) continue;
      const fade = Math.max(0, Math.min(1, (1.0 - b.bottom) / 0.45));
      const top = Math.min(b.top, 1.02);
      const keyW = (key.x1 - key.x0) * W;
      const pad = Math.max(1, keyW * 0.08);
      const x = key.x0 * W + pad;
      const w = Math.max(2, keyW - 2 * pad);
      const y = H - top * H;
      const h = Math.max(2, (top - b.bottom) * H);
      const r = Math.min(w / 2, 6);
      this.core.roundRect(x, y, w, h, r).fill({ color: b.color, alpha: 0.92 * fade });
      // Tête plus claire : donne du relief sans copier un style existant.
      this.core.roundRect(x + w * 0.2, y + 2, w * 0.6, Math.min(h * 0.25, 18), r).fill({ color: 0xffffff, alpha: 0.25 * fade });
      if (settings.halo) this.halo.roundRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad, r * 2).fill({ color: b.color, alpha: 0.8 * fade });
    }
    this.bars = alive;
  }

  clear(): void {
    this.bars = [];
    this.held.clear();
    this.halo.clear();
    this.core.clear();
  }
}
