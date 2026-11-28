import { decodeMidi, type NoteBus } from '../core/events';

export interface MidiDeviceInfo {
  id: string;
  name: string;
}

export type MidiStatus =
  | { kind: 'unsupported' }
  | { kind: 'denied'; message: string }
  | { kind: 'ready'; devices: MidiDeviceInfo[] };

/**
 * Connexion Web MIDI. Écoute l'entrée choisie, ou toutes les entrées si aucune n'est choisie,
 * et suit les branchements et débranchements à chaud.
 */
export class MidiInput {
  private access: MIDIAccess | null = null;
  private selectedId: string | null = null;
  private statusListeners = new Set<(s: MidiStatus) => void>();
  status: MidiStatus = { kind: 'unsupported' };

  constructor(private bus: NoteBus) {}

  async start(selectedId: string | null): Promise<MidiStatus> {
    this.selectedId = selectedId;
    if (!('requestMIDIAccess' in navigator)) {
      this.setStatus({ kind: 'unsupported' });
      return this.status;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.bind();
      this.bind();
    } catch (err) {
      this.setStatus({ kind: 'denied', message: err instanceof Error ? err.message : String(err) });
    }
    return this.status;
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.bind();
  }

  onStatus(l: (s: MidiStatus) => void): () => void {
    this.statusListeners.add(l);
    l(this.status);
    return () => this.statusListeners.delete(l);
  }

  private bind(): void {
    if (!this.access) return;
    const devices: MidiDeviceInfo[] = [];
    this.access.inputs.forEach((input) => devices.push({ id: input.id, name: input.name ?? input.id }));
    // Entrée choisie débranchée : on écoute toutes les entrées plutôt que de rester sourd.
    const selectedPresent = this.selectedId !== null && devices.some((d) => d.id === this.selectedId);
    this.access.inputs.forEach((input) => {
      const listen = !selectedPresent || this.selectedId === input.id;
      input.onmidimessage = listen
        ? (msg: MIDIMessageEvent) => {
            if (!msg.data) return;
            const e = decodeMidi(msg.data, msg.timeStamp, input.name ?? 'midi');
            if (e) this.bus.emit(e);
          }
        : null;
    });
    this.setStatus({ kind: 'ready', devices });
  }

  private setStatus(s: MidiStatus): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }
}
