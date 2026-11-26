/**
 * Modèle géométrique du clavier, dans le « repère piano » normalisé :
 * x = 0 au bord gauche de la touche la plus grave, x = 1 au bord droit de la plus aiguë.
 *
 * Les touches blanches ont toutes la même largeur ; les touches noires sont plus étroites
 * et légèrement décalées comme sur un vrai clavier, pas un découpage en parts égales.
 */

export interface KeyCorrection {
  /** Note MIDI sur laquelle la correction a été posée. */
  note: number;
  /** Décalage horizontal, en largeurs de touche blanche (positif = vers la droite). */
  dx: number;
}

export interface KeyGeometry {
  note: number;
  black: boolean;
  /** Bord gauche, centre et bord droit dans le repère piano [0, 1], corrections comprises. */
  x0: number;
  cx: number;
  x1: number;
}

export interface KeyboardPreset {
  keys: 61 | 76 | 88;
  lowest: number;
  highest: number;
  label: string;
}

export const PRESETS: KeyboardPreset[] = [
  { keys: 61, lowest: 36, highest: 96, label: '61 touches (Do1 – Do6)' },
  { keys: 76, lowest: 28, highest: 103, label: '76 touches (Mi0 – Sol6)' },
  { keys: 88, lowest: 21, highest: 108, label: '88 touches (La-1 – Do7)' },
];

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
/** Décalage du centre de chaque touche noire par rapport à la jonction des deux blanches, en largeurs de blanche. */
const BLACK_OFFSET: Record<number, number> = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
/** Largeur d'une touche noire rapportée à une blanche (≈ 13,7 mm / 23,5 mm). */
export const BLACK_WIDTH_RATIO = 0.58;

export const isBlack = (note: number): boolean => BLACK_PCS.has(((note % 12) + 12) % 12);

const NOTE_NAMES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** Nom français d'une note MIDI (convention française : Do3 = 60). */
export function noteNameFr(note: number): string {
  return `${NOTE_NAMES_FR[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 2}`;
}

export class KeyboardModel {
  readonly lowest: number;
  readonly highest: number;
  readonly whiteCount: number;
  /** Largeur d'une touche blanche dans le repère piano. */
  readonly whiteWidth: number;
  private readonly keys = new Map<number, KeyGeometry>();
  private readonly corrections: KeyCorrection[];

  constructor(lowest: number, highest: number, corrections: KeyCorrection[] = []) {
    if (highest <= lowest) throw new Error(`Plage de notes invalide : ${lowest}–${highest}`);
    this.lowest = lowest;
    this.highest = highest;
    this.corrections = [...corrections].sort((a, b) => a.note - b.note);

    // Indice de chaque touche blanche, de gauche à droite.
    let whiteIndex = 0;
    const whitePos = new Map<number, number>();
    for (let n = lowest; n <= highest; n++) {
      if (!isBlack(n)) whitePos.set(n, whiteIndex++);
    }
    this.whiteCount = whiteIndex;
    // Une touche noire en bord de plage déborde : on garde une demi-blanche de marge.
    const leftPad = isBlack(lowest) ? 0.5 : 0;
    const rightPad = isBlack(highest) ? 0.5 : 0;
    const units = this.whiteCount + leftPad + rightPad;
    const w = 1 / units;
    this.whiteWidth = w;

    // Géométrie brute, sans corrections.
    const raw: Omit<KeyGeometry, 'cx'>[] = [];
    for (let n = lowest; n <= highest; n++) {
      if (!isBlack(n)) {
        const i = whitePos.get(n)!;
        const x0 = (leftPad + i) * w;
        raw.push({ note: n, black: false, x0, x1: x0 + w });
      } else {
        // Jonction entre la blanche inférieure et la suivante.
        const prevWhite = whitePos.get(n - 1);
        const junction = prevWhite !== undefined ? (leftPad + prevWhite + 1) * w : leftPad * w;
        const c = junction + BLACK_OFFSET[((n % 12) + 12) % 12] * w;
        const bw = BLACK_WIDTH_RATIO * w;
        raw.push({ note: n, black: true, x0: c - bw / 2, x1: c + bw / 2 });
      }
    }
    for (const k of raw) {
      const c = (k.x0 + k.x1) / 2;
      const dx = this.correctionAt(c) * w;
      this.keys.set(k.note, { ...k, x0: k.x0 + dx, x1: k.x1 + dx, cx: c + dx });
    }
  }

  get keyCount(): number {
    return this.highest - this.lowest + 1;
  }

  has(note: number): boolean {
    return this.keys.has(note);
  }

  key(note: number): KeyGeometry | undefined {
    return this.keys.get(note);
  }

  all(): KeyGeometry[] {
    return [...this.keys.values()];
  }

  /**
   * Correction interpolée linéairement entre les points posés, constante au-delà du premier et du dernier.
   * Renvoie un décalage en largeurs de blanche.
   */
  correctionAt(x: number): number {
    const pts = this.corrections
      .filter((c) => c.note >= this.lowest && c.note <= this.highest)
      .map((c) => ({ x: this.rawCenterCached(c.note), dx: c.dx }))
      .sort((a, b) => a.x - b.x);
    if (pts.length === 0) return 0;
    if (x <= pts[0].x) return pts[0].dx;
    const last = pts[pts.length - 1];
    if (x >= last.x) return last.dx;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        return a.dx + t * (b.dx - a.dx);
      }
    }
    return 0;
  }

  /** Centres bruts (sans correction), calculés une fois : les corrections s'interpolent entre eux. */
  private centerCache?: Map<number, number>;
  private rawCenterCached(note: number): number {
    if (!this.centerCache) {
      this.centerCache = new Map();
      const plain = new KeyboardModel(this.lowest, this.highest);
      for (const k of plain.all()) this.centerCache.set(k.note, k.cx);
    }
    return this.centerCache.get(note) ?? 0;
  }
}
