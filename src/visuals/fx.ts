import { BlurFilter, Container, Graphics } from 'pixi.js';
import { mix, noteColor, resolve } from './colors';
import type { FrameContext } from './frame';
import { fbm } from './noise';

/** Position d'une note sur le clavier, de 0 (grave) à 1 (aigu), pour le mode de couleur « dégradé ». */
export const pitchT = (note: number, ctx: FrameContext) =>
  (note - ctx.model.lowest) / Math.max(1, ctx.model.highest - ctx.model.lowest);

/** Lignes verticales de repère, une à chaque Do. */
export class Guides {
  readonly g = new Graphics();
  update(ctx: FrameContext): void {
    const s = ctx.style.guides;
    this.g.clear();
    if (!s.enabled) return;
    for (const k of ctx.model.all()) {
      if (k.note % 12 !== 0) continue;
      const x = Math.round(k.x0 * ctx.width) + 0.5;
      this.g.moveTo(x, 0).lineTo(x, ctx.height).stroke({ width: 1, color: s.color, alpha: s.opacity });
    }
  }
}

/** Lueur au-dessus des touches tenues : un dégradé vertical doux. */
export class KeyGlow {
  readonly g = new Graphics();
  private levels = new Map<number, { color: number; level: number; target: number; held: boolean }>();

  constructor() {
    this.g.blendMode = 'add';
  }

  noteOn(note: number, velocity: number, color: number): void {
    this.levels.set(note, { color, level: this.levels.get(note)?.level ?? 0, target: 0.5 + 0.5 * velocity, held: true });
  }

  noteOff(note: number): void {
    const l = this.levels.get(note);
    if (l) l.held = false;
  }

  update(ctx: FrameContext): void {
    const s = ctx.style.keyGlow;
    this.g.clear();
    const layers = 28;
    for (const [note, l] of this.levels) {
      if (l.held) l.level += (l.target - l.level) * Math.min(1, ctx.dt * 30);
      else l.level -= ctx.dt * (ctx.sustain ? 0.6 : 2.5);
      if (l.level <= 0.01 && !l.held) {
        this.levels.delete(note);
        continue;
      }
      if (!s.enabled) continue;
      const k = ctx.model.key(note);
      if (!k) continue;
      const x = k.x0 * ctx.width;
      const w = (k.x1 - k.x0) * ctx.width;
      for (let i = 0; i < layers; i++) {
        const h = ctx.height * s.height * ((i + 1) / layers) ** 2;
        this.g.rect(x, ctx.height - h, w, h).fill({ color: l.color, alpha: (l.level * s.intensity * 1.6) / layers });
      }
    }
  }

  clear(): void {
    this.levels.clear();
    this.g.clear();
  }
}

/** Éclair au point d'impact : un point lumineux au ras de la touche, plus fort à l'attaque. */
export class Impact {
  readonly g = new Graphics();
  private flashes = new Map<number, { color: number; level: number; held: boolean }>();

  constructor() {
    this.g.blendMode = 'add';
  }

  noteOn(note: number, velocity: number, color: number): void {
    this.flashes.set(note, { color, level: 0.6 + velocity * 0.8, held: true });
  }

  noteOff(note: number): void {
    const f = this.flashes.get(note);
    if (f) f.held = false;
  }

  update(ctx: FrameContext): void {
    const s = ctx.style.impact;
    this.g.clear();
    for (const [note, f] of this.flashes) {
      const rest = f.held ? 0.45 : 0;
      f.level += (rest - f.level) * Math.min(1, ctx.dt * (f.held ? 3 : 6));
      if (!f.held && f.level < 0.02) {
        this.flashes.delete(note);
        continue;
      }
      if (!s.enabled) continue;
      const k = ctx.model.key(note);
      if (!k) continue;
      const kw = (k.x1 - k.x0) * ctx.width;
      const r = kw * 0.9 * s.size;
      const a = f.level * s.intensity;
      for (let i = 6; i >= 1; i--) {
        this.g.ellipse(k.cx * ctx.width, ctx.height, (r * i) / 6, (r * i) / 9).fill({ color: i <= 2 ? 0xffffff : f.color, alpha: (a * 0.22) / i });
      }
    }
  }

