import { BlurFilter, Container, FillGradient, Graphics } from 'pixi.js';
import type { NoteShape } from '../style/style';
import { resolve } from './colors';
import type { FrameContext, NoteSprite } from './frame';

interface Bar {
  id: number;
  note: number;
  color: number;
  velocity: number;
  /** Bas et haut, en fraction de la hauteur de zone mesurée depuis le bas. */
  bottom: number;
  top: number;
  held: boolean;
  fixed: boolean;
  /** La note a quitté la ligne du clavier et monte en entier. */
  detached: boolean;
}

/** Trace la forme d'une note dans `g` (sans la remplir). */
export function notePath(g: Graphics, x: number, y: number, w: number, h: number, shape: NoteShape, radius: number): Graphics {
  const r = Math.max(0, Math.min(radius * (w / 2), h / 2, w / 2));
  switch (shape) {
    case 'rect':
      return g.rect(x, y, w, h);
    case 'capsule':
      return g.roundRect(x, y, w, h, Math.min(w, h) / 2);
    case 'bevel':
      return g.poly([x + r, y, x + w - r, y, x + w, y + r, x + w, y + h - r, x + w - r, y + h, x + r, y + h, x, y + h - r, x, y + r]);
    default:
      return g.roundRect(x, y, w, h, r);
  }
}

/**
 * Les notes qui montent : une note naît au ras de sa touche, grandit tant qu'elle est tenue,
 * puis se détache et monte. Chaque note est dessinée selon le calque « Note » du style :
 * forme, remplissage (uni, dégradé), contour (simple ou néon), halo et reflet.
 */
export class NoteField {
  readonly glowLayer = new Container();
  readonly bodyLayer = new Container();
  private readonly glow = new Graphics();
  private readonly body = new Graphics();
  // Flou calculé en demi-résolution : quatre fois moins de pixels, visuellement identique pour un halo.
  private readonly blur = new BlurFilter({ strength: 14, quality: 2, resolution: 0.5 });
  private bars: Bar[] = [];
  private held = new Map<number, Bar>();
  private gradients = new Map<string, FillGradient>();
  private nextId = 0;
  readonly sprites: NoteSprite[] = [];

  constructor() {
    this.glow.filters = [this.blur];
    this.glow.blendMode = 'add';
    this.body.blendMode = 'add';
    this.glowLayer.addChild(this.glow);
    this.bodyLayer.addChild(this.body);
  }

  noteOn(note: number, velocity: number, color: number): void {
    const prev = this.held.get(note);
    if (prev?.fixed) return;
    if (prev) prev.held = false;
    const bar: Bar = { id: ++this.nextId, note, color, velocity, bottom: 0, top: 0, held: true, fixed: false, detached: false };
    this.bars.push(bar);
    this.held.set(note, bar);
  }

  noteOff(note: number): void {
    const bar = this.held.get(note);
    if (!bar || bar.fixed) return;
    bar.held = false;
    this.held.delete(note);
  }

  /** Note immobile, suspendue en l'air (mode « note seule » de l'aperçu). */
  setStatic(note: number | null, color = 0xffffff): void {
    this.clear();
    if (note === null) return;
    const bar: Bar = { id: ++this.nextId, note, color, velocity: 1, bottom: 0.28, top: 0.74, held: true, fixed: true, detached: true };
    this.bars.push(bar);
    this.held.set(note, bar);
  }

  recolor(color: (note: number, velocity: number) => number): void {
    for (const b of this.bars) if (b.fixed) b.color = color(b.note, b.velocity);
  }

