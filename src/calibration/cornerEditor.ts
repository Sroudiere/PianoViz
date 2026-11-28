import type { CalibrationProfile } from '../config/settings';
import { isConvex, type Point, type Quad } from './homography';

export const CORNER_NAMES = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

/**
 * Poignées des 4 coins, en coordonnées écran (non déformées).
 * Souris : glisser une poignée. Clavier : 1–4 choisit le coin, flèches = 1 px, Maj + flèches = 10 px.
 */
export class CornerEditor {
  private handles: HTMLDivElement[] = [];
  private outline: SVGPolygonElement;
  private svg: SVGSVGElement;
  private warning = document.createElement('div');
  private dragging: number | null = null;
  private selected = 3;
  active = false;
  onSelect: ((index: number) => void) | null = null;

  constructor(
    private root: HTMLElement,
    private getProfile: () => CalibrationProfile,
    private changed: () => void,
  ) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('calib-svg');
    this.outline = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    svg.appendChild(this.outline);
    root.appendChild(svg);
    this.svg = svg;
    this.warning.className = 'calib-warning';
    this.warning.textContent = 'Coins croisés : l\'image ne peut pas être déformée ainsi. Remets les coins dans l\'ordre 1 haut gauche, 2 haut droit, 3 bas droit, 4 bas gauche.';
    this.warning.hidden = true;
    root.appendChild(this.warning);

    for (let i = 0; i < 4; i++) {
      const h = document.createElement('div');
      h.className = 'calib-handle';
      h.dataset.help = `Coin ${CORNER_NAMES[i]} : glisse-le sur le mur, ou appuie sur ${i + 1} puis utilise les flèches.`;
      h.textContent = String(i + 1);
      h.addEventListener('pointerdown', (e) => {
        this.dragging = i;
        this.select(i);
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener('pointermove', (e) => {
        if (this.dragging === i) this.move(i, { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      });
      h.addEventListener('pointerup', () => (this.dragging = null));
      h.addEventListener('pointercancel', () => (this.dragging = null));
      root.appendChild(h);
      this.handles.push(h);
    }
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', () => this.render());
  }

  get selectedCorner(): number {
    return this.selected;
  }

  setActive(on: boolean): void {
    this.active = on;
    this.root.hidden = !on;
    this.render();
  }

  private select(i: number): void {
    this.selected = i;
    this.render();
    this.onSelect?.(i);
  }

  private move(i: number, p: Point): void {
    this.getProfile().corners[i] = { x: Math.max(-0.5, Math.min(1.5, p.x)), y: Math.max(-0.5, Math.min(1.5, p.y)) };
    this.changed();
    this.render();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      return this.select(Number(e.key) - 1);
    }
    const px = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-px, 0], ArrowRight: [px, 0], ArrowUp: [0, -px], ArrowDown: [0, px] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    const c = this.getProfile().corners[this.selected];
    this.move(this.selected, { x: c.x + m[0] / window.innerWidth, y: c.y + m[1] / window.innerHeight });
  };

  render(): void {
    if (!this.active) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const corners = this.getProfile().corners;
    corners.forEach((c, i) => {
      const h = this.handles[i];
      h.style.left = `${c.x * W}px`;
      h.style.top = `${c.y * H}px`;
      h.classList.toggle('selected', i === this.selected);
    });
    this.outline.setAttribute('points', corners.map((c) => `${c.x * W},${c.y * H}`).join(' '));
    // Quadrilatère croisé (non convexe) : la déformation est refusée, on le signale en rouge.
    const bad = !isConvex(corners.map((c) => ({ x: c.x * W, y: c.y * H })) as Quad);
    this.svg.classList.toggle('invalid', bad);
    this.warning.hidden = !bad;
  }
}
