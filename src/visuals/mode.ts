import type { Container } from 'pixi.js';
import type { KeyboardModel } from '../core/keyboardModel';
import type { VisualSettings } from '../config/settings';

/** Ce que chaque mode reçoit à chaque image. */
export interface FrameContext {
  /** Taille de la zone d'effets, en pixels du canevas (repère piano mis à l'échelle). */
  width: number;
  height: number;
  model: KeyboardModel;
  settings: VisualSettings;
  sustain: boolean;
}

/**
 * Un mode visuel. Il ne connaît que le repère piano : le calibrage (perspective, miroir)
 * est appliqué ensuite sur toute l'image, donc les modes n'ont jamais à s'en soucier.
 */
export interface VisualMode {
  readonly id: string;
  readonly container: Container;
  noteOn(note: number, velocity: number, color: number, ctx: FrameContext): void;
  noteOff(note: number, ctx: FrameContext): void;
  update(dt: number, ctx: FrameContext): void;
  clear(): void;
}