  private gradient(top: number, bottom: number): FillGradient {
    const key = `${top}-${bottom}`;
    let g = this.gradients.get(key);
    if (!g) {
      if (this.gradients.size > 256) {
        for (const old of this.gradients.values()) old.destroy();
        this.gradients.clear();
      }
      g = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        textureSpace: 'local',
        colorStops: [
          { offset: 0, color: top },
          { offset: 1, color: bottom },
        ],
      });
      this.gradients.set(key, g);
    }
    return g;
  }

  update(ctx: FrameContext): void {
    const { width: W, height: H, model, style, dt } = ctx;
    const ns = style.note;
    const speed = style.motion.riseSpeed;
    this.blur.strength = Math.max(0, ns.glow.size);
    this.glow.visible = ns.glow.enabled && ns.enabled;
    this.body.visible = ns.enabled;
    this.glow.clear();
    this.body.clear();
    this.sprites.length = 0;

    const alive: Bar[] = [];
    for (const b of this.bars) {
      const key = model.key(b.note);
      const kw = key ? (key.x1 - key.x0) * W : 0;
      const w = Math.max(2, kw * ns.width);
      if (!b.fixed) {
        // La note sort progressivement de la ligne du clavier : son haut monte tant qu'elle est tenue.
        // Une note relâchée très tôt continue de sortir jusqu'à sa longueur minimale, puis se détache.
        b.top += speed * dt;
        if (!b.held && (b.detached || (b.top - b.bottom) * H >= w * ns.minLength)) {
          b.detached = true;
          b.bottom += speed * dt;
        }
        if (b.bottom >= 1.05) continue;
      }
      alive.push(b);
      if (!key) continue;

      const x = key.cx * W - w / 2;
      const yBottom = H - b.bottom * H;
      const visible = Math.max(0, (b.top - b.bottom) * H);
      if (visible < 0.5) continue;
      const y = yBottom - visible;
      // Tant qu'elle est accrochée à la ligne, la forme se prolonge sous la ligne (hors de la zone visible) :
      // seul son haut arrondi apparaît, comme une note qui émerge du clavier.
      const r = ns.shape === 'capsule' ? w / 2 : ns.shape === 'rect' ? 0 : ns.radius * (w / 2);
      const h = b.detached ? Math.max(visible, 1) : Math.max(visible, 2 * r + 2);
      const fade = b.fixed || ns.fadeTop <= 0 ? 1 : Math.max(0, Math.min(1, (1 - b.bottom) / (ns.fadeTop * 0.9 + 0.05)));
      this.sprites.push({ id: b.id, note: b.note, color: b.color, velocity: b.velocity, cx: key.cx * W, w, yTop: y, yBottom, held: b.held, fixed: b.fixed, alpha: fade });
      if (!ns.enabled || fade <= 0) continue;

      // Halo : la forme (ou son contour pour un néon sans remplissage), floutée.
      if (ns.glow.enabled) {
        const gc = resolve(ns.fill.type === 'none' ? ns.stroke.color : ns.fill.bottom, b.color);
        const a = ns.glow.intensity * fade;
        if (ns.fill.type === 'none') {
          notePath(this.glow, x, y, w, h, ns.shape, ns.radius).stroke({ width: Math.max(3, ns.stroke.width * 3), color: gc, alpha: a });
        } else {
          notePath(this.glow, x - 1, y - 1, w + 2, h + 2, ns.shape, ns.radius).fill({ color: gc, alpha: a });
        }
      }

      // Remplissage.
      if (ns.fill.type === 'solid') {
        notePath(this.body, x, y, w, h, ns.shape, ns.radius).fill({ color: resolve(ns.fill.bottom, b.color), alpha: ns.fill.opacity * fade });
      } else if (ns.fill.type === 'gradient') {
        const gr = this.gradient(resolve(ns.fill.top, b.color), resolve(ns.fill.bottom, b.color));
        notePath(this.body, x, y, w, h, ns.shape, ns.radius).fill({ fill: gr, alpha: ns.fill.opacity * fade });
      }

      // Reflet de verre : bande claire verticale sur le côté gauche.
      if (ns.shine > 0 && visible > 8) {
        const sw = Math.max(1.5, w * 0.16);
        const inset = Math.max(2, w * 0.14);
        this.body.roundRect(x + inset, y + inset, sw, Math.max(1, h - 2 * inset), sw / 2).fill({ color: 0xffffff, alpha: ns.shine * fade });
      }

      // Contour, avec un cœur blanc pour l'effet néon.
      if (ns.stroke.enabled) {
        const sc = resolve(ns.stroke.color, b.color);
        notePath(this.body, x, y, w, h, ns.shape, ns.radius).stroke({ width: ns.stroke.width, color: sc, alpha: ns.stroke.opacity * fade });
        if (ns.stroke.neon) {
          notePath(this.body, x, y, w, h, ns.shape, ns.radius).stroke({
            width: Math.max(0.8, ns.stroke.width * 0.35),
            color: 0xffffff,
            alpha: 0.55 * ns.stroke.opacity * fade,
          });
        }
      }
    }
    this.bars = alive;
  }

  clear(): void {
    this.bars = [];
    this.held.clear();
    this.glow.clear();
    this.body.clear();
    this.sprites.length = 0;
  }
}
