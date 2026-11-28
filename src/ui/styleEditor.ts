import { BUILTIN_PRESETS, cloneStyle, type ColorRef, type VisualStyle } from '../style/style';
import type { Settings } from '../config/settings';
import type { Renderer } from '../visuals/renderer';
import { gradient3, hexToNum, resolve } from '../visuals/colors';
import { button, h, numToHex, opt, row } from './dom';

type LayerId = 'color' | 'note' | 'particles' | 'keyLine' | 'keyGlow' | 'impact' | 'guides' | 'motion';
export type PreviewMode = 'loop' | 'single';

interface Layer {
  id: LayerId;
  label: string;
  /** Chemin du booléen « visible » du calque, s'il en a un. */
  toggle?: string;
  hint: string;
}

const LAYERS: Layer[] = [
  { id: 'color', label: 'Fond et couleurs', hint: 'Couleur du fond et règle qui colore chaque note.' },
  { id: 'note', label: 'Note', toggle: 'note.enabled', hint: 'Forme, remplissage, contour et halo des notes.' },
  { id: 'particles', label: 'Particules', toggle: 'particles.enabled', hint: 'Étincelles, poussière ou fumée.' },
  { id: 'keyLine', label: 'Ligne du clavier', toggle: 'keyLine.enabled', hint: 'Ligne de lueur ondulante au ras des touches.' },
  { id: 'keyGlow', label: 'Lueur des touches', toggle: 'keyGlow.enabled', hint: 'Halo vertical au-dessus des touches tenues.' },
  { id: 'impact', label: 'Éclair d\'impact', toggle: 'impact.enabled', hint: 'Point lumineux là où la note touche le clavier.' },
  { id: 'guides', label: 'Repères', toggle: 'guides.enabled', hint: 'Lignes verticales à chaque Do.' },
  { id: 'motion', label: 'Mouvement', hint: 'Vitesse et charge maximale.' },
];

type Field =
  | { kind: 'range'; path: string; label: string; min: number; max: number; step: number; when?: (s: VisualStyle) => boolean }
  | { kind: 'toggle'; path: string; label: string; when?: (s: VisualStyle) => boolean }
  | { kind: 'select'; path: string; label: string; options: [string, string][]; when?: (s: VisualStyle) => boolean }
  | { kind: 'color'; path: string; label: string; when?: (s: VisualStyle) => boolean }
  | { kind: 'cref'; path: string; label: string; when?: (s: VisualStyle) => boolean }
  | { kind: 'gradient'; path: string; label: string; when?: (s: VisualStyle) => boolean };

