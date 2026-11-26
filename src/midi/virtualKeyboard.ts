import type { NoteBus } from '../core/events';

/**
 * Clavier virtuel pour tester sans piano : deux rangées de touches de l'ordinateur
 * jouent une octave et demie, Z / X changent d'octave, Espace fait la pédale.
 * Disposition par code physique (marche en AZERTY comme en QWERTY).
 */
const LAYOUT: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

export class VirtualKeyboard {
  private base = 60;
  private held = new Map<string, number>();
  enabled = true;

  constructor(private bus: NoteBus) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.releaseAll);
  }

  get octaveBase(): number {
    return this.base;
  }

  private down = (e: KeyboardEvent): void => {
    if (!this.enabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'KeyZ') return void (this.base = Math.max(12, this.base - 12));
    if (e.code === 'KeyX') return void (this.base = Math.min(108, this.base + 12));
    if (e.code === 'Space') {
      e.preventDefault();
      return this.bus.emit({ type: 'sustain', down: true, time: performance.now(), source: 'virtuel' });
    }
    const offset = LAYOUT[e.code];
    if (offset === undefined || this.held.has(e.code)) return;
    const note = this.base + offset;
    this.held.set(e.code, note);
    const velocity = e.shiftKey ? 1 : 0.7;
    this.bus.emit({ type: 'noteon', note, velocity, time: performance.now(), source: 'virtuel' });
  };

  private up = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      return this.bus.emit({ type: 'sustain', down: false, time: performance.now(), source: 'virtuel' });
    }
    const note = this.held.get(e.code);
    if (note === undefined) return;
    this.held.delete(e.code);
    this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: 'virtuel' });
  };

  private releaseAll = (): void => {
    for (const note of this.held.values()) {
      this.bus.emit({ type: 'noteoff', note, time: performance.now(), source: 'virtuel' });
    }
    this.held.clear();
  };
}
