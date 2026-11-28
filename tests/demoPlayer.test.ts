import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteBus, type NoteEvent } from '../src/core/events';
import { DemoPlayer, PreviewLoop, TimedNotes } from '../src/midi/demoPlayer';

/** Suit l'état de chaque note à partir des événements, et compte les relâchements « trop tôt ». */
function recorder(bus: NoteBus) {
  const down = new Map<number, number>();
  const events: (NoteEvent & { at: number })[] = [];
  bus.on((e) => {
    events.push({ ...e, at: Date.now() });
    if (e.type === 'noteon') down.set(e.note, Date.now());
    if (e.type === 'noteoff') down.delete(e.note);
  });
  return { down, events };
}

describe('notes à durée fixe', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ne coupe pas une note rejouée avec le minuteur de l'appui précédent", () => {
    const bus = new NoteBus();
    const rec = recorder(bus);
    const n = new TimedNotes(bus, 'test');
    n.play(60, 1, 400);
    vi.advanceTimersByTime(300);
    n.play(60, 1, 400); // rejouée avant la fin de la première
    vi.advanceTimersByTime(150); // l'ancien minuteur (400 ms) est passé
    expect(rec.down.has(60)).toBe(true);
    vi.advanceTimersByTime(300);
    expect(rec.down.has(60)).toBe(false);
  });

  it('la démo ne relâche jamais une note moins de 100 ms après son appui', () => {
    const bus = new NoteBus();
    const rec = recorder(bus);
    const demo = new DemoPlayer(bus);
    demo.start();
    vi.advanceTimersByTime(30_000);
    demo.stop();
    const lastOn = new Map<number, number>();
    let tooShort = 0;
    for (const e of rec.events) {
      if (e.type === 'noteon') lastOn.set(e.note, e.at);
      // Un relâchement suivi d'un nouvel appui au même instant est un rejeu normal, pas un clignotement.
      if (e.type === 'noteoff' && e.at - (lastOn.get(e.note) ?? 0) < 100) {
        const replay = rec.events.some((x) => x.type === 'noteon' && x.note === e.note && x.at === e.at);
        if (!replay) tooShort++;
      }
    }
    expect(tooShort).toBe(0);
    expect(rec.down.size).toBe(0);
  });

  it("la boucle d'aperçu s'arrête proprement, sans note bloquée", () => {
    const bus = new NoteBus();
    const rec = recorder(bus);
    const loop = new PreviewLoop(bus);
    loop.start();
    vi.advanceTimersByTime(12_345);
    loop.stop();
    expect(rec.down.size).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(rec.events.at(-1)?.type).toBe('noteoff');
  });
});
