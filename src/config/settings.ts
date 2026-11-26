import type { KeyCorrection } from '../core/keyboardModel';
import type { Point, Quad } from '../calibration/homography';

export type ColorMode = 'hands' | 'pitch' | 'octave' | 'velocity' | 'single';
export type VisualModeId = 'bars' | 'glow' | 'particles';

export interface VisualSettings {
  /** Modes actifs, dessinés dans cet ordre (le premier est au fond). */
  modes: VisualModeId[];
  colorMode: ColorMode;
  /** Couleurs « main gauche » et « main droite » (hex). */
  leftColor: string;
  rightColor: string;
  singleColor: string;
  /** Note de séparation des mains : en dessous = main gauche. */
  splitNote: number;
  /** Vitesse de montée des barres, en hauteurs de zone par seconde. */
  riseSpeed: number;
  /** Halo lumineux autour des barres (coûteux sur Raspberry Pi). */
  halo: boolean;
  /** Effet de la vélocité sur la luminosité : 0 = aucun, 1 = maximal. */
  velocityAmount: number;
  /** Nombre maximal de particules vivantes. */
  maxParticles: number;
}

export interface CalibrationProfile {
  name: string;
  /** Coins de la zone d'effets en fractions de l'écran : haut-gauche, haut-droit, bas-droit, bas-gauche. */
  corners: Quad;
  mirrorX: boolean;
  mirrorY: boolean;
  corrections: KeyCorrection[];
  /** Compensation de luminosité gauche → droite : -1 assombrit la gauche, +1 la droite. */
  brightnessTilt: number;
}

export interface Settings {
  version: 1;
  keyboard: { lowest: number; highest: number; widthCm: number };
  midiInputId: string | null;
  visual: VisualSettings;
  activeProfile: string;
  profiles: Record<string, CalibrationProfile>;
}

const STORAGE_KEY = 'pianoviz.settings.v1';

export const defaultCorners = (): Quad => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const defaultProfile = (name = 'Par défaut'): CalibrationProfile => ({
  name,
  corners: defaultCorners(),
  mirrorX: false,
  mirrorY: false,
  corrections: [],
  brightnessTilt: 0,
});

export const defaultSettings = (): Settings => ({
  version: 1,
  keyboard: { lowest: 21, highest: 108, widthCm: 122 },
  midiInputId: null,
  visual: {
    modes: ['glow', 'bars'],
    colorMode: 'hands',
    leftColor: '#3fd0ff',
    rightColor: '#ff7a3d',
    singleColor: '#9be564',
    splitNote: 60,
    riseSpeed: 0.35,
    halo: true,
    velocityAmount: 0.6,
    maxParticles: 1500,
  },
  activeProfile: 'Par défaut',
  profiles: { 'Par défaut': defaultProfile() },
});

const isPoint = (p: unknown): p is Point =>
  typeof p === 'object' && p !== null && Number.isFinite((p as Point).x) && Number.isFinite((p as Point).y);

/** Fusionne des réglages lus (localStorage ou fichier) avec les valeurs par défaut, en ignorant ce qui est invalide. */
export function sanitize(input: unknown): Settings {
  const d = defaultSettings();
  if (typeof input !== 'object' || input === null) return d;
  const s = input as Partial<Settings>;
  const out: Settings = {
    ...d,
    keyboard: { ...d.keyboard, ...(s.keyboard ?? {}) },
    midiInputId: typeof s.midiInputId === 'string' ? s.midiInputId : null,
    visual: { ...d.visual, ...(s.visual ?? {}) },
    activeProfile: typeof s.activeProfile === 'string' ? s.activeProfile : d.activeProfile,
    profiles: {},
  };
  for (const [name, p] of Object.entries(s.profiles ?? {})) {
    if (!p || !Array.isArray(p.corners) || p.corners.length !== 4 || !p.corners.every(isPoint)) continue;
    out.profiles[name] = { ...defaultProfile(name), ...p, name };
  }
  if (Object.keys(out.profiles).length === 0) out.profiles = d.profiles;
  if (!out.profiles[out.activeProfile]) out.activeProfile = Object.keys(out.profiles)[0];
  const { lowest, highest } = out.keyboard;
  if (!(Number.isInteger(lowest) && Number.isInteger(highest) && lowest >= 0 && highest <= 127 && highest > lowest)) {
    out.keyboard = d.keyboard;
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Stockage plein ou désactivé : les réglages restent valables pour la session.
  }
}

export function activeProfile(s: Settings): CalibrationProfile {
  return s.profiles[s.activeProfile];
}
