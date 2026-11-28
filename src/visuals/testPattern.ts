import { Container, Graphics, Text } from 'pixi.js';
import { noteNameFr, type KeyboardModel } from '../core/keyboardModel';

/**
 * Mire de calibrage, dessinée dans le repère piano : cadre de la zone, croix au centre,
 * grille des touches au bas de la zone avec le nom des Do, et touche jouée en surbrillance.
 */
export class TestPattern {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private highlighted: number | null = null;

  constructor() {
    this.container.addChild(this.g, this.labels);
    this.container.visible = false;
  }

  highlight(note: number | null): void {
    this.highlighted = note;
  }

  draw(W: number, H: number, model: KeyboardModel): void {
    const g = this.g;
    g.clear();
    for (const child of this.labels.removeChildren()) child.destroy();
    const line = { width: 2, color: 0xffffff, alpha: 0.9 };

    // Cadre et croix centrale.
    g.rect(1, 1, W - 2, H - 2).stroke(line);
    g.moveTo(W / 2 - 30, H / 2).lineTo(W / 2 + 30, H / 2).stroke(line);
    g.moveTo(W / 2, H / 2 - 30).lineTo(W / 2, H / 2 + 30).stroke(line);
    // Lignes horizontales tous les quarts de hauteur, pour juger la perspective.
    for (let i = 1; i < 4; i++) g.moveTo(0, (H * i) / 4).lineTo(W, (H * i) / 4).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });

    const keyH = H * 0.18;
    const blackH = keyH * 0.62;
    for (const k of model.all()) {
      const x = k.x0 * W;
      const w = (k.x1 - k.x0) * W;
      const lit = k.note === this.highlighted;
      if (!k.black) {
        g.rect(x, H - keyH, w, keyH).fill({ color: lit ? 0xffd24a : 0x202020 }).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
        // Colonne verticale fine au centre de chaque blanche, pour viser au-dessus des touches réelles.
        g.moveTo(k.cx * W, 0).lineTo(k.cx * W, H - keyH).stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
      }
    }
    for (const k of model.all()) {
      if (!k.black) continue;
      const lit = k.note === this.highlighted;
      g.rect(k.x0 * W, H - keyH, (k.x1 - k.x0) * W, blackH).fill({ color: lit ? 0xffd24a : 0x9a9a9a });
    }
    if (this.highlighted !== null) {
      const k = model.key(this.highlighted);
      if (k) g.rect(k.x0 * W, 0, (k.x1 - k.x0) * W, H - keyH).fill({ color: 0xffd24a, alpha: 0.25 });
    }

    const fontSize = Math.max(10, Math.min(18, model.whiteWidth * W * 0.55));
    for (const k of model.all()) {
      if (k.note % 12 !== 0) continue;
      const t = new Text({ text: noteNameFr(k.note), style: { fill: 0xffffff, fontSize, fontFamily: 'system-ui, sans-serif' } });
      t.anchor.set(0.5, 1);
      t.position.set(k.cx * W, H - keyH - 4);
      this.labels.addChild(t);
    }
  }
}
