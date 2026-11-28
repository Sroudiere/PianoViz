import type { NoteBus } from '../core/events';

/**
 * Petit générateur de notes pour voir les visuels sans piano :
 * une basse à gauche et des arpèges à droite, sur une grille d'accords.
 */
const CHORDS = [
  [48, 55, 60, 64, 67, 72],
  [45, 52, 57, 60, 64, 69],
  [41, 48, 53, 57, 60, 65],
  [43, 50, 55, 59, 62, 67],
];

export class DemoPlayer {
  private timer: number | null = null;
  private step = 0;
  private active = new Set<number>();

  constructor(private bus: NoteBus) {}

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.step = 0;
    this.timer = window.setInterval(() => this.tick(), 180);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const n of this.active) this.off(n);
  }

  private tick(): void {
    const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
    const pos = this.step % 16;
    if (pos === 0) {
      this.play(chord[0] - 12, 0.9, 2600);
      this.play(chord[0], 0.6, 2600);
    }
    const arp = [2, 3, 4, 5, 4, 3, 2, 3];
    const note = chord[arp[pos % arp.length]] + (pos >= 8 ? 12 : 0);
    this.play(note, 0.4 + Math.random() * 0.5, 150 + Math.random() * 250);
    this.step++;
  }

  private play(note: number, velocity: number, ms: number): void {
    if (this.active.has(note)) this.off(note);
    this.active.add(note);
    this.bus.emit({ type: 'noteon', note, velocity, time: performance.now(), source: 'démo' });
    window.setTimeout(() => this.active.has(note) && this.off(note), ms);
  }

  private off(note: number): void {
    this.active.delete(note);
    this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: 'démo' });
  }
}

/** Une étape de la boucle d'aperçu : notes jouées ensemble, durée tenue (ms), vélocité. */
type Step = [notes: number[], ms: number, velocity: number];

/**
 * Boucle sans fin sur une octave (Do3 – Do4), pour l'aperçu de l'onglet Visuels :
 * accords tenus, traits rapides et nuances variées, pour montrer chaque réglage.
 */
const OCTAVE_LOOP: Step[] = [
  [[60, 64, 67], 900, 0.85],
  [[72], 180, 0.5],
  [[71], 180, 0.6],
  [[67], 180, 0.45],
  [[64], 420, 0.75],
  [[65, 69], 650, 0.6],
  [[62], 160, 0.95],
  [[64], 160, 0.5],
  [[65], 160, 0.65],
  [[67, 71], 800, 0.8],
  [[69], 130, 1],
  [[67], 130, 0.55],
  [[66], 130, 0.4],
  [[64], 130, 0.6],
  [[63], 130, 0.5],
  [[62], 320, 0.7],
  [[61, 68], 500, 0.6],
  [[60, 64, 67, 72], 1300, 1],
];

export class PreviewLoop {
  private timer: number | null = null;
  private index = 0;
  private offTimers = new Set<number>();
  private active = new Set<number>();

  constructor(private bus: NoteBus) {}

  start(): void {
    if (this.timer !== null) return;
    this.next();
  }

  stop(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const t of this.offTimers) window.clearTimeout(t);
    this.offTimers.clear();
    for (const n of this.active) this.bus.emit({ type: 'noteoff', note: n, time: performance.now(), source: 'aperçu' });
    this.active.clear();
  }

  private next(): void {
    const [notes, ms, velocity] = OCTAVE_LOOP[this.index];
    this.index = (this.index + 1) % OCTAVE_LOOP.length;
    for (const note of notes) {
      if (this.active.has(note)) this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: 'aperçu' });
      this.active.add(note);
      this.bus.emit({ type: 'noteon', note, velocity, time: performance.now(), source: 'aperçu' });
      const t = window.setTimeout(() => {
        this.offTimers.delete(t);
        if (!this.active.delete(note)) return;
        this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: 'aperçu' });
      }, ms * 0.9);
      this.offTimers.add(t);
    }
    const pause = this.index === 0 ? 700 : 40;
    this.timer = window.setTimeout(() => this.next(), ms + pause);
  }
}
