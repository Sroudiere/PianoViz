import type { CalibrationProfile } from '../config/settings';
import type { Point } from './homography';

export type CalibrationStep = 'corners' | 'keys';

export interface CalibrationCallbacks {
  /** Le profil a changé (coins ou corrections) : réappliquer et sauvegarder. */
  changed(): void;
  /** Décaler la correction de la dernière touche jouée, en largeurs de blanche. */
  nudgeKey(delta: number): void;
  /** Supprimer la correction de la dernière touche jouée. */
  removeKey(): void;
  resetCorners(): void;
  exit(): void;
}

const CORNER_NAMES = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

/**
 * Écran de calibrage, superposé en coordonnées écran (non déformées).
 * Étape « Coins » : 4 poignées à glisser à la souris, ou au clavier (1–4 puis flèches).
 * Étape « Touches » : jouer une touche, puis ← → pour aligner sa colonne sur la vraie touche.
 */
export class CalibrationOverlay {
  private step: CalibrationStep = 'corners';
  private selected = 0;
  private handles: HTMLDivElement[] = [];
  private outline: SVGPolygonElement;
  private toolbar: HTMLDivElement;
  private info: HTMLDivElement;
  private dragging: number | null = null;
  active = false;

  constructor(
    private root: HTMLElement,
    private getProfile: () => CalibrationProfile,
    private cb: CalibrationCallbacks,
  ) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('calib-svg');
    this.outline = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    svg.appendChild(this.outline);
    root.appendChild(svg);

    for (let i = 0; i < 4; i++) {
      const h = document.createElement('div');
      h.className = 'calib-handle';
      h.title = `Coin ${CORNER_NAMES[i]}`;
      h.textContent = String(i + 1);
      h.addEventListener('pointerdown', (e) => {
        this.dragging = i;
        this.selected = i;
        h.setPointerCapture(e.pointerId);
        this.render();
      });
      h.addEventListener('pointermove', (e) => {
        if (this.dragging !== i) return;
        this.moveCorner(i, { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      });
      h.addEventListener('pointerup', () => (this.dragging = null));
      root.appendChild(h);
      this.handles.push(h);
    }

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'calib-toolbar';
    this.toolbar.innerHTML = `
      <button data-step="corners">1. Coins</button>
      <button data-step="keys">2. Touches</button>
      <button data-act="reset">Réinitialiser les coins</button>
      <button data-act="exit" class="primary">Terminer</button>`;
    this.toolbar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.step) this.setStep(b.dataset.step as CalibrationStep);
      if (b.dataset.act === 'reset') this.cb.resetCorners();
      if (b.dataset.act === 'exit') this.cb.exit();
    });
    root.appendChild(this.toolbar);

    this.info = document.createElement('div');
    this.info.className = 'calib-info';
    root.appendChild(this.info);

    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', () => this.active && this.render());
  }

  open(): void {
    this.active = true;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.active = false;
    this.root.hidden = true;
  }

  setStep(step: CalibrationStep): void {
    this.step = step;
    this.render();
  }

  get currentStep(): CalibrationStep {
    return this.step;
  }

  /** Texte d'aide de l'étape « Touches », mis à jour par l'appli quand une touche est jouée. */
  setKeyInfo(text: string): void {
    if (this.step === 'keys') this.info.innerHTML = text;
  }

  private moveCorner(i: number, p: Point): void {
    const prof = this.getProfile();
    prof.corners[i] = { x: Math.max(-0.5, Math.min(1.5, p.x)), y: Math.max(-0.5, Math.min(1.5, p.y)) };
    this.cb.changed();
    this.render();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const big = e.shiftKey;
    if (e.key === 'Escape') {
      e.preventDefault();
      return this.cb.exit();
    }
    if (this.step === 'corners') {
      if (['1', '2', '3', '4'].includes(e.key)) {
        this.selected = Number(e.key) - 1;
        e.preventDefault();
        return this.render();
      }
      const px = big ? 10 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-px, 0], ArrowRight: [px, 0], ArrowUp: [0, -px], ArrowDown: [0, px] };
      const m = d[e.key];
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      const c = this.getProfile().corners[this.selected];
      this.moveCorner(this.selected, { x: c.x + m[0] / window.innerWidth, y: c.y + m[1] / window.innerHeight });
    } else {
      const step = big ? 0.1 : 0.02;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.cb.nudgeKey(e.key === 'ArrowLeft' ? -step : step);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.cb.removeKey();
      }
    }
  };

  render(): void {
    if (!this.active) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const corners = this.getProfile().corners;
    const showHandles = this.step === 'corners';
    corners.forEach((c, i) => {
      const h = this.handles[i];
      h.style.left = `${c.x * W}px`;
      h.style.top = `${c.y * H}px`;
      h.hidden = !showHandles;
      h.classList.toggle('selected', i === this.selected);
    });
    this.outline.setAttribute('points', corners.map((c) => `${c.x * W},${c.y * H}`).join(' '));
    this.outline.style.display = showHandles ? '' : 'none';
    for (const b of this.toolbar.querySelectorAll<HTMLButtonElement>('button[data-step]')) {
      b.classList.toggle('active', b.dataset.step === this.step);
    }
    if (this.step === 'corners') {
      this.info.innerHTML = `<b>Coins</b> : glisse chaque poignée sur le mur. Bas gauche et bas droit à l'aplomb des bords du clavier,
        vus depuis le tabouret ; haut gauche et haut droit en haut de la zone d'effets.<br>
        Clavier : <kbd>1</kbd>–<kbd>4</kbd> choisit le coin (${CORNER_NAMES[this.selected]}), flèches pour 1 px, <kbd>Maj</kbd> + flèches pour 10 px.`;
    } else {
      this.info.innerHTML = `<b>Touches</b> : assis au tabouret, joue une touche. Si sa colonne n'est pas pile au-dessus,
        <kbd>←</kbd> <kbd>→</kbd> la décale (<kbd>Maj</kbd> pour aller plus vite), <kbd>Suppr</kbd> retire la correction.
        Deux ou trois points (gauche, milieu, droite) suffisent en général.`;
    }
  }
}
