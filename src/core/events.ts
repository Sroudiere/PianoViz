/** Événement de note commun à toutes les sources (piano MIDI, clavier virtuel, démo, fichier .mid plus tard). */
export type NoteEvent =
  | { type: 'noteon'; note: number; velocity: number; time: number; source: string }
  | { type: 'noteoff'; note: number; time: number; source: string }
  | { type: 'sustain'; down: boolean; time: number; source: string }
  | { type: 'program'; program: number; time: number; source: string };

type Listener = (e: NoteEvent) => void;

/** Bus d'événements minimal : les sources publient, les modes visuels et l'interface écoutent. */
export class NoteBus {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(e: NoteEvent): void {
    for (const l of this.listeners) l(e);
  }
}

/** Décode un message MIDI brut. Renvoie null pour les messages ignorés. */
export function decodeMidi(data: ArrayLike<number>, time: number, source: string): NoteEvent | null {
  if (data.length < 2) return null;
  const status = data[0] & 0xf0;
  const d1 = data[1];
  const d2 = data.length > 2 ? data[2] : 0;
  switch (status) {
    case 0x90:
      return d2 > 0
        ? { type: 'noteon', note: d1, velocity: d2 / 127, time, source }
        : { type: 'noteoff', note: d1, time, source };
    case 0x80:
      return { type: 'noteoff', note: d1, time, source };
    case 0xb0:
      return d1 === 64 ? { type: 'sustain', down: d2 >= 64, time, source } : null;
    case 0xc0:
      return { type: 'program', program: d1, time, source };
    default:
      return null;
  }
}