const FIELDS: Record<LayerId, Field[]> = {
  color: [
    { kind: 'color', path: 'background', label: 'Fond' },
    {
      kind: 'select',
      path: 'color.mode',
      label: 'Couleur des notes',
      options: [
        ['hands', 'Par main'],
        ['gradient', 'Dégradé le long du clavier'],
        ['single', 'Couleur unique'],
        ['pitch', 'Par note (12 teintes)'],
        ['octave', 'Par octave'],
        ['velocity', 'Par vélocité'],
      ],
    },
    { kind: 'color', path: 'color.left', label: 'Main gauche', when: (s) => s.color.mode === 'hands' },
    { kind: 'color', path: 'color.right', label: 'Main droite', when: (s) => s.color.mode === 'hands' },
    { kind: 'range', path: 'color.splitNote', label: 'Séparation (MIDI, 60 = Do3)', min: 36, max: 84, step: 1, when: (s) => s.color.mode === 'hands' },
    { kind: 'color', path: 'color.single', label: 'Couleur', when: (s) => s.color.mode === 'single' },
    { kind: 'gradient', path: 'color.gradient', label: 'Grave → aigu', when: (s) => s.color.mode === 'gradient' },
    { kind: 'range', path: 'color.velocity', label: 'Effet de la vélocité', min: 0, max: 1, step: 0.05 },
  ],
  note: [
    { kind: 'select', path: 'note.shape', label: 'Forme', options: [['rounded', 'Coins arrondis'], ['capsule', 'Capsule'], ['bevel', 'Cristal (coins coupés)'], ['rect', 'Rectangle']] },
    { kind: 'range', path: 'note.radius', label: 'Arrondi / coupe', min: 0, max: 1, step: 0.05, when: (s) => s.note.shape === 'rounded' || s.note.shape === 'bevel' },
    { kind: 'range', path: 'note.width', label: 'Largeur', min: 0.1, max: 1, step: 0.02 },
    { kind: 'range', path: 'note.minLength', label: 'Longueur minimale', min: 0.2, max: 3, step: 0.1 },
    { kind: 'select', path: 'note.fill.type', label: 'Remplissage', options: [['solid', 'Uni'], ['gradient', 'Dégradé'], ['none', 'Aucun (contour seul)']] },
    { kind: 'cref', path: 'note.fill.top', label: 'Haut', when: (s) => s.note.fill.type === 'gradient' },
    { kind: 'cref', path: 'note.fill.bottom', label: 'Couleur / bas', when: (s) => s.note.fill.type !== 'none' },
    { kind: 'range', path: 'note.fill.opacity', label: 'Opacité', min: 0, max: 1, step: 0.02, when: (s) => s.note.fill.type !== 'none' },
    { kind: 'range', path: 'note.shine', label: 'Reflet de verre', min: 0, max: 1, step: 0.05 },
    { kind: 'toggle', path: 'note.stroke.enabled', label: 'Contour' },
    { kind: 'cref', path: 'note.stroke.color', label: 'Couleur du contour', when: (s) => s.note.stroke.enabled },
    { kind: 'range', path: 'note.stroke.width', label: 'Épaisseur', min: 0.5, max: 8, step: 0.25, when: (s) => s.note.stroke.enabled },
    { kind: 'range', path: 'note.stroke.opacity', label: 'Opacité du contour', min: 0, max: 1, step: 0.05, when: (s) => s.note.stroke.enabled },
    { kind: 'toggle', path: 'note.stroke.neon', label: 'Effet néon (cœur blanc)', when: (s) => s.note.stroke.enabled },
    { kind: 'toggle', path: 'note.glow.enabled', label: 'Halo' },
    { kind: 'range', path: 'note.glow.size', label: 'Taille du halo', min: 0, max: 60, step: 1, when: (s) => s.note.glow.enabled },
    { kind: 'range', path: 'note.glow.intensity', label: 'Intensité du halo', min: 0, max: 1.5, step: 0.05, when: (s) => s.note.glow.enabled },
    { kind: 'range', path: 'note.fadeTop', label: 'Fondu en haut', min: 0, max: 1, step: 0.05 },
  ],
  particles: [
    { kind: 'select', path: 'particles.kind', label: 'Type', options: [['sparks', 'Étincelles'], ['dust', 'Poussière'], ['smoke', 'Fumée']] },
    { kind: 'select', path: 'particles.source', label: 'Sortent de', options: [['key', 'La touche'], ['note', 'La note (traînée)'], ['both', 'Les deux']] },
    { kind: 'cref', path: 'particles.color', label: 'Couleur' },
    { kind: 'range', path: 'particles.rate', label: 'Débit (par seconde)', min: 0, max: 400, step: 5 },
    { kind: 'range', path: 'particles.burst', label: 'Gerbe à l\'attaque', min: 0, max: 150, step: 1 },
    { kind: 'range', path: 'particles.life', label: 'Durée de vie (s)', min: 0.2, max: 5, step: 0.1 },
    { kind: 'range', path: 'particles.speed', label: 'Vitesse', min: 0, max: 1.5, step: 0.02 },
    { kind: 'range', path: 'particles.spread', label: 'Ouverture (°)', min: 0, max: 180, step: 1 },
    { kind: 'range', path: 'particles.gravity', label: 'Gravité (− = monte)', min: -0.6, max: 1, step: 0.01 },
    { kind: 'range', path: 'particles.turbulence', label: 'Turbulence', min: 0, max: 2, step: 0.05 },
    { kind: 'range', path: 'particles.size', label: 'Taille', min: 0.2, max: 4, step: 0.05 },
    { kind: 'range', path: 'particles.stretch', label: 'Étirement', min: 0, max: 2, step: 0.05, when: (s) => s.particles.kind === 'sparks' },
    { kind: 'range', path: 'particles.opacity', label: 'Opacité', min: 0, max: 1, step: 0.02 },
  ],
  keyLine: [
    { kind: 'cref', path: 'keyLine.color', label: 'Couleur' },
    { kind: 'range', path: 'keyLine.thickness', label: 'Épaisseur', min: 0.5, max: 8, step: 0.25 },
    { kind: 'range', path: 'keyLine.waviness', label: 'Ondulation', min: 0, max: 1.5, step: 0.05 },
    { kind: 'range', path: 'keyLine.glow', label: 'Lueur', min: 0, max: 1.5, step: 0.05 },
    { kind: 'range', path: 'keyLine.reactive', label: 'Réaction aux notes', min: 0, max: 1.5, step: 0.05 },
  ],
  keyGlow: [
    { kind: 'range', path: 'keyGlow.height', label: 'Hauteur', min: 0.02, max: 0.8, step: 0.01 },
    { kind: 'range', path: 'keyGlow.intensity', label: 'Intensité', min: 0, max: 1.5, step: 0.05 },
  ],
  impact: [
    { kind: 'range', path: 'impact.size', label: 'Taille', min: 0.2, max: 3, step: 0.05 },
    { kind: 'range', path: 'impact.intensity', label: 'Intensité', min: 0, max: 1.5, step: 0.05 },
  ],
  guides: [
    { kind: 'color', path: 'guides.color', label: 'Couleur' },
    { kind: 'range', path: 'guides.opacity', label: 'Opacité', min: 0, max: 0.6, step: 0.01 },
  ],
  motion: [{ kind: 'range', path: 'motion.riseSpeed', label: 'Vitesse de montée', min: 0.05, max: 1.5, step: 0.05 }],
};

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

