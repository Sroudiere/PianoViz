/**
 * Style visuel complet, éditable couche par couche dans l'onglet Visuels.
 * Tout est sérialisable en JSON : un préréglage n'est qu'un style nommé.
 */

export type ColorMode = 'hands' | 'pitch' | 'octave' | 'velocity' | 'single' | 'gradient';
export type NoteShape = 'rounded' | 'capsule' | 'bevel' | 'rect';
export type FillType = 'none' | 'solid' | 'gradient';
export type ParticleKind = 'sparks' | 'dust' | 'smoke';
export type ParticleSource = 'key' | 'note' | 'both';

/** Couleur « de la note » (selon le mode de couleur) ou personnalisée, éclaircie vers le blanc. */
export interface ColorRef {
  ref: 'note' | 'custom';
  hex: string;
  /** 0 = couleur telle quelle, 1 = blanc. */
  white: number;
}

export interface VisualStyle {
  name: string;
  background: string;
  color: {
    mode: ColorMode;
    left: string;
    right: string;
    single: string;
    /** Dégradé le long du clavier, du grave à l'aigu. */
    gradient: [string, string, string];
    splitNote: number;
    /** Effet de la vélocité sur la luminosité, 0 à 1. */
    velocity: number;
  };
  motion: { riseSpeed: number };
  note: {
    enabled: boolean;
    shape: NoteShape;
    /** Arrondi des coins, en fraction de la demi-largeur. */
    radius: number;
    /** Largeur de la note par rapport à sa touche. */
    width: number;
    /** Hauteur minimale d'une note très courte, en largeurs de note. */
    minLength: number;
    fill: { type: FillType; top: ColorRef; bottom: ColorRef; opacity: number };
    stroke: { enabled: boolean; width: number; color: ColorRef; opacity: number; neon: boolean };
    glow: { enabled: boolean; size: number; intensity: number };
    /** Reflet vertical de verre. */
    shine: number;
    /** Fondu en haut de la zone (0 = aucun, 1 = dès la moitié). */
    fadeTop: number;
  };
  particles: {
    enabled: boolean;
    kind: ParticleKind;
    source: ParticleSource;
    /** Particules par seconde et par note tenue (ou par note en vol pour une traînée). */
    rate: number;
    /** Gerbe à l'attaque. */
    burst: number;
    life: number;
    speed: number;
    /** Ouverture du jet, en degrés autour de la verticale. */
    spread: number;
    /** Positif = retombe, négatif = s'élève. */
    gravity: number;
    turbulence: number;
    size: number;
    /** Étirement des étincelles dans le sens du mouvement. */
    stretch: number;
    color: ColorRef;
    opacity: number;
  };
  keyLine: {
    enabled: boolean;
    color: ColorRef;
    thickness: number;
    waviness: number;
    glow: number;
    /** S'embrase au-dessus des touches jouées. */
    reactive: number;
  };
  keyGlow: { enabled: boolean; height: number; intensity: number };
  impact: { enabled: boolean; size: number; intensity: number };
  guides: { enabled: boolean; color: string; opacity: number };
}

export const cref = (ref: 'note' | 'custom', hex = '#ffffff', white = 0): ColorRef => ({ ref, hex, white });