  clear(): void {
    this.flashes.clear();
    this.g.clear();
  }
}

/**
 * Ligne de lueur au ras du clavier : ondule doucement (bruit animé) et s'embrase
 * au-dessus des touches jouées. Couleur de la note sous chaque point, ou couleur fixe.
 */
export class KeyLine {
  readonly container = new Container();
  private readonly glow = new Graphics();
  private readonly core = new Graphics();
  private readonly blur = new BlurFilter({ strength: 8, quality: 2, resolution: 0.5 });
  private energy = new Map<number, number>();
  private held = new Set<number>();

  constructor() {
    this.glow.filters = [this.blur];
    this.glow.blendMode = 'add';
    this.core.blendMode = 'add';
    this.container.addChild(this.glow, this.core);
  }

  noteOn(note: number, velocity: number): void {
    this.energy.set(note, Math.max(this.energy.get(note) ?? 0, 0.6 + velocity));
    this.held.add(note);
  }

  noteOff(note: number): void {
    this.held.delete(note);
  }

  update(ctx: FrameContext): void {
    const s = ctx.style.keyLine;
    this.glow.clear();
    this.core.clear();
    for (const [n, e] of this.energy) {
      const target = this.held.has(n) ? 0.5 : 0;
      const ne = e + (target - e) * Math.min(1, ctx.dt * 2.5);
      if (ne < 0.01 && !this.held.has(n)) this.energy.delete(n);
      else this.energy.set(n, ne);
    }
    if (!s.enabled) return;
    const { width: W, height: H, model, time, style } = ctx;
    const step = Math.max(4, W / 220);
    const bumps = [...this.energy].map(([n, e]) => {
      const k = model.key(n);
      return k ? { x: k.cx * W, e, r: (k.x1 - k.x0) * W * 2.2 } : null;
    }).filter((b): b is { x: number; e: number; r: number } => b !== null);

    // Points de la ligne, puis tracé par tronçons d'une même couleur (peu d'appels de dessin).
    const pts: { x: number; y: number; e: number }[] = [];
    for (let x = 0; x <= W + step; x += step) {
      let e = 0;
      for (const b of bumps) {
        const d = (x - b.x) / b.r;
        e += b.e * Math.exp(-d * d);
      }
      e = Math.min(1.5, e * s.reactive);
      const amp = (s.waviness * 6 + e * 10 * s.waviness) * (1 + s.thickness * 0.2);
      pts.push({ x, y: H - s.thickness / 2 + fbm(x * 0.012, time * 1.7) * amp, e });
    }
    const chunk = 8;
    for (let i = 0; i < pts.length - 1; i += chunk) {
      const seg = pts.slice(i, Math.min(pts.length, i + chunk + 1));
      const mid = seg[Math.floor(seg.length / 2)];
      const e = seg.reduce((m, p) => Math.max(m, p.e), 0);
      const note = model.lowest + Math.round(((model.highest - model.lowest) * mid.x) / W);
      const base = resolve(s.color, noteColor(note, 1, mid.x / W, style));
      const core = mix(base, 0xffffff, 0.25 + Math.min(0.5, e * 0.4));
      const path = (g: Graphics) => {
        g.moveTo(seg[0].x, seg[0].y);
        for (let j = 1; j < seg.length; j++) g.lineTo(seg[j].x, seg[j].y);
        return g;
      };
      path(this.glow).stroke({ width: s.thickness * 4 + e * 6, color: base, alpha: Math.min(1, s.glow * (0.45 + e * 0.6)), join: 'round', cap: 'round' });
      path(this.core).stroke({ width: s.thickness * (1 + e * 0.5), color: core, alpha: 0.9, join: 'round', cap: 'round' });
    }
  }

  clear(): void {
    this.energy.clear();
    this.held.clear();
    this.glow.clear();
    this.core.clear();
  }
}