function set(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, unknown>;
  parent[last] = value;
}

/**
 * Éditeur de style, façon logiciel graphique :
 * préréglages en haut, calques à gauche (œil pour masquer), inspecteur du calque choisi,
 * aperçu à droite avec deux modes (piano en boucle ou note seule) et, en note seule,
 * poignées à tirer directement sur la note et pastilles de couleur posées dessus.
 */
export class StyleEditor {
  readonly el = h('div', { className: 'style-editor' });
  readonly previewHost = h('div', { className: 'preview-host' });
  private readonly overlay = h('div', { className: 'preview-overlay' });
  private readonly presetBar = h('div', { className: 'presets' });
  private readonly layerList = h('ul', { className: 'layers' });
  private readonly inspector = h('div', { className: 'inspector' });
  private readonly modeButtons = new Map<PreviewMode, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private layer: LayerId = 'note';
  mode: PreviewMode = 'loop';
  private history: string[] = [];
  private future: string[] = [];
  private historyTimer = 0;
  private lastSnapshot = '';
  private renderer: Renderer | null = null;
  private handles: Record<'width' | 'radius' | 'glow', HTMLDivElement>;
  private chips: HTMLDivElement;
  private noteBox = h('div', { className: 'note-box' });
  private chipColor = -1;

  constructor(
    private s: () => Settings,
    private onChange: () => void,
    private onModeChange: (mode: PreviewMode) => void,
  ) {
    this.undoBtn = button('↶ Annuler', () => this.undo(), 'icon');
    this.redoBtn = button('↷ Rétablir', () => this.redo(), 'icon');
    this.undoBtn.title = 'Annuler (Ctrl+Z)';
    this.redoBtn.title = 'Rétablir (Ctrl+Y)';

    const modes = h('div', { className: 'segmented' });
    for (const [m, label] of [['loop', 'Piano en boucle'], ['single', 'Note seule']] as [PreviewMode, string][]) {
      const b = button(label, () => this.setMode(m));
      this.modeButtons.set(m, b);
      modes.append(b);
    }

    this.handles = {
      width: this.makeHandle('width', 'Largeur de la note : glisser', '↔'),
      radius: this.makeHandle('radius', 'Arrondi des coins : glisser', '◜'),
      glow: this.makeHandle('glow', 'Taille du halo : glisser', '✺'),
    };
    this.chips = h('div', { className: 'chips' });
    this.noteBox.addEventListener('pointerdown', () => this.selectLayer('note'));
    this.overlay.append(this.noteBox, this.handles.width, this.handles.radius, this.handles.glow, this.chips);
    this.overlay.addEventListener('pointerdown', (e) => this.pickLayerAt(e));

    const previewWrap = h('div', { className: 'preview-wrap' }, this.previewHost, this.overlay);
    const toolbar = h('div', { className: 'preview-toolbar' }, modes, h('span', { className: 'spacer' }), this.undoBtn, this.redoBtn);
    const side = h('div', { className: 'editor-side' }, h('h2', {}, 'Calques'), this.layerList, this.inspector);
    const main = h(
      'div',
      { className: 'editor-main' },
      toolbar,
      previewWrap,
      h('p', { className: 'hint' }, 'Clique sur une partie de l\'aperçu pour choisir son calque. En « Note seule », tire les poignées ou clique sur les pastilles pour changer les couleurs.'),
    );
    this.el.append(this.presetBar, h('div', { className: 'editor-body' }, side, main));

    window.addEventListener('keydown', (e) => {
      if (!this.el.isConnected || this.el.offsetParent === null) return;
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
    });

    this.lastSnapshot = JSON.stringify(this.s().style);
    this.renderAll();
    this.setMode('loop', false);
  }

