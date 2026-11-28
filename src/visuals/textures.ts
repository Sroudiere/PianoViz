import { Texture } from 'pixi.js';

/**
 * Textures de dégradés calculées pixel par pixel, avec un léger tramage (dithering)
 * pour éviter les bandes visibles quand une lueur faible s'étale sur une grande surface.
 * Elles sont blanches : la couleur vient de la teinte (tint) du sprite.
 */
function makeTexture(w: number, h: number, alphaAt: (u: number, v: number) => number): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, Math.min(1, alphaAt((x + 0.5) / w, (y + 0.5) / h)));
      // Tramage : ±0,5 niveau aléatoire, invisible à l'œil mais casse les paliers.
      const v = Math.max(0, Math.min(255, Math.round(a * 255 + (Math.random() - 0.5))));
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let radial: Texture | null = null;
let column: Texture | null = null;

/** Halo rond très doux (profil gaussien), centre à pleine intensité. */
export function radialTexture(): Texture {
  radial ??= makeTexture(256, 256, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    return Math.exp(-d * d * 4.5) * (1 - smoothstep(0.85, 1, d));
  });
  return radial;
}

/**
 * Colonne de lueur : pleine en bas, s'éteint vers le haut en douceur,
 * avec des bords latéraux adoucis (pas d'arête nette entre deux touches).
 */
export function columnTexture(): Texture {
  column ??= makeTexture(64, 512, (u, v) => {
    const vertical = Math.pow(v, 2.4);
    const side = smoothstep(0, 0.28, u) * smoothstep(0, 0.28, 1 - u);
    return vertical * side;
  });
  return column;
}
