import { Container, Graphics } from 'pixi.js';
import type { FrameContext, VisualMode } from './mode';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

/** Particules : une gerbe d'étincelles à chaque attaque, et un léger flux tant que la touche est tenue. */
export class Particles implements VisualMode {
  readonly id = 'particles';
  readonly container = new Container();
  private readonly g = new Graphics();
  private parts: Particle[] = [];
  private held = new Map<number, { color: number; velocity: number; acc: number }>();

  constructor() {
    this.g.blendMode = 'add';
    this.container.addChild(this.g);
  }

  noteOn(note: number, velocity: number, color: number, ctx: FrameContext): void {
    this.held.set(note, { color, velocity, acc: 0 });
    this.burst(note, color, Math.round(8 + velocity * 30), velocity, ctx);
  }

  noteOff(note: number): void {
    this.held.delete(note);
  }

  private burst(note: number, color: number, count: number, velocity: number, ctx: FrameContext): void {
    const key = ctx.model.key(note);
    if (!key) return;
    const room = ctx.settings.maxParticles - this.parts.length;
    const n = Math.min(count, Math.max(0, room));
    const { width: W, height: H } = ctx;
    const kw = (key.x1 - key.x0) * W;
    for (let i = 0; i < n; i++) {
      const maxLife = 0.8 + Math.random() * 1.2;
      this.parts.push({
        x: key.x0 * W + Math.random() * kw,
        y: H,
        vx: (Math.random() - 0.5) * kw * 2.5,
        vy: -H * (0.25 + Math.random() * 0.5) * (0.5 + velocity),
        life: maxLife,
        maxLife,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  update(dt: number, ctx: FrameContext): void {
    for (const [note, h] of this.held) {
      h.acc += dt * 40 * (0.3 + h.velocity);
      const n = Math.floor(h.acc);
      if (n > 0) {
        h.acc -= n;
        this.burst(note, h.color, n, h.velocity * 0.5, ctx);
      }
    }
    this.g.clear();
    const alive: Particle[] = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy *= 1 - dt * 0.8;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = p.life / p.maxLife;
      this.g.circle(p.x, p.y, p.size * (0.5 + a * 0.5)).fill({ color: p.color, alpha: a });
      alive.push(p);
    }
    this.parts = alive;
  }

  clear(): void {
    this.parts = [];
    this.held.clear();
    this.g.clear();
  }
}
