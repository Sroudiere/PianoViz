import { BlurFilter, Container, Graphics, Sprite } from 'pixi.js';
import { columnTexture, radialTexture } from './textures';
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

/** Lueur au-dessus des touches tenues : une colonne en vrai dégradé, aux bords adoucis. */
export class KeyGlow {
  readonly g = new Container();
  private levels = new Map<number, { color: number; level: number; target: number; held: boolean; sprite: Sprite }>();

  constructor() {
    this.g.blendMode = 'add';
  }

  noteOn(note: number, velocity: number, color: number): void {
    const prev = this.levels.get(note);
    const sprite = prev?.sprite ?? this.g.addChild(new Sprite(columnTexture()));
    sprite.tint = color;
    this.levels.set(note, { color, level: prev?.level ?? 0, target: 0.5 + 0.5 * velocity, held: true, sprite });
  }

  noteOff(note: number): void {
    const l = this.levels.get(note);
    if (l) l.held = false;
  }

  update(ctx: FrameContext): void {
    const s = ctx.style.keyGlow;
    for (const [note, l] of this.levels) {
      if (l.held) l.level += (l.target - l.level) * Math.min(1, ctx.dt * 30);
      else l.level -= ctx.dt * (ctx.sustain ? 0.6 : 2.5);
      if (l.level <= 0.01 && !l.held) {
        l.sprite.destroy();
        this.levels.delete(note);
        continue;
      }
      const k = ctx.model.key(note);
      l.sprite.visible = s.enabled && Boolean(k);
      if (!k || !s.enabled) continue;
      const kw = (k.x1 - k.x0) * ctx.width;
      const w = kw * 1.5;
      const h = ctx.height * s.height;
      l.sprite.position.set(k.cx * ctx.width - w / 2, ctx.height - h);
      l.sprite.width = w;
      l.sprite.height = h;
      l.sprite.alpha = Math.min(1, l.level * s.intensity * 1.2);
    }
  }

  clear(): void {
    for (const l of this.levels.values()) l.sprite.destroy();
    this.levels.clear();
  }
}

/** Éclair au point d'impact : halo doux teinté et cœur blanc au ras de la touche, plus fort à l'attaque. */
export class Impact {
  readonly g = new Container();
  private flashes = new Map<number, { color: number; level: number; held: boolean; halo: Sprite; core: Sprite }>();

  constructor() {
    this.g.blendMode = 'add';
  }

  noteOn(note: number, velocity: number, color: number): void {
    const prev = this.flashes.get(note);
    const halo = prev?.halo ?? this.g.addChild(new Sprite(radialTexture()));
    const core = prev?.core ?? this.g.addChild(new Sprite(radialTexture()));
    halo.anchor.set(0.5);
    core.anchor.set(0.5);
    halo.tint = color;
    core.tint = 0xffffff;
    this.flashes.set(note, { color, level: 0.6 + velocity * 0.8, held: true, halo, core });
  }

  noteOff(note: number): void {
    const f = this.flashes.get(note);
    if (f) f.held = false;
  }

  update(ctx: FrameContext): void {
    const s = ctx.style.impact;
    for (const [note, f] of this.flashes) {
      const rest = f.held ? 0.45 : 0;
      f.level += (rest - f.level) * Math.min(1, ctx.dt * (f.held ? 3 : 6));
      if (!f.held && f.level < 0.02) {
        f.halo.destroy();
        f.core.destroy();
        this.flashes.delete(note);
        continue;
      }
      const k = ctx.model.key(note);
      const on = s.enabled && Boolean(k);
      f.halo.visible = f.core.visible = on;
      if (!k || !on) continue;
      const kw = (k.x1 - k.x0) * ctx.width;
      const r = kw * 1.6 * s.size;
      const a = Math.min(1, f.level * s.intensity);
      f.halo.position.set(k.cx * ctx.width, ctx.height);
      f.halo.width = r * 2;
      f.halo.height = r * 1.2;
      f.halo.alpha = a * 0.9;
      f.core.position.set(k.cx * ctx.width, ctx.height);
      f.core.width = r * 0.7;
      f.core.height = r * 0.4;
      f.core.alpha = a * 0.8;
    }
  }

  clear(): void {
    for (const f of this.flashes.values()) {
      f.halo.destroy();
      f.core.destroy();
    }
    this.flashes.clear();
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
