import { PRESETS, noteNameFr } from '../core/keyboardModel';
import { defaultProfile, type Settings } from '../config/settings';
import type { MidiStatus } from '../midi/midiInput';
import { CORNER_NAMES } from '../calibration/cornerEditor';
import { button, h, opt, row } from './dom';
import { StyleEditor, type PreviewMode } from './styleEditor';

export type SetupTab = 'position' | 'visuels' | 'entree';

export interface SetupActions {
  settingsChanged(kind: 'keyboard' | 'visual' | 'profile' | 'midi'): void;
  previewModeChanged(mode: PreviewMode): void;
  tabChanged(tab: SetupTab | null): void;
  startLearn(): void;
  resetCorners(): void;
  togglePattern(): void;
  toggleDemo(): boolean;
  toggleFullscreen(): void;
  exportSettings(): void;
  importSettings(file: File): void;
}

const TAB_LABELS: Record<SetupTab, string> = {
  position: 'Positionnement',
  visuels: 'Visuels',
  entree: 'Entrée MIDI',
};

/**
 * Écran de réglage (F2), en onglets :
 * - Positionnement : les coins se règlent directement sur l'image projetée, avec une carte d'options ;
 * - Visuels : options à gauche, aperçu en direct sur un faux piano d'une octave à droite ;
 * - Entrée MIDI : choix du piano, démo et raccourcis.
 */
export class SetupScreen {
  readonly el = h('div', { id: 'setup', hidden: true });
  /** Calque où le CornerEditor place ses poignées. */
  readonly cornerLayer = h('div', { className: 'corner-layer' });
  /** Éditeur de style de l'onglet Visuels (aperçu, calques, préréglages). */
  readonly editor: StyleEditor;

  private tab: SetupTab = 'position';
  private tabButtons = new Map<SetupTab, HTMLButtonElement>();
  private panes = new Map<SetupTab, HTMLElement>();
  private card = h('aside', { className: 'card' });
  private cornerInfo = h('p', { className: 'hint' });
  private midiStatusEl = h('div', { className: 'status' });
  private midiSelect = h('select');
  private activityEl = h('div', { className: 'activity' }, '—');
  private learnBtn = h('button', { type: 'button' }, 'Apprendre');
  private lowestInput = h('input', { type: 'number', min: '0', max: '127' });
  private highestInput = h('input', { type: 'number', min: '0', max: '127' });
  private rangeInfo = h('span', { className: 'hint' });
  private presetSelect = h('select');
  private profileSelect = h('select');
  private demoBtn = h('button', { type: 'button' }, 'Démo : arrêt');

