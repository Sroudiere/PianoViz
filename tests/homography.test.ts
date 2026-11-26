import { describe, expect, it } from 'vitest';
import { apply, homography, isConvex, rectQuad, toCssMatrix3d, type Quad } from '../src/calibration/homography';

describe('homographie 4 coins', () => {
  const src = rectQuad(1920, 1080);
  // Trapèze typique d'un projecteur placé en biais à 45° : côté droit plus haut et plus étroit.
  const dst: Quad = [
    { x: 120, y: 260 },
    { x: 1700, y: 40 },
    { x: 1760, y: 1010 },
    { x: 80, y: 820 },
  ];

  it('envoie chaque coin exactement sur sa cible', () => {
    const H = homography(src, dst);
    src.forEach((p, i) => {
      const q = apply(H, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("garde les droites droites (le milieu d'un bord reste sur ce bord)", () => {
    const H = homography(src, dst);
    const m = apply(H, { x: 960, y: 1080 });
    const [a, b] = [dst[3], dst[2]];
    const cross = (b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it("donne l'identité pour un rectangle sur lui-même", () => {
    const H = homography(src, src);
    expect(H.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(toCssMatrix3d(H)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('refuse des coins dégénérés', () => {
    const flat: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(() => homography(src, flat)).toThrow();
    expect(isConvex(flat)).toBe(false);
  });

  it('détecte un quadrilatère croisé', () => {
    expect(isConvex(dst)).toBe(true);
    expect(isConvex([dst[0], dst[2], dst[1], dst[3]])).toBe(false);
  });
});
