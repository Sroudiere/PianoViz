import type { KeyboardModel } from '../core/keyboardModel';
import type { VisualStyle } from '../style/style';

/** Ce que chaque calque reçoit à chaque image. */
export interface FrameContext {
  /** Taille de la zone d'effets, en pixels du canevas. Le bas (y = height) est le ras des touches. */
  width: number;
  height: number;
  model: KeyboardModel;
  style: VisualStyle;
  sustain: boolean;
  /** Temps écoulé depuis le début, en secondes. */
  time: number;
  dt: number;
  maxParticles: number;
}

/** Une note visible (en vol ou tenue), telle que les calques d'effets la voient. */
export interface NoteSprite {
  note: number;
  color: number;
  velocity: number;
  /** Centre horizontal, largeur, bord haut et bord bas en pixels. */
  cx: number;
  w: number;
  yTop: number;
  yBottom: number;
  held: boolean;
  /** Note immobile de l'aperçu « note seule » : elle émet toujours des particules. */
  fixed: boolean;
  alpha: number;
}
