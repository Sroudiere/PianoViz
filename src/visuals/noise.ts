/** Bruit de valeur lissé, déterministe : sert aux ondulations de la ligne et aux tourbillons des particules. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Bruit 2D dans [0, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Somme de deux octaves, dans [-1, 1]. */
export function fbm(x: number, y: number): number {
  return (noise2(x, y) * 0.65 + noise2(x * 2.3 + 17, y * 2.3 - 9) * 0.35) * 2 - 1;
}
