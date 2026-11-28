import { Application, Container, Graphics } from 'pixi.js';
import type { NoteBus, NoteEvent } from '../core/events';
import type { KeyboardModel } from '../core/keyboardModel';
import type { VisualModeId, VisualSettings } from '../config/settings';
import { noteColor } from './colors';
import type { FrameContext, VisualMode } from './mode';
import { RisingBars } from './risingBars';
import { KeyGlow } from './keyGlow';
import { Particles } from './particles';
import { TestPattern } from './testPattern';

export interface RendererOptions {
  /**
   * Dessine un faux piano en bas de l'image, sur cette fraction de la hauteur
   * (aperçu de l'onglet Visuels). 0 = pas de piano : la zone d'effets occupe tout (projection).
   */
  pianoHeight?: number;
}

/** Rendu PixiJS : reçoit les notes d'un bus, les distribue aux modes actifs et dessine la mire. */
export class Renderer {
  readonly app = new Application();
  private readonly modes: Record<VisualModeId, VisualMode> = {
    bars: new RisingBars(),
    glow: new KeyGlow(),
    particles: new Particles(),
  };
  private readonly modeLayer = new Container();
  private readonly piano = new Graphics();
  readonly pattern = new TestPattern();
  private model: KeyboardModel;
  private settings: VisualSettings;
  private sustain = false;
  private patternDirty = true;
  /** Notes enfoncées et leur couleur, pour éclairer le faux piano. */
  private pressed = new Map<number, number>();
  private readonly pianoHeight: number;
  /** Notes reçues, pour le compteur d'activité et le mode « Apprendre ». */
  onNote: ((e: NoteEvent) => void) | null = null;

  constructor(model: KeyboardModel, settings: VisualSettings, options: RendererOptions = {}) {
    this.model = model;
    this.settings = settings;
    this.pianoHeight = options.pianoHeight ?? 0;
  }

  async init(host: HTMLElement, bus: NoteBus): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x000000,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: 'high-performance',
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.modeLayer, this.piano, this.pattern.container);
    this.applyModes();
    this.app.renderer.on('resize', () => (this.patternDirty = true));
    bus.on((e) => this.handle(e));
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
  }

  setModel(model: KeyboardModel): void {
    this.model = model;
    this.patternDirty = true;
  }

  setSettings(settings: VisualSettings): void {
    this.settings = settings;
    this.applyModes();
  }

  /** Met en pause ou relance le rendu (aperçu caché = aucune charge GPU). */
  setRunning(on: boolean): void {
    if (on) this.app.ticker.start();
    else this.app.ticker.stop();
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

  private applyModes(): void {
    this.modeLayer.removeChildren();
    for (const id of this.settings.modes) {
      const m = this.modes[id];
      if (m) this.modeLayer.addChild(m.container);
    }
    for (const [id, m] of Object.entries(this.modes)) {
      if (!this.settings.modes.includes(id as VisualModeId)) m.clear();
    }
  }

  private ctx(): FrameContext {
    const H = this.app.screen.height;
    return {
      width: this.app.screen.width,
      height: Math.round(H * (1 - this.pianoHeight)),
      model: this.model,
      settings: this.settings,
      sustain: this.sustain,
    };
  }

  private handle(e: NoteEvent): void {
    this.onNote?.(e);
    const ctx = this.ctx();
    if (e.type === 'sustain') this.sustain = e.down;
    if (e.type !== 'noteon' && e.type !== 'noteoff') return;
    if (!this.model.has(e.note)) return;
    const color = e.type === 'noteon' ? noteColor(e.note, e.velocity, this.settings) : 0;
    if (e.type === 'noteon') this.pressed.set(e.note, color);
    else this.pressed.delete(e.note);
    for (const id of this.settings.modes) {
      const m = this.modes[id];
      if (!m) continue;
      if (e.type === 'noteon') m.noteOn(e.note, e.velocity, color, ctx);
      else m.noteOff(e.note, ctx);
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
    // Liseré entre la zone d'effets et le piano, comme le bord du meuble.
    g.rect(0, top - 3, W, 3).fill({ color: 0x3a1d12 });
  }

  private frame(dt: number): void {
    const ctx = this.ctx();
    for (const id of this.settings.modes) this.modes[id]?.update(dt, ctx);
    if (this.pianoHeight > 0) this.drawPiano(ctx.width, ctx.height, this.app.screen.height);
    if (this.pattern.container.visible && this.patternDirty) {
      this.pattern.draw(ctx.width, ctx.height, this.model);
      this.patternDirty = false;
    }
  }
}