  constructor(private s: () => Settings, private actions: SetupActions) {
    this.editor = new StyleEditor(s, () => actions.settingsChanged('visual'), (m) => actions.previewModeChanged(m));
    document.body.appendChild(this.el);
    this.build();
    this.refresh();
    this.setSelectedCorner(3);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  get currentTab(): SetupTab {
    return this.tab;
  }

  open(tab: SetupTab = this.tab): void {
    this.el.hidden = false;
    this.setTab(tab);
  }

  close(): void {
    this.el.hidden = true;
    this.actions.tabChanged(null);
  }

  setTab(tab: SetupTab): void {
    this.tab = tab;
    for (const [t, b] of this.tabButtons) b.classList.toggle('active', t === tab);
    for (const [t, p] of this.panes) p.hidden = t !== tab;
    this.actions.tabChanged(tab);
  }

  setSelectedCorner(i: number): void {
    this.cornerInfo.innerHTML = `Glisse les 4 poignées sur le mur : bas gauche et bas droit à l'aplomb des bords du clavier,
      vus depuis le tabouret ; haut gauche et haut droit en haut de la zone d'effets.<br>
      Clavier : <kbd>1</kbd>–<kbd>4</kbd> choisit le coin (<b>${CORNER_NAMES[i]}</b>), flèches = 1 px, <kbd>Maj</kbd> + flèches = 10 px.`;
  }

  setMidiStatus(st: MidiStatus): void {
    if (st.kind === 'unsupported') {
      this.midiStatusEl.textContent = 'Web MIDI indisponible : utilise Chrome, Chromium ou Edge.';
      this.midiStatusEl.className = 'status bad';
    } else if (st.kind === 'denied') {
      this.midiStatusEl.textContent = `Accès MIDI refusé : ${st.message}`;
      this.midiStatusEl.className = 'status bad';
    } else {
      this.midiStatusEl.textContent = st.devices.length
        ? `${st.devices.length} entrée(s) MIDI détectée(s)`
        : 'Aucune entrée MIDI : branche le piano en USB (le clavier virtuel reste actif).';
      this.midiStatusEl.className = st.devices.length ? 'status ok' : 'status';
      const current = this.s().midiInputId;
      this.midiSelect.replaceChildren(
        opt('', 'Toutes les entrées'),
        ...st.devices.map((d) => opt(d.id, d.name, d.id === current)),
      );
    }
  }

  setActivity(text: string): void {
    this.activityEl.textContent = text;
  }

  setDemo(running: boolean): void {
    this.demoBtn.textContent = running ? 'Démo : en cours' : 'Démo : arrêt';
  }

  setLearning(text: string | null): void {
    this.learnBtn.textContent = text ?? 'Apprendre';
    this.learnBtn.classList.toggle('active', text !== null);
  }

  /** Relit les réglages et met à jour tous les champs (après « Apprendre », un import ou un changement de profil). */
  refresh(): void {
    const s = this.s();
    this.lowestInput.value = String(s.keyboard.lowest);
    this.highestInput.value = String(s.keyboard.highest);
    const count = s.keyboard.highest - s.keyboard.lowest + 1;
    this.rangeInfo.textContent = `${noteNameFr(s.keyboard.lowest)} – ${noteNameFr(s.keyboard.highest)}, ${count} touches`;
    const preset = PRESETS.find((p) => p.lowest === s.keyboard.lowest && p.highest === s.keyboard.highest);
    this.presetSelect.value = preset ? String(preset.keys) : 'custom';
    this.profileSelect.replaceChildren(
      ...Object.keys(s.profiles).map((name) => opt(name, name, name === s.activeProfile)),
    );
    this.el.querySelectorAll<HTMLInputElement>('[data-bind]').forEach((input) => this.readBinding(input));
    this.editor.refresh();
  }

  private scopeObject(scope: string): Record<string, unknown> {
    const s = this.s();
    const obj = scope === 'profile' ? s.profiles[s.activeProfile] : s.keyboard;
    return obj as unknown as Record<string, unknown>;
  }

  private readBinding(input: HTMLInputElement | HTMLSelectElement): void {
    const [scope, key] = (input.dataset.bind ?? '').split('.');
    const v = this.scopeObject(scope)[key];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
    if (input instanceof HTMLInputElement && input.type === 'range') this.updateRangeLabel(input);
  }

  private updateRangeLabel(input: HTMLInputElement): void {
    const out = input.nextElementSibling;
    if (out instanceof HTMLOutputElement) out.textContent = input.value;
  }

  /** Champ relié à un réglage `scope.clé` (scope = profile | keyboard), appliqué en direct. */
  private bound<T extends HTMLInputElement | HTMLSelectElement>(bind: string, el: T): T {
    el.dataset.bind = bind;
    const [scope, key] = bind.split('.');
    el.addEventListener('input', () => {
      const obj = this.scopeObject(scope);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') obj[key] = el.checked;
      else if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range')) obj[key] = Number(el.value);
      else obj[key] = el.value;
      if (el instanceof HTMLInputElement && el.type === 'range') this.updateRangeLabel(el);
      this.actions.settingsChanged(scope === 'profile' ? 'profile' : 'keyboard');
    });
    return el;
  }

  private slider(bind: string, min: number, max: number, step: number) {
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    return h('span', { className: 'slider' }, this.bound(bind, input), h('output'));
  }

  private build(): void {
    const nav = h('nav', { className: 'tabs' });
    for (const t of Object.keys(TAB_LABELS) as SetupTab[]) {
      const b = button(TAB_LABELS[t], () => this.setTab(t));
      this.tabButtons.set(t, b);
      nav.append(b);
    }
    nav.append(h('span', { className: 'spacer' }), button('Fermer (F2)', () => this.close(), 'primary'));

    const position = h('section', { className: 'pane pane-position' }, this.cornerLayer, this.buildPositionCard());
    const visuels = h('section', { className: 'pane pane-visuels' }, this.editor.el);
    const entree = h('section', { className: 'pane pane-entree' }, this.buildInput());
    this.panes.set('position', position);
    this.panes.set('visuels', visuels);
    this.panes.set('entree', entree);
    this.el.append(position, visuels, entree, nav);
  }

  private buildPositionCard(): HTMLElement {
    const a = this.actions;

    this.presetSelect.append(...PRESETS.map((p) => opt(String(p.keys), p.label)), opt('custom', 'Personnalisé'));
    this.presetSelect.addEventListener('input', () => {
      const p = PRESETS.find((x) => String(x.keys) === this.presetSelect.value);
      if (!p) return;
      Object.assign(this.s().keyboard, { lowest: p.lowest, highest: p.highest });
      a.settingsChanged('keyboard');
      this.refresh();
    });
    const onRange = () => {
      const lo = Number(this.lowestInput.value);
      const hi = Number(this.highestInput.value);
      if (Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi <= 127 && hi > lo) {
        Object.assign(this.s().keyboard, { lowest: lo, highest: hi });
        a.settingsChanged('keyboard');
      }
      this.refresh();
    };
    this.lowestInput.addEventListener('change', onRange);
    this.highestInput.addEventListener('change', onRange);
    this.learnBtn.addEventListener('click', () => a.startLearn());

    this.profileSelect.addEventListener('input', () => {
      this.s().activeProfile = this.profileSelect.value;
      a.settingsChanged('profile');
      this.refresh();
    });
    const newProfile = button('Nouveau', () => {
      const name = prompt('Nom du profil (par exemple « Salon »)')?.trim();
      if (!name) return;
      const s = this.s();
      const base = s.profiles[s.activeProfile];
      s.profiles[name] = { ...structuredClone(base ?? defaultProfile(name)), name };
      s.activeProfile = name;
      a.settingsChanged('profile');
      this.refresh();
    });
    const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importInput.addEventListener('change', () => importInput.files?.[0] && a.importSettings(importInput.files[0]));

    const side = button('⇄', () => this.card.classList.toggle('left'), 'icon');
    side.title = 'Passer la carte de l\'autre côté';

    this.card.append(
      h('header', {}, h('h2', {}, 'Coins de la zone'), side),
      this.cornerInfo,
      h('div', { className: 'buttons' }, button('Réinitialiser les coins', () => a.resetCorners()), button('Mire (F3)', () => a.togglePattern())),
      row('Miroir horizontal', this.bound('profile.mirrorX', h('input', { type: 'checkbox' }))),
      row('Miroir vertical', this.bound('profile.mirrorY', h('input', { type: 'checkbox' }))),
      row('Luminosité gauche ↔ droite', this.slider('profile.brightnessTilt', -1, 1, 0.05)),
      h('h2', {}, 'Clavier'),
      row('Modèle', this.presetSelect),
      row('Note la plus grave (MIDI)', this.lowestInput),
      row('Note la plus aiguë (MIDI)', this.highestInput),
      h('div', { className: 'hint' }, this.rangeInfo),
      h('div', { className: 'buttons' }, this.learnBtn),
      h('p', { className: 'hint' }, '« Apprendre » : joue la touche la plus grave, puis la plus aiguë.'),
      row('Largeur réelle (cm)', this.bound('keyboard.widthCm', h('input', { type: 'number', min: '30', max: '200', step: '0.5' }))),
      h('h2', {}, 'Profil'),
      row('Profil actif', this.profileSelect),
      h(
        'div',
        { className: 'buttons' },
        newProfile,
        button('Exporter', () => a.exportSettings()),
        button('Importer…', () => importInput.click()),
        importInput,
      ),
    );
    return this.card;
  }

  private buildInput(): HTMLElement {
    const a = this.actions;
    this.midiSelect.addEventListener('input', () => {
      this.s().midiInputId = this.midiSelect.value || null;
      a.settingsChanged('midi');
    });
    this.demoBtn.addEventListener('click', () => this.setDemo(a.toggleDemo()));
    return h(
      'div',
      { className: 'options' },
      h('h2', {}, 'Piano'),
      this.midiStatusEl,
      row('Entrée MIDI', this.midiSelect),
      row('Dernière note', this.activityEl),
      h('h2', {}, 'Sans piano'),
      h('div', { className: 'buttons' }, this.demoBtn),
      h('p', { className: 'hint' }, 'Clavier virtuel : rangée A S D F G H J K… (Z / X : octave, Maj : fort, Espace : pédale).'),
      h('h2', {}, 'Raccourcis'),
      h('p', { className: 'hint' }, 'F2 : réglages · Échap : fermer · F3 : mire · F4 : démo · F8 : plein écran'),
      h('div', { className: 'buttons' }, button('Plein écran (F8)', () => a.toggleFullscreen())),
    );
  }
}
