/**
 * Homographie (correction de perspective par 4 coins).
 *
 * H est une matrice 3 × 3 [a b c; d e f; g h 1] qui envoie un point (x, y) du plan source
 * vers (u, v) = ((a x + b y + c) / w, (d x + e y + f) / w) avec w = g x + h y + 1.
 */

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Résout A x = b par élimination de Gauss avec pivot partiel. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Coins dégénérés : trois points alignés ou confondus');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homographie qui envoie les 4 points src sur les 4 points dst (même ordre). */
export function homography(src: Quad, dst: Quad): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const [a, bb, c, d, e, f, g, h] = solve(A, b);
  return [a, bb, c, d, e, f, g, h, 1];
}

export function apply(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Rectangle [0, w] × [0, h] dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche. */
export function rectQuad(w: number, h: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/**
 * Chaîne CSS `matrix3d(...)` équivalente à H, à utiliser avec `transform-origin: 0 0`.
 * La transformation est exacte : le navigateur compose l'image déformée sur le GPU.
 */
export function toCssMatrix3d(H: Mat3): string {
  const [a, b, c, d, e, f, g, h, i] = H;
  // Ordre colonne par colonne (column-major) attendu par CSS.
  const m = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)).join(',')})`;
}

/** Vrai si le quadrilatère est convexe et non croisé (condition pour une homographie utilisable). */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = q[i];
    const p1 = q[(i + 1) % 4];
    const p2 = q[(i + 2) % 4];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
