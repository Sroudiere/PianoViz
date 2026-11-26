import { describe, expect, it } from 'vitest';
import { decodeMidi } from '../src/core/events';
import { defaultSettings, sanitize } from '../src/config/settings';

describe('réglages', () => {
  it('rejette un fichier invalide et garde les valeurs par défaut', () => {
    expect(sanitize('nimporte quoi')).toEqual(defaultSettings());
    const s = sanitize({ keyboard: { lowest: 90, highest: 10 }, profiles: { cassé: { corners: [1, 2] } } });
    expect(s.keyboard).toEqual(defaultSettings().keyboard);
    expect(Object.keys(s.profiles)).toEqual(['Par défaut']);
  });

  it('conserve un profil valide', () => {
    const d = defaultSettings();
    const corners = [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.1 },
      { x: 0.95, y: 0.9 },
      { x: 0.05, y: 0.8 },
    ];
    const s = sanitize({ ...d, activeProfile: 'Salon', profiles: { Salon: { corners, mirrorX: true } } });
    expect(s.activeProfile).toBe('Salon');
    expect(s.profiles.Salon.corners).toEqual(corners);
    expect(s.profiles.Salon.mirrorX).toBe(true);
    expect(s.profiles.Salon.corrections).toEqual([]);
  });
});

describe('décodage MIDI', () => {
  it('reconnaît note on, note off, vélocité nulle et pédale', () => {
    expect(decodeMidi([0x90, 60, 127], 0, 't')).toMatchObject({ type: 'noteon', note: 60, velocity: 1 });
    expect(decodeMidi([0x91, 60, 0], 0, 't')).toMatchObject({ type: 'noteoff', note: 60 });
    expect(decodeMidi([0x80, 60, 40], 0, 't')).toMatchObject({ type: 'noteoff', note: 60 });
    expect(decodeMidi([0xb0, 64, 127], 0, 't')).toMatchObject({ type: 'sustain', down: true });
    expect(decodeMidi([0xb0, 7, 100], 0, 't')).toBeNull();
    expect(decodeMidi([0xfe], 0, 't')).toBeNull();
  });
});
