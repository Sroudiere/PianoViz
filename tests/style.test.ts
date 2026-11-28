import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, deepMerge, defaultStyle, sanitizeStyle } from '../src/style/style';
import { gradient3, mix, noteColor, resolve } from '../src/visuals/colors';

describe('style', () => {
  it('fusionne en gardant la forme du style par défaut', () => {
    const s = sanitizeStyle({ note: { width: 0.5, shape: 42, inconnu: true }, color: { gradient: ['#000000'] } });
    expect(s.note.width).toBe(0.5);
    expect(s.note.shape).toBe('rounded');
    expect(s.note).not.toHaveProperty('inconnu');
    expect(s.color.gradient).toEqual(defaultStyle().color.gradient);
  });

  it('rejette les nombres invalides', () => {
    expect(deepMerge({ a: 1 }, { a: Number.NaN })).toEqual({ a: 1 });
  });

  it('fournit des préréglages complets et distincts', () => {
    const names = BUILTIN_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of BUILTIN_PRESETS) expect(sanitizeStyle(p)).toEqual(p);
  });
});

describe('couleurs', () => {
  it('mélange et dégradé', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(gradient3(['#ff0000', '#00ff00', '#0000ff'], 0)).toBe(0xff0000);
    expect(gradient3(['#ff0000', '#00ff00', '#0000ff'], 0.5)).toBe(0x00ff00);
    expect(gradient3(['#ff0000', '#00ff00', '#0000ff'], 1)).toBe(0x0000ff);
  });

  it('colore par main et par dégradé', () => {
    const s = defaultStyle();
    s.color.velocity = 0;
    expect(noteColor(40, 1, 0, s)).toBe(0x3fd0ff);
    expect(noteColor(70, 1, 0, s)).toBe(0xff7a3d);
    s.color.mode = 'gradient';
    s.color.gradient = ['#000000', '#808080', '#ffffff'];
    expect(noteColor(60, 1, 1, s)).toBe(0xffffff);
  });

  it('résout une couleur de calque', () => {
    expect(resolve({ ref: 'note', hex: '#000000', white: 0 }, 0x123456)).toBe(0x123456);
    expect(resolve({ ref: 'custom', hex: '#000000', white: 1 }, 0x123456)).toBe(0xffffff);
  });
});
