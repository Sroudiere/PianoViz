import { BUILTIN_PRESETS, cloneStyle, type ColorRef, type VisualStyle } from '../style/style';
import type { Settings } from '../config/settings';
import type { Renderer } from '../visuals/renderer';
import { hexToNum, resolve } from '../visuals/colors';
import { button, h, nameEntry, numToHex, opt, row } from './dom';
import { help } from './tooltip';

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
  { id: 'color', label: 'Fond et couleurs', hint: 'La couleur du fond et la règle qui donne sa couleur à chaque note.' },
  { id: 'note', label: 'Note', toggle: 'note.enabled', hint: 'Le rectangle de chaque note : forme, remplissage, contour et halo.' },
  { id: 'particles', label: 'Particules', toggle: 'particles.enabled', hint: 'Étincelles, poussière ou fumée qui jaillissent des touches ou suivent les notes.' },
  { id: 'keyLine', label: 'Ligne du clavier', toggle: 'keyLine.enabled', hint: 'La ligne lumineuse au ras des touches, qui ondule et s\'embrase quand on joue.' },
  { id: 'keyGlow', label: 'Lueur des touches', toggle: 'keyGlow.enabled', hint: 'Une colonne de lumière douce au-dessus de chaque touche tenue.' },
  { id: 'impact', label: 'Éclair d\'impact', toggle: 'impact.enabled', hint: 'Un éclat lumineux là où la note touche le clavier, plus fort au moment de l\'appui.' },
  { id: 'guides', label: 'Repères', toggle: 'guides.enabled', hint: 'De fines lignes verticales à chaque Do, pour se repérer dans les octaves.' },
  { id: 'motion', label: 'Mouvement et performance', hint: 'La vitesse des notes et la charge maximale de calcul.' },
];

