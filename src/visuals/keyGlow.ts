import { Container, Graphics } from 'pixi.js';
import type { FrameContext, VisualMode } from './mode';

interface Glow {
  color: number;
  level: number;
  target: number;
  held: boolean;
}

/** Lueur de touche : la zone juste au-dessus de la touche s'illumine pendant l'appui puis s'éteint en fondu. */
export class KeyGlow implements VisualMode {
  readonly id = 'glow';
  readonly container = new Container();
  private readonly g = new Graphics();
  private glows = new Map<number, Glow>();

  constructor() {
    this.g.blendMode = 'add';
    this.container.addChild(this.g);
  }

  noteOn(note: number, velocity: number, color: number): void {
    this.glows.set(note, { color, level: 0, target: 0.5 + 0.5 * velocity, held: true });
  }

  noteOff(note: number): void {
    const glow = this.glows.get(note);
    if (glow) glow.held = false;
  }

  update(dt: number, ctx: FrameContext): void {
    const { width: W, height: H, model, sustain } = ctx;
    this.g.clear();
    const layers = 32;
    for (const [note, glow] of this.glows) {
      if (glow.held) glow.level += (glow.target - glow.level) * Math.min(1, dt * 30);
      else glow.level -= dt * (sustain ? 0.6 : 2.5);
      if (glow.level <= 0.01 && !glow.held) {
        this.glows.delete(note);
        continue;
      }
      const key = model.key(note);
      if (!key) continue;
      const x = key.x0 * W;
      const w = (key.x1 - key.x0) * W;
      for (let i = 0; i < layers; i++) {
        // Couches empilées de plus en plus hautes : dégradé doux du bas vers le haut.
        const h = H * 0.3 * ((i + 1) / layers) ** 2;
        this.g.rect(x, H - h, w, h).fill({ color: glow.color, alpha: glow.level * 0.035 });
      }
    }
  }

  clear(): void {
    this.glows.clear();
    this.g.clear();
  }
}
