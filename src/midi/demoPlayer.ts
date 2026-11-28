import type { NoteBus } from '../core/events';

/**
 * Joue des notes de durée fixe sur un bus, sans jamais couper une note par erreur.
 *
 * Chaque appui reçoit un numéro : le relâchement programmé ne s'applique que s'il
 * correspond toujours au dernier appui de cette note. Sans cela, une note rejouée
 * avant la fin de la précédente était coupée par l'ancien minuteur, et la touche
 * clignotait (allumée, éteinte presque aussitôt).
 */
export class TimedNotes {
  private generation = new Map<number, number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private counter = 0;

  constructor(private bus: NoteBus, private source: string) {}

  /** Notes en cours (pour les tests et l'arrêt). */
  get active(): number[] {
    return [...this.generation.keys()];
  }

  play(note: number, velocity: number, ms: number): void {
    if (this.generation.has(note)) this.emitOff(note);
    const id = ++this.counter;
    this.generation.set(note, id);
    this.bus.emit({ type: 'noteon', note, velocity, time: performance.now(), source: this.source });
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.generation.get(note) === id) this.release(note);
    }, ms);
    this.timers.add(t);
  }

  release(note: number): void {
    if (!this.generation.delete(note)) return;
    this.emitOff(note);
  }

  stopAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const note of [...this.generation.keys()]) this.release(note);
  }

  private emitOff(note: number): void {
    this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: this.source });
  }
}

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
const ARPEGGIO = [2, 3, 4, 5, 4, 3, 2, 3];

export class DemoPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private notes: TimedNotes;

  constructor(bus: NoteBus) {
    this.notes = new TimedNotes(bus, 'démo');
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.step = 0;
    this.timer = setInterval(() => this.tick(), 180);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.notes.stopAll();
  }

  private tick(): void {
    const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
    const pos = this.step % 16;
    if (pos === 0) {
      this.notes.play(chord[0] - 12, 0.9, 2600);
      this.notes.play(chord[0], 0.6, 2600);
    }
    const note = chord[ARPEGGIO[pos % ARPEGGIO.length]] + (pos >= 8 ? 12 : 0);
    this.notes.play(note, 0.4 + Math.random() * 0.5, 150 + Math.random() * 250);
    this.step++;
  }
}

/** Une étape de la boucle d'aperçu : notes jouées ensemble, durée tenue (ms), vélocité. */
type Step = [notes: number[], ms: number, velocity: number];

/**
 * Boucle sans fin sur une octave (Do3 – Do4), pour l'aperçu de l'onglet Visuels :
 * accords tenus, traits rapides et nuances variées, pour montrer chaque réglage.
 */
export const OCTAVE_LOOP: Step[] = [
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
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private notes: TimedNotes;

  constructor(bus: NoteBus) {
    this.notes = new TimedNotes(bus, 'aperçu');
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.index = 0;
    this.next();
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.notes.stopAll();
  }

  private next(): void {
    const [notes, ms, velocity] = OCTAVE_LOOP[this.index];
    this.index = (this.index + 1) % OCTAVE_LOOP.length;
    // Relâchement un peu avant l'étape suivante : chaque note se détache visiblement.
    for (const note of notes) this.notes.play(note, velocity, ms * 0.9);
    const pause = this.index === 0 ? 700 : 40;
    this.timer = setTimeout(() => this.next(), ms + pause);
  }
}