type When = (s: VisualStyle) => boolean;
type Field = { path: string; label: string; help: string; when?: When } & (
  | { kind: 'range'; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle' }
  | { kind: 'select'; options: [string, string][] }
  | { kind: 'color' }
  | { kind: 'cref' }
  | { kind: 'gradient' }
);

const FIELDS: Record<LayerId, Field[]> = {
  color: [
    { kind: 'color', path: 'background', label: 'Couleur du fond', help: 'Couleur derrière les effets. Garde du noir pur en projection : toute autre couleur éclaire le mur.' },
    {
      kind: 'select',
      path: 'color.mode',
      label: 'Couleur des notes',
      help: 'Comment chaque note reçoit sa couleur : selon la main (grave / aigu), un dégradé du grave à l\'aigu, une couleur unique, la note (12 teintes), l\'octave ou la force de frappe.',
      options: [
        ['hands', 'Selon la main'],
        ['gradient', 'Dégradé du grave à l\'aigu'],
        ['single', 'Couleur unique'],
        ['pitch', 'Selon la note (12 teintes)'],
        ['octave', 'Selon l\'octave'],
        ['velocity', 'Selon la force de frappe'],
      ],
    },
    { kind: 'color', path: 'color.left', label: 'Main gauche', help: 'Couleur des notes plus graves que la note de séparation.', when: (s) => s.color.mode === 'hands' },
    { kind: 'color', path: 'color.right', label: 'Main droite', help: 'Couleur des notes égales ou plus aiguës que la note de séparation.', when: (s) => s.color.mode === 'hands' },
    { kind: 'range', path: 'color.splitNote', label: 'Note de séparation des mains', help: 'Numéro MIDI de la première note « main droite ». 60 = Do3 (do du milieu du clavier).', min: 36, max: 84, step: 1, when: (s) => s.color.mode === 'hands' },
    { kind: 'color', path: 'color.single', label: 'Couleur des notes', help: 'La couleur commune à toutes les notes.', when: (s) => s.color.mode === 'single' },
    { kind: 'gradient', path: 'color.gradient', label: 'Dégradé du grave à l\'aigu', help: 'Trois couleurs : la note la plus grave du clavier, le milieu, la plus aiguë. Les notes entre les deux prennent la couleur intermédiaire.', when: (s) => s.color.mode === 'gradient' },
    { kind: 'range', path: 'color.velocity', label: 'Nuance selon la force', help: 'À 0, toutes les notes ont la même luminosité. Plus la valeur est haute, plus une note jouée doucement est sombre.', min: 0, max: 1, step: 0.05 },
  ],
  note: [
    { kind: 'select', path: 'note.shape', label: 'Forme', help: 'Coins arrondis, capsule (bouts entièrement ronds), cristal (coins coupés en biseau) ou rectangle net.', options: [['rounded', 'Coins arrondis'], ['capsule', 'Capsule'], ['bevel', 'Cristal (coins coupés)'], ['rect', 'Rectangle']] },
    { kind: 'range', path: 'note.radius', label: 'Arrondi des coins', help: 'Taille de l\'arrondi (ou de la coupe pour la forme cristal), de 0 (angle droit) à 1 (demi-cercle).', min: 0, max: 1, step: 0.05, when: (s) => s.note.shape === 'rounded' || s.note.shape === 'bevel' },
    { kind: 'range', path: 'note.width', label: 'Largeur', help: 'Largeur de la note par rapport à sa touche : 1 = toute la largeur de la touche.', min: 0.1, max: 1, step: 0.02 },
    { kind: 'range', path: 'note.minLength', label: 'Longueur d\'une note brève', help: 'Longueur minimale d\'une note très courte, en largeurs de note. Une note relâchée très vite continue de sortir du clavier jusqu\'à cette longueur.', min: 0.2, max: 3, step: 0.1 },
    { kind: 'select', path: 'note.fill.type', label: 'Remplissage', help: 'Uni : une seule couleur. Dégradé : du haut vers le bas de la note. Aucun : seul le contour est dessiné (effet néon).', options: [['solid', 'Uni'], ['gradient', 'Dégradé haut → bas'], ['none', 'Aucun (contour seul)']] },
    { kind: 'cref', path: 'note.fill.top', label: 'Couleur du haut', help: 'Couleur en haut de la note.', when: (s) => s.note.fill.type === 'gradient' },
    { kind: 'cref', path: 'note.fill.bottom', label: 'Couleur du remplissage', help: 'Couleur de la note (en bas de la note pour un dégradé).', when: (s) => s.note.fill.type !== 'none' },
    { kind: 'range', path: 'note.fill.opacity', label: 'Opacité du remplissage', help: 'À 1 la note est pleine ; plus bas, elle devient translucide comme du verre.', min: 0, max: 1, step: 0.02, when: (s) => s.note.fill.type !== 'none' },
    { kind: 'range', path: 'note.shine', label: 'Reflet de verre', help: 'Intensité de la bande claire verticale sur le côté de la note, qui donne un aspect brillant.', min: 0, max: 1, step: 0.05 },
    { kind: 'toggle', path: 'note.stroke.enabled', label: 'Contour', help: 'Dessine un trait autour de la note.' },
    { kind: 'cref', path: 'note.stroke.color', label: 'Couleur du contour', help: 'Couleur du trait autour de la note.', when: (s) => s.note.stroke.enabled },
    { kind: 'range', path: 'note.stroke.width', label: 'Épaisseur du contour', help: 'Épaisseur du trait, en pixels.', min: 0.5, max: 8, step: 0.25, unit: 'px', when: (s) => s.note.stroke.enabled },
    { kind: 'range', path: 'note.stroke.opacity', label: 'Opacité du contour', help: 'À 1 le trait est plein, plus bas il s\'efface.', min: 0, max: 1, step: 0.05, when: (s) => s.note.stroke.enabled },
    { kind: 'toggle', path: 'note.stroke.neon', label: 'Effet néon', help: 'Ajoute un fin cœur blanc au milieu du contour, comme un tube néon allumé.', when: (s) => s.note.stroke.enabled },
    { kind: 'toggle', path: 'note.glow.enabled', label: 'Halo', help: 'Une lueur floue autour de la note. C\'est l\'effet le plus coûteux : à couper en premier si l\'image saccade.' },
    { kind: 'range', path: 'note.glow.size', label: 'Taille du halo', help: 'Distance sur laquelle la lueur s\'étale autour de la note, en pixels.', min: 0, max: 60, step: 1, unit: 'px', when: (s) => s.note.glow.enabled },
    { kind: 'range', path: 'note.glow.intensity', label: 'Intensité du halo', help: 'Luminosité de la lueur.', min: 0, max: 1.5, step: 0.05, when: (s) => s.note.glow.enabled },
    { kind: 'range', path: 'note.fadeTop', label: 'Disparition en haut', help: 'Où les notes commencent à s\'effacer en montant : 0 = elles restent nettes jusqu\'en haut, 1 = elles s\'effacent dès la moitié.', min: 0, max: 1, step: 0.05 },
  ],
  particles: [
    { kind: 'select', path: 'particles.kind', label: 'Type', help: 'Étincelles : rapides, étirées, elles retombent. Poussière : fins points qui tourbillonnent. Fumée : grosses bouffées douces.', options: [['sparks', 'Étincelles'], ['dust', 'Poussière'], ['smoke', 'Fumée']] },
    { kind: 'select', path: 'particles.source', label: 'Point de départ', help: 'La touche : les particules jaillissent du clavier tant que la note est tenue. La note : elles s\'échappent du rectangle qui monte et laissent une traînée. Les deux : mélange des deux.', options: [['key', 'La touche'], ['note', 'La note (traînée)'], ['both', 'Les deux']] },
    { kind: 'cref', path: 'particles.color', label: 'Couleur', help: 'Couleur des particules.' },
    { kind: 'range', path: 'particles.rate', label: 'Particules par seconde', help: 'Nombre de particules émises chaque seconde par note tenue (ou par note en vol pour une traînée).', min: 0, max: 400, step: 5, unit: '/s' },
    { kind: 'range', path: 'particles.burst', label: 'Jaillissement à l\'appui', help: 'Nombre de particules lancées d\'un coup au moment où la touche est enfoncée. Plus fort si on joue fort.', min: 0, max: 150, step: 1 },
    { kind: 'range', path: 'particles.life', label: 'Durée de vie', help: 'Temps en secondes avant qu\'une particule s\'éteigne. Plus long = elles montent plus haut et s\'accumulent.', min: 0.2, max: 5, step: 0.1, unit: 's' },
    { kind: 'range', path: 'particles.speed', label: 'Vitesse de départ', help: 'Force avec laquelle les particules sont lancées vers le haut.', min: 0, max: 1.5, step: 0.02 },
    { kind: 'range', path: 'particles.spread', label: 'Ouverture du jet', help: 'Angle du jet en degrés autour de la verticale : 0 = tout droit, 90 = en éventail jusqu\'à l\'horizontale.', min: 0, max: 180, step: 1, unit: '°' },
    { kind: 'range', path: 'particles.gravity', label: 'Gravité', help: 'Positive : les particules ralentissent puis retombent. Négative : elles s\'élèvent comme de la fumée chaude.', min: -0.6, max: 1, step: 0.01 },
    { kind: 'range', path: 'particles.turbulence', label: 'Tourbillons', help: 'Agitation de l\'air : à 0 les trajectoires sont droites, plus haut elles ondulent et tourbillonnent.', min: 0, max: 2, step: 0.05 },
    { kind: 'range', path: 'particles.size', label: 'Taille', help: 'Taille des particules.', min: 0.2, max: 4, step: 0.05 },
    { kind: 'range', path: 'particles.stretch', label: 'Étirement des étincelles', help: 'Allonge chaque étincelle dans le sens de sa course, comme un trait de lumière.', min: 0, max: 2, step: 0.05, when: (s) => s.particles.kind === 'sparks' },
    { kind: 'range', path: 'particles.opacity', label: 'Opacité', help: 'Luminosité générale des particules.', min: 0, max: 1, step: 0.02 },
  ],
  keyLine: [
    { kind: 'cref', path: 'keyLine.color', label: 'Couleur', help: 'Couleur de la ligne. « Couleur de la note » suit la couleur des notes le long du clavier.' },
    { kind: 'range', path: 'keyLine.thickness', label: 'Épaisseur', help: 'Épaisseur du trait lumineux, en pixels.', min: 0.5, max: 8, step: 0.25, unit: 'px' },
    { kind: 'range', path: 'keyLine.waviness', label: 'Ondulation', help: 'Amplitude des vagues qui parcourent la ligne en permanence. 0 = ligne droite.', min: 0, max: 1.5, step: 0.05 },
    { kind: 'range', path: 'keyLine.glow', label: 'Lueur', help: 'Intensité du halo flou autour de la ligne.', min: 0, max: 1.5, step: 0.05 },
    { kind: 'range', path: 'keyLine.reactive', label: 'Embrasement au jeu', help: 'À quel point la ligne s\'illumine et s\'agite au-dessus des touches jouées.', min: 0, max: 1.5, step: 0.05 },
  ],
  keyGlow: [
    { kind: 'range', path: 'keyGlow.height', label: 'Hauteur', help: 'Hauteur de la colonne de lumière, en fraction de la zone d\'effets.', min: 0.02, max: 0.8, step: 0.01 },
    { kind: 'range', path: 'keyGlow.intensity', label: 'Intensité', help: 'Luminosité de la colonne.', min: 0, max: 1.5, step: 0.05 },
  ],
  impact: [
    { kind: 'range', path: 'impact.size', label: 'Taille', help: 'Taille de l\'éclat, par rapport à la largeur de la touche.', min: 0.2, max: 3, step: 0.05 },
    { kind: 'range', path: 'impact.intensity', label: 'Intensité', help: 'Luminosité de l\'éclat.', min: 0, max: 1.5, step: 0.05 },
  ],
  guides: [
    { kind: 'color', path: 'guides.color', label: 'Couleur', help: 'Couleur des lignes de repère.' },
    { kind: 'range', path: 'guides.opacity', label: 'Opacité', help: 'Visibilité des lignes : gardez-les discrètes.', min: 0, max: 0.6, step: 0.01 },
  ],
  motion: [{ kind: 'range', path: 'motion.riseSpeed', label: 'Vitesse de montée', help: 'Vitesse à laquelle les notes montent, en hauteurs de zone par seconde : à 0,5 une note traverse la zone en 2 secondes.', min: 0.05, max: 1.5, step: 0.05 }],
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

/** Valeur affichée à côté d'un curseur : autant de décimales que le pas, virgule française. */
const formatValue = (v: number, step: number, unit = '') => {
  const decimals = step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length ?? 0);
  return `${v.toFixed(decimals).replace('.', ',')}${unit && unit !== '°' ? ' ' : ''}${unit}`;
};

type HandleKind = 'width' | 'radius' | 'glow';

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
  private readonly handles: Record<HandleKind, HTMLDivElement>;
  private readonly chips = h('div', { className: 'chips' });
  private readonly noteBox = h('div', { className: 'note-box' });
  private layer: LayerId = 'note';
  mode: PreviewMode = 'loop';
  private renderer: Renderer | null = null;

  // Historique (annuler / rétablir) : instantanés JSON du style, regroupés par pauses de 350 ms.
  private history: string[] = [];
  private future: string[] = [];
  private historyTimer = 0;
  private lastSnapshot = '';

  // Mémo pour ne toucher au DOM de l'aperçu que si quelque chose a changé.
  private chipsKey = '';
  private placeKey = 'init';

  constructor(
    private s: () => Settings,
    private onChange: () => void,
    private onModeChange: (mode: PreviewMode) => void,
  ) {
    this.undoBtn = button('↶ Annuler', () => this.undo(), 'icon', 'Annule la dernière modification des visuels (Ctrl+Z).');
    this.redoBtn = button('↷ Rétablir', () => this.redo(), 'icon', 'Refait la modification annulée (Ctrl+Y).');

    const modes = h('div', { className: 'segmented' });
    const modeHelp: Record<PreviewMode, string> = {
      loop: 'L\'aperçu joue en boucle une petite mélodie sur une octave, pour voir les effets en mouvement.',
      single: 'Une seule note immobile qui émet ses particules en continu. Tire les poignées jaunes et clique sur les pastilles pour la modifier directement.',
    };
    for (const [m, label] of [['loop', 'Piano en boucle'], ['single', 'Note seule']] as [PreviewMode, string][]) {
      const b = button(label, () => this.setMode(m), '', modeHelp[m]);
      this.modeButtons.set(m, b);
      modes.append(b);
    }

    this.handles = {
      width: this.makeHandle('width', 'Largeur de la note : glisse vers la gauche ou la droite.', '↔'),
      radius: this.makeHandle('radius', 'Arrondi des coins : glisse le long du haut de la note.', '◜'),
      glow: this.makeHandle('glow', 'Taille du halo : éloigne ou rapproche de la note.', '✺'),
    };
    this.noteBox.addEventListener('pointerdown', () => this.selectLayer('note'));
    this.overlay.append(this.noteBox, this.handles.width, this.handles.radius, this.handles.glow, this.chips);
    this.overlay.addEventListener('pointerdown', (e) => this.pickLayerAt(e));
    this.overlay.dataset.layer = this.layer;

    const previewWrap = h('div', { className: 'preview-wrap' }, this.previewHost, this.overlay);
    const toolbar = h('div', { className: 'preview-toolbar' }, modes, h('span', { className: 'spacer' }), this.undoBtn, this.redoBtn);
    const side = h('div', { className: 'editor-side' }, h('h2', {}, 'Calques'), this.layerList, this.inspector);
    const main = h(
      'div',
      { className: 'editor-main' },
      toolbar,
      previewWrap,
      h(
        'p',
        { className: 'hint' },
        'Clique sur une partie de l\'aperçu pour ouvrir son calque. En « Note seule », tire les poignées et clique sur les pastilles pour changer les couleurs. Survole un réglage pour son explication.',
      ),
    );
    this.el.append(this.presetBar, h('div', { className: 'editor-body' }, side, main));

    window.addEventListener('keydown', (e) => {
      if (!this.el.isConnected || this.el.offsetParent === null) return;
      const t = e.target;
      if ((t instanceof HTMLInputElement && t.type !== 'range' && t.type !== 'checkbox') || t instanceof HTMLTextAreaElement) return;
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

  /** Après un changement venu d'ailleurs (profil, clavier…) : tout relire, sans perdre l'historique. */
  refresh(): void {
    this.commit();
    this.renderAll();
  }

  /** Après un import : les anciens instantanés n'ont plus de sens. */
  resetHistory(): void {
    window.clearTimeout(this.historyTimer);
    this.history = [];
    this.future = [];
    this.lastSnapshot = JSON.stringify(this.s().style);
    this.renderAll();
  }

  // ---------- Historique ----------

  /**
   * Après chaque modification : prévenir l'application, rafraîchir ce qui en dépend
   * et programmer un instantané d'historique.
   * `inspector` : redessiner l'inspecteur (quand des champs apparaissent ou disparaissent).
   */
  private changed(opts: { inspector?: boolean } = {}): void {
    this.onChange();
    if (opts.inspector) this.renderInspector();
    this.renderLayers();
    this.renderChips();
    this.renderPresets();
    window.clearTimeout(this.historyTimer);
    this.historyTimer = window.setTimeout(() => this.commit(), 350);
  }

  private commit(): void {
    window.clearTimeout(this.historyTimer);
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
    this.commit();
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

  /** Préréglage personnel portant le nom du style courant, s'il y en a un. */
  private userPresetIndex(): number {
    const st = this.s();
    return st.userPresets.findIndex((p) => p.name === st.style.name);
  }

  private renderPresets(): void {
    const st = this.s();
    const current = JSON.stringify(st.style);
    const card = (p: VisualStyle, user: boolean) => {
      const active = JSON.stringify(p) === current;
      const b = h('button', { type: 'button', className: `preset${active ? ' active' : ''}${user ? ' user' : ''}` }, this.swatch(p), h('span', {}, p.name));
      b.dataset.help = user
        ? `Ton préréglage « ${p.name} » : clique pour l'appliquer (Ctrl+Z pour revenir en arrière).`
        : `Préréglage fourni « ${p.name} » : clique pour l'appliquer, puis ajuste-le à ton goût (Ctrl+Z pour revenir en arrière).`;
      b.addEventListener('click', () => {
        st.style = cloneStyle(p);
        this.changed({ inspector: true });
      });
      return b;
    };
    const builtinNames = new Set(BUILTIN_PRESETS.map((p) => p.name));
    const save = nameEntry(
      '＋ Enregistrer',
      'Enregistre les visuels actuels comme préréglage personnel. Avec le nom d\'un préréglage personnel existant, il est mis à jour.',
      'Nom du préréglage',
      // Un préréglage fourni n'est jamais écrasé : on propose un autre nom.
      () => (builtinNames.has(st.style.name) ? `${st.style.name} (perso)` : st.style.name),
      (name) => {
        if (builtinNames.has(name)) name = `${name} (perso)`;
        st.style.name = name;
        const copy = cloneStyle(st.style);
        const i = st.userPresets.findIndex((p) => p.name === name);
        if (i >= 0) st.userPresets[i] = copy;
        else st.userPresets.push(copy);
        this.changed();
      },
      'primary',
    );
    const userActive = this.userPresetIndex();
    const del = button(
      'Supprimer',
      () => {
        const i = this.userPresetIndex();
        if (i < 0) return;
        st.userPresets.splice(i, 1);
        this.changed();
      },
      '',
      userActive >= 0 ? `Supprime le préréglage personnel « ${st.style.name} » (les visuels affichés restent tels quels).` : 'Choisis d\'abord un de tes préréglages (★) pour pouvoir le supprimer.',
    );
    del.disabled = userActive < 0;
    // Pendant la saisie d'un nom, ne pas reconstruire la barre (on perdrait le champ).
    if (this.presetBar.querySelector('.name-entry input')) return;
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
        li.dataset.help = l.hint;
        if (l.toggle) {
          const on = Boolean(get(style, l.toggle));
          const eye = button(
            on ? '●' : '○',
            () => {
              set(style, l.toggle!, !on);
              this.changed({ inspector: l.id === this.layer });
            },
            `eye${on ? ' on' : ''}`,
            on ? `Calque affiché : clique pour masquer « ${l.label} ».` : `Calque masqué : clique pour afficher « ${l.label} ».`,
          );
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
    this.overlay.dataset.layer = id;
    this.renderLayers();
    this.renderInspector();
  }

  private renderInspector(): void {
    const style = this.s().style;
    const layer = LAYERS.find((l) => l.id === this.layer)!;
    const fields = FIELDS[layer.id].filter((f) => !f.when || f.when(style));
    const extra: HTMLElement[] = [];
    if (layer.id === 'motion') {
      const perf = this.s().performance;
      const input = h('input', { type: 'range', min: '200', max: '8000', step: '100', value: String(perf.maxParticles) });
      const out = h('output', {}, String(perf.maxParticles));
      input.addEventListener('input', () => {
        perf.maxParticles = Number(input.value);
        out.textContent = input.value;
        this.onChange();
      });
      extra.push(
        row(
          'Particules à l\'écran (maximum)',
          'Plafond du nombre de particules affichées en même temps sur tout le clavier. À baisser si l\'image saccade sur une petite machine (Raspberry Pi, mini-PC).',
          h('span', { className: 'slider' }, input, out),
        ),
      );
    }
    const hidden = layer.toggle && !get(style, layer.toggle);
    this.inspector.replaceChildren(
      h('h2', {}, layer.label),
      h('p', { className: 'hint' }, layer.hint),
      ...(hidden ? [h('p', { className: 'hint warn' }, 'Calque masqué : clique sur ○ dans la liste pour l\'afficher.')] : []),
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
        const out = h('output', {}, formatValue(Number(v), f.step, f.unit));
        input.addEventListener('input', () => {
          set(style, f.path, Number(input.value));
          out.textContent = formatValue(Number(input.value), f.step, f.unit);
          this.changed();
        });
        return row(f.label, f.help, h('span', { className: 'slider' }, input, out));
      }
      case 'toggle': {
        const input = h('input', { type: 'checkbox', checked: Boolean(v) });
        input.addEventListener('input', () => {
          set(style, f.path, input.checked);
          this.changed({ inspector: true });
        });
        return row(f.label, f.help, input);
      }
      case 'select': {
        const sel = h('select');
        sel.append(...f.options.map(([val, label]) => opt(val, label, val === v)));
        sel.addEventListener('input', () => {
          set(style, f.path, sel.value);
          this.changed({ inspector: true });
        });
        return row(f.label, f.help, sel);
      }
      case 'color': {
        const input = h('input', { type: 'color', value: String(v) });
        input.addEventListener('input', () => {
          set(style, f.path, input.value);
          this.changed();
        });
        return row(f.label, f.help, input);
      }
      case 'gradient': {
        const stops = v as [string, string, string];
        const bar = h('div', { className: 'gradient-bar' });
        const paint = () => (bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`);
        paint();
        const names = ['Note la plus grave', 'Milieu du clavier', 'Note la plus aiguë'];
        const inputs = stops.map((c, i) => {
          const input = help(h('input', { type: 'color', value: c }), names[i]);
          input.addEventListener('input', () => {
            stops[i] = input.value;
            paint();
            this.changed();
          });
          return input;
        });
        return help(
          h('div', { className: 'field-block' }, h('span', { className: 'label' }, f.label), bar, h('div', { className: 'gradient-stops' }, ...inputs)),
          f.help,
        );
      }
      case 'cref':
        return this.colorRefField(f.label, f.help, v as ColorRef);
    }
  }

  /** Couleur de calque : celle de la note jouée ou une couleur choisie, plus un curseur vers le blanc. */
  private colorRefField(label: string, helpText: string, ref: ColorRef): HTMLElement {
    const seg = h('div', { className: 'segmented small' });
    const setRef = (r: ColorRef['ref']) => {
      ref.ref = r;
      this.changed({ inspector: true });
    };
    const noteBtn = button('De la note', () => setRef('note'), '', 'Reprend la couleur de la note jouée (selon le réglage « Couleur des notes »).');
    const customBtn = button('Choisie', () => setRef('custom'), '', 'Une couleur fixe, la même pour toutes les notes : choisis-la avec le carré de couleur.');
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
    const out = h('output', {}, formatValue(ref.white, 0.05));
    white.addEventListener('input', () => {
      ref.white = Number(white.value);
      out.textContent = formatValue(ref.white, 0.05);
      this.changed();
    });
    return h(
      'div',
      { className: 'field-block' },
      help(h('div', { className: 'row' }, h('span', { className: 'label' }, label), seg, color), helpText),
      row('↳ Éclaircir vers le blanc', 'Mélange cette couleur avec du blanc : 0 = couleur pure, 1 = blanc. Un peu de blanc donne un cœur plus lumineux.', h('span', { className: 'slider' }, white, out)),
    );
  }

  // ---------- Manipulation directe sur l'aperçu ----------

  private makeHandle(kind: HandleKind, helpText: string, glyph: string): HTMLDivElement {
    const el = help(h('div', { className: `handle handle-${kind}` }, glyph), helpText);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      this.selectLayer('note');
      const move = (ev: PointerEvent) => this.dragHandle(kind, ev);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        this.renderInspector();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    return el;
  }

  private staticSprite() {
    return this.renderer?.notes.sprites[0] ?? null;
  }

  private dragHandle(kind: HandleKind, ev: PointerEvent): void {
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
    this.selectLayer(hit ? 'note' : 'particles');
  }

  /** À chaque image de l'aperçu : poignées et pastilles collées à la note seule (DOM touché seulement si ça bouge). */
  private placeHandles(): void {
    const sp = this.mode === 'single' ? this.staticSprite() : null;
    const n = this.s().style.note;
    const key = sp
      ? [sp.cx, sp.w, sp.yTop, sp.yBottom, sp.color, n.shape, n.radius, n.glow.enabled, n.glow.size, this.layer].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join('|')
      : '';
    if (key === this.placeKey) return;
    this.placeKey = key;
    for (const el of [this.handles.width, this.handles.radius, this.handles.glow, this.chips, this.noteBox]) el.hidden = !sp;
    if (!sp) return;
    this.renderChips();
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
    const style = this.s().style;
    const n = style.note;
    const noteCol = this.staticSprite()?.color ?? hexToNum(style.color.single);
    const items: [string, string, ColorRef, boolean][] = [];
    if (n.fill.type === 'gradient') items.push(['Haut', 'Couleur du haut de la note', n.fill.top, true]);
    if (n.fill.type !== 'none') items.push([n.fill.type === 'gradient' ? 'Bas' : 'Remplissage', n.fill.type === 'gradient' ? 'Couleur du bas de la note' : 'Couleur de remplissage de la note', n.fill.bottom, true]);
    items.push(['Contour', n.stroke.enabled ? 'Couleur du contour' : 'Couleur du contour (le contour est désactivé : active-le dans le calque Note)', n.stroke.color, n.stroke.enabled]);
    if (style.particles.enabled) items.push(['Particules', 'Couleur des particules', style.particles.color, true]);

    // Ne reconstruire que si les pastilles changent : sinon le sélecteur de couleur ouvert se fermerait.
    const key = JSON.stringify([noteCol, items.map(([l, , ref, on]) => [l, ref.ref, ref.hex, on])]);
    if (key === this.chipsKey) return;
    this.chipsKey = key;

    const chip = ([label, helpText, ref, enabled]: [string, string, ColorRef, boolean]) => {
      const input = h('input', { type: 'color', value: numToHex(resolve({ ...ref, white: 0 }, noteCol)) });
      input.addEventListener('input', () => {
        const wasNote = ref.ref === 'note';
        ref.ref = 'custom';
        ref.hex = input.value;
        // La pastille en cours d'édition reste en place : on recalcule seulement la clé.
        this.chipsKey = JSON.stringify([noteCol, items.map(([l, , r, on]) => [l, r.ref, r.hex, on])]);
        this.changed({ inspector: wasNote });
        reset.hidden = false;
      });
      const reset = button(
        '↺',
        () => {
          ref.ref = 'note';
          this.changed({ inspector: true });
        },
        'mini',
        'Revenir à la couleur de la note jouée.',
      );
      reset.hidden = ref.ref === 'note';
      return help(h('label', { className: `chip${enabled ? '' : ' off'}` }, input, h('span', {}, label), reset), `${helpText} : clique pour la choisir.`);
    };
    this.chips.replaceChildren(...items.map(chip));
  }
}
