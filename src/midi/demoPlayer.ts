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
