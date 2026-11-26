import { describe, expect, it } from 'vitest';
import { KeyboardModel, PRESETS, isBlack, noteNameFr } from '../src/core/keyboardModel';

describe('modèle de clavier', () => {
  it.each([
    [61, 36, 25],
    [76, 45, 31],
    [88, 52, 36],
  ])('%i touches : %i blanches et %i noires', (keys, white, black) => {
    const p = PRESETS.find((x) => x.keys === keys)!;
    const m = new KeyboardModel(p.lowest, p.highest);
    expect(m.keyCount).toBe(keys);
    expect(m.whiteCount).toBe(white);
    expect(m.all().filter((k) => k.black)).toHaveLength(black);
  });

  it('couvre exactement [0, 1] avec des blanches de même largeur', () => {
    const m = new KeyboardModel(21, 108);
    const whites = m.all().filter((k) => !k.black);
    expect(whites[0].x0).toBeCloseTo(0, 9);
    expect(whites[whites.length - 1].x1).toBeCloseTo(1, 9);
    for (const k of whites) expect(k.x1 - k.x0).toBeCloseTo(1 / 52, 9);
  });

  it('place les noires entre leurs voisines, plus étroites', () => {
    const m = new KeyboardModel(21, 108);
    const cs = m.key(61)!;
    expect(cs.black).toBe(true);
    expect(cs.cx).toBeGreaterThan(m.key(60)!.cx);
    expect(cs.cx).toBeLessThan(m.key(62)!.cx);
    expect(cs.x1 - cs.x0).toBeLessThan(m.whiteWidth);
  });

  it('interpole les corrections entre les points posés', () => {
    const plain = new KeyboardModel(21, 108);
    const m = new KeyboardModel(21, 108, [
      { note: 21, dx: 0 },
      { note: 108, dx: 1 },
    ]);
    const w = m.whiteWidth;
    expect(m.key(21)!.cx - plain.key(21)!.cx).toBeCloseTo(0, 9);
    expect(m.key(108)!.cx - plain.key(108)!.cx).toBeCloseTo(w, 9);
    const mid = m.key(64)!;
    const shift = (mid.cx - plain.key(64)!.cx) / w;
    expect(shift).toBeGreaterThan(0.4);
    expect(shift).toBeLessThan(0.6);
  });

  it('applique une correction unique à tout le clavier', () => {
    const plain = new KeyboardModel(36, 96);
    const m = new KeyboardModel(36, 96, [{ note: 60, dx: -0.25 }]);
    expect(m.key(36)!.cx - plain.key(36)!.cx).toBeCloseTo(-0.25 * m.whiteWidth, 9);
  });

  it('nomme les notes en notation française', () => {
    expect(noteNameFr(60)).toBe('Do3');
    expect(noteNameFr(21)).toBe('La-1');
    expect(noteNameFr(108)).toBe('Do7');
    expect(isBlack(61)).toBe(true);
  });
});
