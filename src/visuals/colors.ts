import type { VisualSettings } from '../config/settings';

export const hexToNum = (hex: string): number => parseInt(hex.replace('#', ''), 16) || 0xffffff;

function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function scale(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** Couleur d'une note selon le mode de couleur choisi, assombrie selon la vélocité. */
export function noteColor(note: number, velocity: number, v: VisualSettings): number {
  let base: number;
  switch (v.colorMode) {
    case 'hands':
      base = hexToNum(note < v.splitNote ? v.leftColor : v.rightColor);
      break;
    case 'pitch':
      base = hsl((note % 12) * 30, 0.85, 0.58);
      break;
    case 'octave':
      base = hsl(((Math.floor(note / 12) * 47) % 360 + 360) % 360, 0.8, 0.58);
      break;
    case 'velocity':
      base = hsl(220 - velocity * 220, 0.9, 0.55);
      break;
    default:
      base = hexToNum(v.singleColor);
  }
  const brightness = 1 - v.velocityAmount * (1 - velocity) * 0.75;
  return scale(base, brightness);
}