  /** Branche le rendu d'aperçu pour placer les poignées sur la note à chaque image. */
  attach(renderer: Renderer): void {
    this.renderer = renderer;
    renderer.onFrame = () => this.placeHandles();
  }

  setMode(mode: PreviewMode, notify = true): void {
    this.mode = mode;
    for (const [m, b] of this.modeButtons) b.classList.toggle('active', m === mode);
    this.overlay.classList.toggle('single', mode === 'single');
    if (notify) this.onModeChange(mode);
  }

  /** Après un import ou un changement externe : tout relire. */
  refresh(): void {
    this.lastSnapshot = JSON.stringify(this.s().style);
    this.renderAll();
  }

  // ---------- Historique ----------

  private changed(rerender = false): void {
    this.onChange();
    if (rerender) this.renderInspector();
    this.renderLayers();
    this.renderChips();
    window.clearTimeout(this.historyTimer);
    this.historyTimer = window.setTimeout(() => this.commit(), 350);
  }

  private commit(): void {
    const snap = JSON.stringify(this.s().style);
    if (snap === this.lastSnapshot) return;
    this.history.push(this.lastSnapshot);
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    this.lastSnapshot = snap;
    this.updateUndo();
  }

  private restore(snap: string): void {
    this.s().style = JSON.parse(snap) as VisualStyle;
    this.lastSnapshot = snap;
    this.onChange();
    this.renderAll();
  }

  private undo(): void {
    this.commit();
    const prev = this.history.pop();
    if (prev === undefined) return;
    this.future.push(this.lastSnapshot);
    this.restore(prev);
  }