export const defaultStyle = (): VisualStyle => ({
  name: 'Néon classique',
  background: '#000000',
  color: {
    mode: 'hands',
    left: '#3fd0ff',
    right: '#ff7a3d',
    single: '#9be564',
    gradient: ['#2f6bff', '#a46bff', '#ff5c8a'],
    splitNote: 60,
    velocity: 0.6,
  },
  motion: { riseSpeed: 0.35 },
  note: {
    enabled: true,
    shape: 'rounded',
    radius: 0.5,
    width: 0.84,
    minLength: 1,
    fill: { type: 'solid', top: cref('note', '#ffffff', 0.35), bottom: cref('note'), opacity: 0.92 },
    stroke: { enabled: false, width: 2, color: cref('note', '#ffffff', 0.5), opacity: 1, neon: false },
    glow: { enabled: true, size: 14, intensity: 0.8 },
    shine: 0.25,
    fadeTop: 0.45,
  },
  particles: {
    enabled: false,
    kind: 'sparks',
    source: 'key',
    rate: 30,
    burst: 25,
    life: 1.2,
    speed: 0.45,
    spread: 25,
    gravity: 0.15,
    turbulence: 0.1,
    size: 1,
    stretch: 0.5,
    color: cref('note', '#ffffff', 0.2),
    opacity: 1,
  },
  keyLine: { enabled: false, color: cref('note'), thickness: 2, waviness: 0.3, glow: 0.6, reactive: 0.6 },
  keyGlow: { enabled: true, height: 0.3, intensity: 0.6 },
  impact: { enabled: false, size: 1, intensity: 0.8 },
  guides: { enabled: false, color: '#ffffff', opacity: 0.12 },
});

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Fusion profonde : garde la forme de `base`, prend les valeurs de `over` quand le type correspond. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (Array.isArray(base)) {
    if (!Array.isArray(over) || over.length !== base.length) return base;
    return base.map((b, i) => deepMerge(b, over[i])) as T;
  }
  if (base !== null && typeof base === 'object') {
    if (over === null || typeof over !== 'object') return base;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
      out[k] = deepMerge(v, (over as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  if (typeof over === typeof base && (typeof over !== 'number' || Number.isFinite(over))) return over as T;
  return base;
}

const preset = (patch: DeepPartial<VisualStyle>): VisualStyle => deepMerge(defaultStyle(), patch);

/** Préréglages fournis, chacun pensé d'après un des exemples. */
export const BUILTIN_PRESETS: VisualStyle[] = [
  defaultStyle(),
  preset({
    name: 'Cristal doré',
    color: { mode: 'single', single: '#8f9cff', velocity: 0.3 },
    motion: { riseSpeed: 0.3 },
    note: {
      shape: 'bevel',
      radius: 0.55,
      width: 0.62,
      fill: { type: 'gradient', top: cref('note', '#ffffff', 0.15), bottom: cref('custom', '#ffd9a0', 0.4), opacity: 0.42 },
      stroke: { enabled: true, width: 1.5, color: cref('custom', '#ffffff'), opacity: 0.55, neon: false },
      glow: { enabled: true, size: 10, intensity: 0.3 },
      shine: 0.3,
      fadeTop: 0.2,
    },
    particles: {
      enabled: true,
      kind: 'dust',
      source: 'both',
      rate: 70,
      burst: 40,
      life: 1.8,
      speed: 0.12,
      spread: 70,
      gravity: -0.03,
      turbulence: 0.9,
      size: 0.8,
      stretch: 0,
      color: cref('custom', '#ffb52e', 0.1),
      opacity: 0.9,
    },
    keyLine: { enabled: true, color: cref('custom', '#ffa21f', 0.15), thickness: 2.5, waviness: 0.7, glow: 1, reactive: 0.8 },
    keyGlow: { enabled: true, height: 0.12, intensity: 0.5 },
    impact: { enabled: true, size: 1.2, intensity: 0.9 },
  }),
  preset({
    name: 'Cyan',
    color: { mode: 'single', single: '#19e6d2', velocity: 0.25 },
    note: {
      shape: 'rounded',
      radius: 0.45,
      width: 0.72,
      fill: { type: 'gradient', top: cref('note', '#ffffff', 0.15), bottom: cref('note', '#ffffff', 0.35), opacity: 0.88 },
      glow: { enabled: true, size: 16, intensity: 0.9 },
      shine: 0.15,
      fadeTop: 0.15,
    },
    particles: {
      enabled: true,
      kind: 'dust',
      source: 'key',
      rate: 90,
      burst: 30,
      life: 1.4,
      speed: 0.35,
      spread: 22,
      gravity: 0.05,
      turbulence: 0.25,
      size: 0.7,
      stretch: 0.6,
      color: cref('note', '#ffffff', 0.3),
      opacity: 0.85,
    },
    keyLine: { enabled: true, color: cref('note', '#ffffff', 0.1), thickness: 3, waviness: 0.15, glow: 1, reactive: 0.4 },
    keyGlow: { enabled: true, height: 0.18, intensity: 0.5 },
    impact: { enabled: true, size: 1.4, intensity: 1 },
    guides: { enabled: true, color: '#9fffff', opacity: 0.1 },
  }),
  preset({
    name: 'Néon cuivré',
    color: { mode: 'single', single: '#ff8a4c', velocity: 0.2 },
    note: {
      shape: 'rounded',
      radius: 0.35,
      width: 0.7,
      fill: { type: 'none' },
      stroke: { enabled: true, width: 3, color: cref('note', '#ffffff', 0.25), opacity: 1, neon: true },
      glow: { enabled: true, size: 12, intensity: 0.8 },
      shine: 0,
      fadeTop: 0.1,
    },
    particles: {
      enabled: true,
      kind: 'sparks',
      source: 'key',
      rate: 50,
      burst: 45,
      life: 1.5,
      speed: 0.55,
      spread: 35,
      gravity: 0.35,
      turbulence: 0.1,
      size: 0.8,
      stretch: 1,
      color: cref('note', '#ffffff', 0.3),
      opacity: 1,
    },
    keyLine: { enabled: true, color: cref('note', '#ffffff', 0.1), thickness: 2.5, waviness: 0.55, glow: 0.9, reactive: 0.7 },
    keyGlow: { enabled: true, height: 0.1, intensity: 0.4 },
    impact: { enabled: true, size: 1, intensity: 0.8 },
    guides: { enabled: true, color: '#ffffff', opacity: 0.18 },
  }),
  preset({
    name: 'Fumée arc-en-ciel',
    color: { mode: 'gradient', gradient: ['#3fd0ff', '#c8f57a', '#ff7a8a'], velocity: 0.2 },
    note: {
      shape: 'capsule',
      width: 0.66,
      fill: { type: 'solid', bottom: cref('note'), opacity: 0.12 },
      stroke: { enabled: true, width: 2.5, color: cref('note', '#ffffff', 0.2), opacity: 1, neon: true },
      glow: { enabled: true, size: 14, intensity: 0.9 },
      shine: 0,
      fadeTop: 0.2,
    },
    particles: {
      enabled: true,
      kind: 'smoke',
      source: 'both',
      rate: 45,
      burst: 20,
      life: 2,
      speed: 0.18,
      spread: 30,
      gravity: -0.06,
      turbulence: 1,
      size: 1,
      stretch: 0,
      color: cref('note', '#ffffff', 0.25),
      opacity: 0.45,
    },
    keyLine: { enabled: true, color: cref('note', '#ffffff', 0.3), thickness: 2, waviness: 0.2, glow: 1, reactive: 0.6 },
    keyGlow: { enabled: true, height: 0.2, intensity: 0.7 },
    guides: { enabled: true, color: '#ffffff', opacity: 0.08 },
  }),
  preset({
    name: 'Perles bleu-rose',
    color: { mode: 'gradient', gradient: ['#2f6bff', '#a46bff', '#ff5c6a'], velocity: 0.3 },
    note: {
      shape: 'capsule',
      width: 0.8,
      minLength: 0.9,
      fill: { type: 'gradient', top: cref('note', '#ffffff', 0.55), bottom: cref('note'), opacity: 0.95 },
      stroke: { enabled: true, width: 1, color: cref('note', '#ffffff', 0.7), opacity: 0.8, neon: false },
      glow: { enabled: true, size: 12, intensity: 1 },
      shine: 0.35,
      fadeTop: 0.1,
    },
    particles: {
      enabled: true,
      kind: 'dust',
      source: 'key',
      rate: 70,
      burst: 35,
      life: 1.6,
      speed: 0.25,
      spread: 45,
      gravity: -0.02,
      turbulence: 0.7,
      size: 0.8,
      stretch: 0.3,
      color: cref('note', '#ffffff', 0.25),
      opacity: 0.85,
    },
    keyLine: { enabled: true, color: cref('note', '#ffffff', 0.4), thickness: 2, waviness: 0.05, glow: 0.9, reactive: 0.5 },
    keyGlow: { enabled: true, height: 0.1, intensity: 0.6 },
    impact: { enabled: true, size: 1.2, intensity: 0.9 },
  }),
];

export function cloneStyle(s: VisualStyle): VisualStyle {
  return structuredClone(s);
}

export function sanitizeStyle(input: unknown): VisualStyle {
  return deepMerge(defaultStyle(), input);
}
