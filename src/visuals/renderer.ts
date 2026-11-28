import { Application, Container, Graphics } from 'pixi.js';
import type { NoteBus, NoteEvent } from '../core/events';
import type { KeyboardModel } from '../core/keyboardModel';
import type { VisualStyle } from '../style/style';
import { hexToNum, noteColor } from './colors';
import type { FrameContext } from './frame';
import { Guides, Impact, KeyGlow, KeyLine, pitchT } from './fx';
import { NoteField } from './noteField';
import { ParticleSystem } from './particleSystem';
import { TestPattern } from './testPattern';

export interface RendererOptions {
  /**
   * Dessine un faux piano en bas de l'image, sur cette fraction de la hauteur
   * (aperçu de l'onglet Visuels). 0 = pas de piano : la zone d'effets occupe tout (projection).
   */
  pianoHeight?: number;
}

/**
 * Rendu PixiJS : reçoit les notes d'un bus et les distribue aux calques du style,
 * du fond vers l'avant : repères, lueur des touches, particules, halo et corps des notes,
 * ligne du clavier, éclair d'impact, puis faux piano et mire.
 */
export class Renderer {
  readonly app = new Application();
  readonly notes = new NoteField();
  private readonly particles = new ParticleSystem();
  private readonly guides = new Guides();
  private readonly keyGlow = new KeyGlow();
  private readonly keyLine = new KeyLine();
  private readonly impact = new Impact();
  private readonly fxRoot = new Container();
  private readonly piano = new Graphics();
  readonly pattern = new TestPattern();
  private model: KeyboardModel;
  private style: VisualStyle;
  private sustain = false;
  private patternDirty = true;
  private time = 0;
  private staticNote: number | null = null;
  maxParticles = 2500;
  private running = true;
  /** Notes enfoncées et leur couleur, pour éclairer le faux piano. */
  private pressed = new Map<number, number>();
  private readonly pianoHeight: number;
  /** Notes reçues, pour le compteur d'activité et le mode « Apprendre ». */
  onNote: ((e: NoteEvent) => void) | null = null;
  /** Appelé après chaque image (pour placer des poignées par-dessus l'aperçu). */
  onFrame: (() => void) | null = null;

  constructor(model: KeyboardModel, style: VisualStyle, options: RendererOptions = {}) {
    this.model = model;
    this.style = style;
    this.pianoHeight = options.pianoHeight ?? 0;
  }