  private redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.history.push(this.lastSnapshot);
    this.restore(next);
  }

  private updateUndo(): void {
    this.undoBtn.disabled = this.history.length === 0;
    this.redoBtn.disabled = this.future.length === 0;
  }

  // ---------- Rendu de l'interface ----------

  private renderAll(): void {
    this.renderPresets();
    this.renderLayers();
    this.renderInspector();
    this.renderChips();
    this.updateUndo();
  }

  private swatch(style: VisualStyle): HTMLElement {
    const c = style.color;
    const colors =
      c.mode === 'gradient' ? [...c.gradient] : c.mode === 'hands' ? [c.left, c.right] : c.mode === 'single' ? [c.single, c.single] : ['#ff5c5c', '#ffd24a', '#4ade80', '#3fd0ff', '#a46bff'];
    const sw = h('span', { className: 'swatch' });
    sw.style.background = `linear-gradient(90deg, ${colors.join(', ')})`;
    if (style.note.fill.type === 'none') sw.classList.add('outline');
    return sw;
  }

  private renderPresets(): void {
    const st = this.s();
    const current = JSON.stringify(st.style);
    const card = (p: VisualStyle, user: boolean) => {
      const active = JSON.stringify(p) === current;
      const b = h('button', { type: 'button', className: `preset${active ? ' active' : ''}${user ? ' user' : ''}` }, this.swatch(p), h('span', {}, p.name));
      b.addEventListener('click', () => {
        st.style = cloneStyle(p);
        this.changed();
        this.renderAll();
      });
      return b;
    };
    const save = button('＋ Enregistrer', () => {
      const name = prompt('Nom du préréglage', st.style.name)?.trim();
      if (!name) return;
      st.style.name = name;
      const copy = cloneStyle(st.style);
      const i = st.userPresets.findIndex((p) => p.name === name);
      if (i >= 0) st.userPresets[i] = copy;
      else st.userPresets.push(copy);
      this.changed();
      this.renderPresets();
    }, 'primary');
    const userActive = st.userPresets.findIndex((p) => p.name === st.style.name);
    const del = button('Supprimer', () => {
      if (userActive < 0) return;
      st.userPresets.splice(userActive, 1);
      this.changed();
      this.renderPresets();
    });
    del.disabled = userActive < 0;
    del.title = 'Supprimer le préréglage personnel actif';
    this.presetBar.replaceChildren(
      h('span', { className: 'label' }, 'Préréglages'),
      ...BUILTIN_PRESETS.map((p) => card(p, false)),
      ...st.userPresets.map((p) => card(p, true)),
      h('span', { className: 'spacer' }),
      save,
      del,
    );
  }

  private renderLayers(): void {
    const style = this.s().style;
    this.layerList.replaceChildren(
      ...LAYERS.map((l) => {
        const li = h('li', { className: l.id === this.layer ? 'selected' : '' });
        if (l.toggle) {
          const on = Boolean(get(style, l.toggle));
          const eye = button(on ? '●' : '○', () => {
            set(style, l.toggle!, !on);
            this.changed();
          }, `eye${on ? ' on' : ''}`);
          eye.title = on ? 'Masquer le calque' : 'Afficher le calque';
          li.append(eye);
        } else li.append(h('span', { className: 'eye placeholder' }));
        li.append(h('span', { className: 'name' }, l.label));
        li.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.eye')) return;
          this.selectLayer(l.id);
        });
        return li;
      }),
    );
  }

  selectLayer(id: LayerId): void {
    if (this.layer === id) return;
    this.layer = id;
    this.renderLayers();
    this.renderInspector();
    this.overlay.dataset.layer = id;
  }

  private renderInspector(): void {
    const style = this.s().style;
    const layer = LAYERS.find((l) => l.id === this.layer)!;
    const fields = FIELDS[layer.id].filter((f) => !f.when || f.when(style));
    const extra: HTMLElement[] = [];
    if (layer.id === 'motion') {
      const input = h('input', { type: 'range', min: '200', max: '8000', step: '100', value: String(this.s().performance.maxParticles) });
      const out = h('output', {}, input.value);
      input.addEventListener('input', () => {
        this.s().performance.maxParticles = Number(input.value);
        out.textContent = input.value;
        this.onChange();
      });
      extra.push(row('Particules max (performance)', h('span', { className: 'slider' }, input, out)));
    }
    if (layer.toggle && !get(style, layer.toggle)) {
      extra.unshift(h('p', { className: 'hint warn' }, 'Calque masqué : clique sur ○ pour l\'afficher.'));
    }
    this.inspector.replaceChildren(
      h('h2', {}, layer.label),
      h('p', { className: 'hint' }, layer.hint),
      ...fields.map((f) => this.field(f)),
      ...extra,
    );
  }

  private field(f: Field): HTMLElement {
    const style = this.s().style;
    const v = get(style, f.path);
    switch (f.kind) {
      case 'range': {
        const input = h('input', { type: 'range', min: String(f.min), max: String(f.max), step: String(f.step), value: String(v) });
        const out = h('output', {}, String(v));
        input.addEventListener('input', () => {
          set(style, f.path, Number(input.value));
          out.textContent = input.value;
          this.changed();
        });
        return row(f.label, h('span', { className: 'slider' }, input, out));
      }
      case 'toggle': {
        const input = h('input', { type: 'checkbox', checked: Boolean(v) });
        input.addEventListener('input', () => {
          set(style, f.path, input.checked);
          this.changed(true);
        });
        return row(f.label, input);
      }
      case 'select': {
        const sel = h('select');
        sel.append(...f.options.map(([val, label]) => opt(val, label, val === v)));
        sel.addEventListener('input', () => {
          set(style, f.path, sel.value);
          this.changed(true);
        });
        return row(f.label, sel);
      }
      case 'color': {
        const input = h('input', { type: 'color', value: String(v) });
        input.addEventListener('input', () => {
          set(style, f.path, input.value);
          this.changed();
        });
        return row(f.label, input);
      }
      case 'gradient': {
        const stops = v as [string, string, string];
        const bar = h('div', { className: 'gradient-bar' });
        const paint = () => (bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`);
        paint();
        const inputs = stops.map((c, i) => {
          const input = h('input', { type: 'color', value: c });
          input.addEventListener('input', () => {
            stops[i] = input.value;
            paint();
            this.changed();
          });
          return input;
        });
        return h('div', { className: 'field-block' }, h('span', { className: 'label' }, f.label), bar, h('div', { className: 'gradient-stops' }, ...inputs));
      }
      case 'cref':
        return this.colorRefField(f.label, v as ColorRef);
    }
  }

  /** Couleur de calque : « de la note » ou personnalisée, plus un curseur vers le blanc. */
  private colorRefField(label: string, ref: ColorRef): HTMLElement {
    const seg = h('div', { className: 'segmented small' });
    const noteBtn = button('Note', () => {
      ref.ref = 'note';
      this.changed(true);
    });
    const customBtn = button('Perso', () => {
      ref.ref = 'custom';
      this.changed(true);
    });
    noteBtn.classList.toggle('active', ref.ref === 'note');
    customBtn.classList.toggle('active', ref.ref === 'custom');
    seg.append(noteBtn, customBtn);
    const color = h('input', { type: 'color', value: ref.hex });
    color.hidden = ref.ref !== 'custom';
    color.addEventListener('input', () => {
      ref.hex = color.value;
      this.changed();
    });
    const white = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(ref.white) });
    const out = h('output', {}, String(ref.white));
    white.addEventListener('input', () => {
      ref.white = Number(white.value);
      out.textContent = white.value;
      this.changed();
    });
    return h(
      'div',
      { className: 'field-block' },
      h('div', { className: 'row' }, h('span', { className: 'label' }, label), seg, color),
      row('↳ vers le blanc', h('span', { className: 'slider' }, white, out)),
    );
  }

  // ---------- Manipulation directe sur l'aperçu ----------

  private makeHandle(kind: 'width' | 'radius' | 'glow', title: string, glyph: string): HTMLDivElement {
    const el = h('div', { className: `handle handle-${kind}`, title }, glyph);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      this.selectLayer('note');
      const move = (ev: PointerEvent) => this.dragHandle(kind, ev);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        this.renderInspector();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    return el;
  }

  private staticSprite() {
    return this.renderer?.notes.sprites[0] ?? null;
  }

  private dragHandle(kind: 'width' | 'radius' | 'glow', ev: PointerEvent): void {
    const sp = this.staticSprite();
    const r = this.renderer;
    if (!sp || !r) return;
    const box = this.overlay.getBoundingClientRect();
    const x = ev.clientX - box.left;
    const key = r.keyboard.key(sp.note);
    if (!key) return;
    const kw = (key.x1 - key.x0) * r.zone.width;
    const n = this.s().style.note;
    if (kind === 'width') n.width = Math.round(Math.max(0.1, Math.min(1, (2 * Math.abs(x - sp.cx)) / kw)) * 50) / 50;
    if (kind === 'radius') {
      const right = sp.cx + sp.w / 2;
      n.radius = Math.round(Math.max(0, Math.min(1, (right - x) / (sp.w / 2))) * 20) / 20;
      if (n.shape === 'rect' || n.shape === 'capsule') n.shape = 'rounded';
    }
    if (kind === 'glow') {
      n.glow.enabled = true;
      n.glow.size = Math.round(Math.max(0, Math.min(60, x - (sp.cx + sp.w / 2))));
    }
    this.changed();
  }

  /** Clic sur l'aperçu : choisit le calque sous le pointeur. */
  private pickLayerAt(e: PointerEvent): void {
    const r = this.renderer;
    if (!r || (e.target as HTMLElement).closest('.handle, .chips')) return;
    const box = this.overlay.getBoundingClientRect();
    const y = e.clientY - box.top;
    const x = e.clientX - box.left;
    const zone = r.zone;
    if (y > zone.height) return;
    if (y > zone.height - 18) return this.selectLayer(this.s().style.keyLine.enabled ? 'keyLine' : 'keyGlow');
    const hit = r.notes.sprites.find((s) => x >= s.cx - s.w / 2 - 6 && x <= s.cx + s.w / 2 + 6 && y >= s.yTop - 6 && y <= s.yBottom + 6);
    if (hit) return this.selectLayer('note');
    this.selectLayer('particles');
  }

  private placeHandles(): void {
    const single = this.mode === 'single';
    const sp = single ? this.staticSprite() : null;
    for (const el of [this.handles.width, this.handles.radius, this.handles.glow, this.chips, this.noteBox]) el.hidden = !sp;
    if (!sp) return;
    if (sp.color !== this.chipColor) {
      this.chipColor = sp.color;
      this.renderChips();
    }
    const n = this.s().style.note;
    const left = sp.cx - sp.w / 2;
    const right = sp.cx + sp.w / 2;
    const midY = (sp.yTop + sp.yBottom) / 2;
    const r = Math.min(n.radius * (sp.w / 2), (sp.yBottom - sp.yTop) / 2);
    const place = (el: HTMLElement, x: number, y: number) => (el.style.transform = `translate(${x}px, ${y}px)`);
    place(this.handles.width, right, midY);
    place(this.handles.radius, right - (n.shape === 'capsule' ? sp.w / 2 : n.shape === 'rect' ? 0 : r), sp.yTop);
    place(this.handles.glow, right + (n.glow.enabled ? n.glow.size : 0) + 22, midY + 34);
    place(this.chips, sp.cx, sp.yTop - 14);
    Object.assign(this.noteBox.style, { left: `${left}px`, top: `${sp.yTop}px`, width: `${sp.w}px`, height: `${sp.yBottom - sp.yTop}px` });
    this.noteBox.classList.toggle('selected', this.layer === 'note');
  }

  /** Pastilles posées au-dessus de la note : un clic ouvre le sélecteur de couleur. */
  private renderChips(): void {
    const n = this.s().style.note;
    const sp = this.staticSprite();
    const noteCol = sp?.color ?? hexToNum(this.s().style.color.single);
    const chip = (label: string, ref: ColorRef, enabled: boolean) => {
      const input = h('input', { type: 'color', value: numToHex(resolve({ ...ref, white: 0 }, noteCol)) });
      input.title = `${label} : choisir une couleur`;
      input.addEventListener('input', () => {
        ref.ref = 'custom';
        ref.hex = input.value;
        this.changed(true);
      });
      const reset = button('↺', () => {
        ref.ref = 'note';
        this.changed(true);
      }, 'mini');
      reset.title = 'Revenir à la couleur de la note';
      reset.hidden = ref.ref === 'note';
      const wrap = h('label', { className: `chip${enabled ? '' : ' off'}` }, input, h('span', {}, label), reset);
      return wrap;
    };
    const items: HTMLElement[] = [];
    if (n.fill.type === 'gradient') items.push(chip('Haut', n.fill.top, true));
    if (n.fill.type !== 'none') items.push(chip(n.fill.type === 'gradient' ? 'Bas' : 'Fond', n.fill.bottom, true));
    items.push(chip('Contour', n.stroke.color, n.stroke.enabled));
    if (this.s().style.particles.enabled) items.push(chip('Particules', this.s().style.particles.color, true));
    this.chips.replaceChildren(...items);
  }
}

/** Couleur d'aperçu d'un dégradé, pour d'éventuelles vignettes. */
export const gradientPreview = (stops: [string, string, string], t: number) => numToHex(gradient3(stops, t));
