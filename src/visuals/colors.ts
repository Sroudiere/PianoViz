import type { ColorRef, VisualStyle } from '../style/style';

export const hexToNum = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0xffffff;
};

export function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export function scale(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** Mélange linéaire de deux couleurs, t de 0 (a) à 1 (b). */
export function mix(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Couleur le long d'un dégradé à trois arrêts, t de 0 à 1. */
export function gradient3(stops: [string, string, string], t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? mix(hexToNum(stops[0]), hexToNum(stops[1]), u * 2) : mix(hexToNum(stops[1]), hexToNum(stops[2]), (u - 0.5) * 2);
}

/**
 * Couleur d'une note selon le mode de couleur du style, assombrie selon la vélocité.
 * `t` = position de la note sur le clavier (0 = plus grave, 1 = plus aiguë), pour le mode dégradé.
 */
export function noteColor(note: number, velocity: number, t: number, s: VisualStyle): number {
  const c = s.color;
  let base: number;
  switch (c.mode) {
    case 'hands':
      base = hexToNum(note < c.splitNote ? c.left : c.right);
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
    case 'gradient':
      base = gradient3(c.gradient, t);
      break;
    default:
      base = hexToNum(c.single);
  }
  return scale(base, 1 - c.velocity * (1 - velocity) * 0.75);
}

/** Résout une couleur de calque : celle de la note ou une couleur fixe, éclaircie vers le blanc. */
export function resolve(ref: ColorRef, note: number): number {
  const base = ref.ref === 'note' ? note : hexToNum(ref.hex);
  return ref.white > 0 ? mix(base, 0xffffff, Math.min(1, ref.white)) : base;
}