  async init(host: HTMLElement, bus: NoteBus): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: hexToNum(this.style.background),
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: 'high-performance',
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.fxRoot.addChild(
      this.guides.g,
      this.keyGlow.g,
      this.particles.container,
      this.notes.glowLayer,
      this.notes.bodyLayer,
      this.keyLine.container,
      this.impact.g,
    );
    this.app.stage.addChild(this.fxRoot, this.piano, this.pattern.container);
    this.app.renderer.on('resize', () => (this.patternDirty = true));
    bus.on((e) => this.handle(e));
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
  }

  /** Taille de la zone d'effets en pixels CSS (le faux piano est en dessous). */
  get zone(): { width: number; height: number } {
    return { width: this.app.screen.width, height: Math.round(this.app.screen.height * (1 - this.pianoHeight)) };
  }

  get keyboard(): KeyboardModel {
    return this.model;
  }

  setModel(model: KeyboardModel): void {
    this.model = model;
    this.patternDirty = true;
    if (this.staticNote !== null) this.setStatic(this.staticNote);
  }

  setStyle(style: VisualStyle): void {
    this.style = style;
    if (this.app.renderer) this.app.renderer.background.color = hexToNum(style.background);
    this.notes.recolor((n, v) => this.colorOf(n, v));
  }

  /** Mode « note seule » : une note immobile en l'air, qui émet en continu. null = désactivé. */
  setStatic(note: number | null): void {
    this.staticNote = note;
    this.particles.clear();
    this.notes.setStatic(note, note === null ? 0 : this.colorOf(note, 1));
    this.keyGlow.clear();
    this.impact.clear();
    this.keyLine.clear();
    this.pressed.clear();
    if (note !== null) {
      const c = this.colorOf(note, 1);
      this.keyGlow.noteOn(note, 1, c);
      this.impact.noteOn(note, 0.4, c);
      this.keyLine.noteOn(note, 0.6);
      this.pressed.set(note, c);
    }
  }

  /**
   * Met en pause ou relance le rendu. En pause, les notes reçues sont ignorées
   * (sinon elles s'accumuleraient et partiraient toutes d'un coup à la reprise).
   */
  setRunning(on: boolean): void {
    if (!this.app.ticker) return;
    if (on === this.running) return;
    this.running = on;
    if (on) this.app.ticker.start();
    else {
      this.app.ticker.stop();
      this.clearAll();
    }
  }

  private clearAll(): void {
    this.notes.clear();
    this.particles.clear();
    this.keyGlow.clear();
    this.impact.clear();
    this.keyLine.clear();
    this.pressed.clear();
    if (this.staticNote !== null) this.setStatic(this.staticNote);
  }

  showPattern(on: boolean): void {
    this.pattern.container.visible = on;
    this.patternDirty = true;
  }

  get patternVisible(): boolean {
    return this.pattern.container.visible;
  }

  highlight(note: number | null): void {
    this.pattern.highlight(note);
    this.patternDirty = true;
  }

  private colorOf(note: number, velocity: number): number {
    return noteColor(note, velocity, (note - this.model.lowest) / Math.max(1, this.model.highest - this.model.lowest), this.style);
  }

  private ctx(dt = 0): FrameContext {
    const { width, height } = this.zone;
    return { width, height, model: this.model, style: this.style, sustain: this.sustain, time: this.time, dt, maxParticles: this.maxParticles };
  }

  private handle(e: NoteEvent): void {
    this.onNote?.(e);
    if (e.type === 'sustain') this.sustain = e.down;
    if (e.type !== 'noteon' && e.type !== 'noteoff') return;
    if (!this.running || !this.model.has(e.note) || this.staticNote !== null) return;
    const ctx = this.ctx();
    if (e.type === 'noteon') {
      const color = noteColor(e.note, e.velocity, pitchT(e.note, ctx), this.style);
      this.pressed.set(e.note, color);
      this.notes.noteOn(e.note, e.velocity, color);
      this.keyGlow.noteOn(e.note, e.velocity, color);
      this.impact.noteOn(e.note, e.velocity, color);
      this.keyLine.noteOn(e.note, e.velocity);
      const k = this.model.key(e.note)!;
      this.particles.burst(k.cx * ctx.width, (k.x1 - k.x0) * ctx.width, color, e.velocity, ctx);
    } else {
      this.pressed.delete(e.note);
      this.notes.noteOff(e.note);
      this.keyGlow.noteOff(e.note);
      this.impact.noteOff(e.note);
      this.keyLine.noteOff(e.note);
    }
  }

  private drawPiano(W: number, top: number, H: number): void {
    const g = this.piano;
    g.clear();
    const h = H - top;
    for (const k of this.model.all()) {
      if (k.black) continue;
      const c = this.pressed.get(k.note);
      g.rect(k.x0 * W + 1, top, (k.x1 - k.x0) * W - 2, h - 2).fill({ color: c ?? 0xf2f2f2 });
    }
    for (const k of this.model.all()) {
      if (!k.black) continue;
      const c = this.pressed.get(k.note);
      g.rect(k.x0 * W, top, (k.x1 - k.x0) * W, h * 0.62).fill({ color: c ?? 0x111111 });
    }
  }

  private frame(dt: number): void {
    this.time += dt;
    const ctx = this.ctx(dt);
    this.guides.update(ctx);
    this.keyGlow.update(ctx);
    this.notes.update(ctx);
    this.particles.update(ctx, this.notes.sprites, (n) => {
      const k = this.model.key(n);
      return k ? (k.x1 - k.x0) * ctx.width : 0;
    });
    this.keyLine.update(ctx);
    this.impact.update(ctx);
    if (this.pianoHeight > 0) this.drawPiano(ctx.width, ctx.height, this.app.screen.height);
    if (this.pattern.container.visible && this.patternDirty) {
      this.pattern.draw(ctx.width, ctx.height, this.model);
      this.patternDirty = false;
    }
    this.onFrame?.();
  }
}
