import type { Point, Quad } from '../calibration/homography';
import { defaultStyle, sanitizeStyle, type VisualStyle } from '../style/style';

export interface CalibrationProfile {
  name: string;
  /** Coins de la zone d'effets en fractions de l'écran : haut-gauche, haut-droit, bas-droit, bas-gauche. */
  corners: Quad;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Compensation de luminosité gauche → droite : -1 assombrit la gauche, +1 la droite. */
  brightnessTilt: number;
}

export interface Settings {
  version: 1;
  keyboard: { lowest: number; highest: number; widthCm: number };
  midiInputId: string | null;
  /** Style visuel courant, édité dans l'onglet Visuels. */
  style: VisualStyle;
  /** Préréglages enregistrés par l'utilisateur. */
  userPresets: VisualStyle[];
  performance: { maxParticles: number };
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
  brightnessTilt: 0,
});

export const defaultSettings = (): Settings => ({
  version: 1,
  keyboard: { lowest: 21, highest: 108, widthCm: 122 },
  midiInputId: null,
  style: defaultStyle(),
  userPresets: [],
  performance: { maxParticles: 2500 },
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
    style: sanitizeStyle(s.style),
    userPresets: Array.isArray(s.userPresets) ? s.userPresets.map(sanitizeStyle) : [],
    performance: {
      maxParticles: Number.isFinite(s.performance?.maxParticles) ? Math.max(100, Math.min(8000, s.performance!.maxParticles)) : d.performance.maxParticles,
    },
    activeProfile: typeof s.activeProfile === 'string' ? s.activeProfile : d.activeProfile,
    profiles: {},
  };
  for (const [name, p] of Object.entries(s.profiles ?? {})) {
    if (!p || !Array.isArray(p.corners) || p.corners.length !== 4 || !p.corners.every(isPoint)) continue;
    const d0 = defaultProfile(name);
    // On ne garde que les champs connus (les anciennes corrections de touches sont ignorées).
    out.profiles[name] = {
      name,
      corners: p.corners,
      mirrorX: typeof p.mirrorX === 'boolean' ? p.mirrorX : d0.mirrorX,
      mirrorY: typeof p.mirrorY === 'boolean' ? p.mirrorY : d0.mirrorY,
      brightnessTilt: Number.isFinite(p.brightnessTilt) ? p.brightnessTilt : d0.brightnessTilt,
    };
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
