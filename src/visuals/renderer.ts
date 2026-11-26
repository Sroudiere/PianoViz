import { Application, Container } from 'pixi.js';
import type { NoteBus, NoteEvent } from '../core/events';
import { KeyboardModel } from '../core/keyboardModel';
import type { VisualModeId, VisualSettings } from '../config/settings';
import { noteColor } from './colors';
import type { FrameContext, VisualMode } from './mode';
import { RisingBars } from './risingBars';
import { KeyGlow } from './keyGlow';
import { Particles } from './particles';
import { TestPattern } from './testPattern';

/** Rendu PixiJS : reçoit les notes du bus, les distribue aux modes actifs et dessine la mire. */
export class Renderer {
  readonly app = new Application();
  private readonly modes: Record<VisualModeId, VisualMode> = {
    bars: new RisingBars(),
    glow: new KeyGlow(),
    particles: new Particles(),
  };
  private readonly modeLayer = new Container();
  readonly pattern = new TestPattern();
  private model: KeyboardModel;
  private settings: VisualSettings;
  private sustain = false;
  private correctedNotes: number[] = [];
  private patternDirty = true;
  /** Notes reçues, pour le compteur d'activité et le mode « Apprendre ». */
  onNote: ((e: NoteEvent) => void) | null = null;

  constructor(model: KeyboardModel, settings: VisualSettings) {
    this.model = model;
    this.settings = settings;
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
    this.app.stage.addChild(this.modeLayer, this.pattern.container);
    this.applyModes();
    this.app.renderer.on('resize', () => (this.patternDirty = true));
    bus.on((e) => this.handle(e));
    this.app.ticker.add((t) => this.frame(Math.min(t.deltaMS / 1000, 0.1)));
  }

  setModel(model: KeyboardModel, correctedNotes: number[]): void {
    this.model = model;
    this.correctedNotes = correctedNotes;
    this.patternDirty = true;
  }

  setSettings(settings: VisualSettings): void {
    this.settings = settings;
    this.applyModes();
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
    return {
      width: this.app.screen.width,
      height: this.app.screen.height,
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
    for (const id of this.settings.modes) {
      const m = this.modes[id];
      if (!m) continue;
      if (e.type === 'noteon') m.noteOn(e.note, e.velocity, noteColor(e.note, e.velocity, this.settings), ctx);
      else m.noteOff(e.note, ctx);
    }
  }

  private frame(dt: number): void {
    const ctx = this.ctx();
    for (const id of this.settings.modes) this.modes[id]?.update(dt, ctx);
    if (this.pattern.container.visible && this.patternDirty) {
      this.pattern.draw(ctx.width, ctx.height, this.model, this.correctedNotes);
      this.patternDirty = false;
    }
  }
}
