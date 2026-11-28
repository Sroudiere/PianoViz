import { Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import type { ParticleKind } from '../style/style';
import { resolve } from './colors';
import type { FrameContext, NoteSprite } from './frame';
import { fbm } from './noise';

interface P {
  sprite: Particle;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  seed: number;
}

/** Textures douces dessinées une fois sur un canevas : point, étincelle étirée, bouffée de fumée. */
function buildAtlas(): Record<ParticleKind, Texture> {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * 3;
  c.height = S;
  const g = c.getContext('2d')!;
  // Point lumineux à cœur dur.
  let rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  // Étincelle : trait horizontal fondu aux deux bouts.
  const lg = g.createLinearGradient(S, 0, 2 * S, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg;
  g.fillRect(S, S / 2 - 3, S, 6);
  // Fumée : bouffée très douce.
  rg = g.createRadialGradient(2.5 * S, S / 2, 0, 2.5 * S, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,0.55)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(2 * S, 0, S, S);
  const base = Texture.from(c);
  const frame = (i: number) => new Texture({ source: base.source, frame: new Rectangle(i * S, 0, S, S) });
  return { dust: frame(0), sparks: frame(1), smoke: frame(2) };
}

let atlas: Record<ParticleKind, Texture> | null = null;

/**
 * Particules : étincelles (rapides, étirées, retombent), poussière (fine, tourbillonne)
 * ou fumée (grosses bouffées douces). Elles partent des touches, des notes (traînée) ou des deux.
 */
export class ParticleSystem {
  readonly container = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  });
  private parts: P[] = [];
  /** Reste fractionnaire d'émission par note en vol : à faible débit, aucune particule n'est perdue. */
  private acc = new Map<number, number>();

  constructor() {
    atlas ??= buildAtlas();
    this.container.blendMode = 'add';
  }

  get count(): number {
    return this.parts.length;
  }

  /** Gerbe à l'attaque d'une note, au ras de sa touche. */
  burst(cx: number, kw: number, color: number, velocity: number, ctx: FrameContext): void {
    const p = ctx.style.particles;
    if (!p.enabled || p.source === 'note') return;
    const n = Math.round(p.burst * (0.4 + velocity * 0.8));
    for (let i = 0; i < n; i++) this.spawn(cx + (Math.random() - 0.5) * kw, ctx.height, color, 1.4 * (0.6 + velocity * 0.6), ctx);
  }

  private spawn(x: number, y: number, noteColor: number, speedK: number, ctx: FrameContext, along = false): void {
    if (this.parts.length >= ctx.maxParticles) return;
    const p = ctx.style.particles;
    const H = ctx.height;
    const spread = (p.spread * Math.PI) / 180;
    const a = -Math.PI / 2 + (Math.random() * 2 - 1) * spread;
    const v = p.speed * H * (0.35 + Math.random() * 0.9) * speedK * (along ? 0.35 : 1);
    const max = p.life * (0.5 + Math.random() * 0.8);
    const base = p.kind === 'smoke' ? 0.9 : p.kind === 'sparks' ? 0.28 : 0.12;
    const sprite = new Particle({
      texture: atlas![p.kind],
      x,
      y,
      anchorX: p.kind === 'sparks' ? 0.85 : 0.5,
      anchorY: 0.5,
      tint: resolve(p.color, noteColor),
      alpha: 0,
    });
    this.container.addParticle(sprite);
    this.parts.push({ sprite, kind: p.kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, size: base * p.size * (0.5 + Math.random()), seed: Math.random() * 100 });
  }

  /** Émission continue depuis les touches tenues et/ou le long des notes, puis animation. */
  update(ctx: FrameContext, notes: NoteSprite[], keyW: (note: number) => number): void {
    const p = ctx.style.particles;
    const { dt, time, height: H } = ctx;
    if (p.enabled) {
      for (const n of notes) {
        if (n.alpha <= 0.05) continue;
        const fromKey = n.held && (p.source === 'key' || p.source === 'both');
        const fromNote = n.fixed || p.source === 'note' || p.source === 'both';
        let budget = this.acc.get(n.id) ?? 0;
        if (fromKey) budget += p.rate * dt;
        if (fromNote) budget += p.rate * dt * 0.8;
        const count = Math.floor(budget);
        this.acc.set(n.id, budget - count);
        for (let i = 0; i < count; i++) {
          const useKey = fromKey && (!fromNote || Math.random() < 0.5);
          if (useKey) this.spawn(n.cx + (Math.random() - 0.5) * keyW(n.note), H, n.color, 1, ctx);
          else {
            // Traînée : le long de la note, surtout vers son bas.
            const y = n.yBottom - Math.random() ** 2 * (n.yBottom - n.yTop);
            this.spawn(n.cx + (Math.random() - 0.5) * n.w * 0.9, y, n.color, 1, ctx, true);
          }
        }
      }
      // On oublie les notes disparues.
      if (this.acc.size > notes.length) {
        const live = new Set(notes.map((n) => n.id));
        for (const id of this.acc.keys()) if (!live.has(id)) this.acc.delete(id);
      }
    }

    const g = p.gravity * H;
    const turb = p.turbulence * H * 1.6;
    const drag = p.kind === 'sparks' ? 0.6 : p.kind === 'smoke' ? 1.6 : 1.2;
    const alive: P[] = [];
    let removed = false;
    for (const q of this.parts) {
      q.life -= dt;
      if (q.life <= 0) {
        removed = true;
        continue;
      }
      if (turb > 0) {
        q.vx += fbm(q.x * 0.008 + q.seed, time * 0.6) * turb * dt;
        q.vy += fbm(q.y * 0.008 - q.seed, time * 0.6 + 40) * turb * dt * 0.6;
      }
      q.vy += g * dt;
      const k = Math.max(0, 1 - drag * dt);
      q.vx *= k;
      q.vy *= k;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const r = q.life / q.max;
      const s = q.sprite;
      s.x = q.x;
      s.y = q.y;
      if (q.kind === 'sparks') {
        const sp = Math.hypot(q.vx, q.vy);
        s.rotation = Math.atan2(q.vy, q.vx);
        s.scaleX = q.size * (0.6 + p.stretch * Math.min(4, (sp / H) * 6));
        s.scaleY = q.size * 0.9;
        s.alpha = p.opacity * Math.min(1, r * 1.6);
      } else if (q.kind === 'smoke') {
        const grow = 0.6 + (1 - r) * 1.4;
        s.scaleX = s.scaleY = q.size * grow;
        s.rotation = 0;
        s.alpha = p.opacity * 0.5 * Math.min(1, (1 - r) * 6) * r;
      } else {
        s.scaleX = s.scaleY = q.size * (0.6 + r * 0.4);
        s.rotation = 0;
        s.alpha = p.opacity * Math.min(1, (1 - r) * 8) * Math.min(1, r * 2);
      }
      alive.push(q);
    }
    this.parts = alive;
    if (removed) {
      // Une seule reconstruction de la liste plutôt qu'un retrait par particule.
      this.container.particleChildren = alive.map((q) => q.sprite);
      this.container.update();
    }
  }

  clear(): void {
    this.container.removeParticles();
    this.parts = [];
    this.acc.clear();
  }
}
