import { PRESETS, noteNameFr } from '../core/keyboardModel';
import { defaultProfile, type ColorMode, type Settings, type VisualModeId } from '../config/settings';
import type { MidiStatus } from '../midi/midiInput';

export interface PanelActions {
  settingsChanged(kind: 'keyboard' | 'visual' | 'profile' | 'midi'): void;
  startLearn(): void;
  openCalibration(): void;
  togglePattern(): void;
  toggleDemo(): boolean;
  toggleFullscreen(): void;
  exportSettings(): void;
  importSettings(file: File): void;
}

const MODE_LABELS: Record<VisualModeId, string> = {
  glow: 'Lueur de touche',
  bars: 'Barres montantes',
  particles: 'Particules',
};

const COLOR_LABELS: Record<ColorMode, string> = {
  hands: 'Par main',
  pitch: 'Par note (12 teintes)',
  octave: 'Par octave',
  velocity: 'Par vélocité',
  single: 'Couleur unique',
};

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};

const opt = (value: string, label: string, selected = false): HTMLOptionElement => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  o.selected = selected;
  return o;
};

const row = (label: string, ...controls: (Node | string)[]) =>
  h('label', { className: 'row' }, h('span', { className: 'label' }, label), ...controls);

/** Panneau de réglages, affiché par-dessus l'image (non déformé). Touche Tab pour l'ouvrir ou le fermer. */
export class Panel {
  readonly el = h('aside', { id: 'panel', hidden: true });
  private midiStatusEl = h('div', { className: 'status' });
  private midiSelect = h('select');
  private activityEl = h('div', { className: 'activity' }, '—');
  private learnBtn = h('button', { type: 'button' }, 'Apprendre (joue la plus grave puis la plus aiguë)');
  private lowestInput = h('input', { type: 'number', min: '0', max: '127' });
  private highestInput = h('input', { type: 'number', min: '0', max: '127' });
  private rangeInfo = h('span', { className: 'hint' });
  private presetSelect = h('select');
  private profileSelect = h('select');
  private demoBtn = h('button', { type: 'button' }, 'Démo : arrêt');

  constructor(private s: () => Settings, private actions: PanelActions) {
    document.body.appendChild(this.el);
    this.build();
    this.refresh();
  }

  toggle(force?: boolean): void {
    this.el.hidden = force === undefined ? !this.el.hidden : !force;
  }

  get visible(): boolean {
    return !this.el.hidden;
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

  setDemo(running: boolean): void {
    this.demoBtn.textContent = running ? 'Démo : en cours' : 'Démo : arrêt';
  }

  setActivity(text: string): void {
    this.activityEl.textContent = text;
  }

  setLearning(text: string | null): void {
    this.learnBtn.textContent = text ?? 'Apprendre (joue la plus grave puis la plus aiguë)';
    this.learnBtn.classList.toggle('active', text !== null);
  }

  /** Relit les réglages et met à jour les champs (après « Apprendre », un import ou un changement de profil). */
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
  }

  private readBinding(input: HTMLInputElement | HTMLSelectElement): void {
    const [scope, key] = (input.dataset.bind ?? '').split('.');
    const s = this.s();
    const obj = scope === 'visual' ? s.visual : scope === 'profile' ? s.profiles[s.activeProfile] : s.keyboard;
    const v = (obj as unknown as Record<string, unknown>)[key];
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
    if (input instanceof HTMLInputElement && input.type === 'range') this.updateRangeLabel(input);
  }

  private updateRangeLabel(input: HTMLInputElement): void {
    const out = input.nextElementSibling;
    if (out instanceof HTMLOutputElement) out.textContent = input.value;
  }

  /** Champ relié à un réglage : `scope.clé`, scope = visual | profile | keyboard. */
  private bound(bind: string, el: HTMLInputElement | HTMLSelectElement): HTMLInputElement | HTMLSelectElement {
    el.dataset.bind = bind;
    const [scope, key] = bind.split('.');
    el.addEventListener('input', () => {
      const s = this.s();
      const obj = (scope === 'visual' ? s.visual : scope === 'profile' ? s.profiles[s.activeProfile] : s.keyboard) as unknown as Record<string, unknown>;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') obj[key] = el.checked;
      else if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range')) obj[key] = Number(el.value);
      else obj[key] = el.value;
      if (el instanceof HTMLInputElement && el.type === 'range') this.updateRangeLabel(el);
      this.actions.settingsChanged(scope === 'profile' ? 'profile' : scope === 'keyboard' ? 'keyboard' : 'visual');
    });
    return el;
  }

  private slider(bind: string, min: number, max: number, step: number) {
    return h('span', { className: 'slider' }, this.bound(bind, h('input', { type: 'range', min: String(min), max: String(max), step: String(step) })), h('output'));
  }

  private build(): void {
    const a = this.actions;

    // --- Entrée ---
    this.midiSelect.addEventListener('input', () => {
      this.s().midiInputId = this.midiSelect.value || null;
      a.settingsChanged('midi');
    });
    this.demoBtn.addEventListener('click', () => {
      this.setDemo(a.toggleDemo());
    });
    const entree = h(
      'section',
      {},
      h('h2', {}, 'Entrée'),
      this.midiStatusEl,
      row('Entrée MIDI', this.midiSelect),
      row('Dernière note', this.activityEl),
      h('div', { className: 'buttons' }, this.demoBtn),
      h('p', { className: 'hint' }, 'Clavier virtuel : rangée A S D F G H J K… (Z / X : octave, Maj : fort, Espace : pédale).'),
    );

    // --- Clavier ---
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
        this.refresh();
      }
    };
    this.lowestInput.addEventListener('change', onRange);
    this.highestInput.addEventListener('change', onRange);
    this.learnBtn.addEventListener('click', () => a.startLearn());
    const clavier = h(
      'section',
      {},
      h('h2', {}, 'Clavier'),
      row('Modèle', this.presetSelect),
      row('Note la plus grave (MIDI)', this.lowestInput),
      row('Note la plus aiguë (MIDI)', this.highestInput),
      h('div', { className: 'hint' }, this.rangeInfo),
      h('div', { className: 'buttons' }, this.learnBtn),
      row('Largeur réelle (cm)', this.bound('keyboard.widthCm', h('input', { type: 'number', min: '30', max: '200', step: '0.5' }))),
    );

    // --- Calibrage ---
    this.profileSelect.addEventListener('input', () => {
      this.s().activeProfile = this.profileSelect.value;
      a.settingsChanged('profile');
      this.refresh();
    });
    const newProfile = h('button', { type: 'button' }, 'Nouveau profil');
    newProfile.addEventListener('click', () => {
      const name = prompt('Nom du profil (par exemple « Salon »)')?.trim();
      if (!name) return;
      const s = this.s();
      const base = s.profiles[s.activeProfile];
      s.profiles[name] = { ...structuredClone(base ?? defaultProfile(name)), name };
      s.activeProfile = name;
      a.settingsChanged('profile');
      this.refresh();
    });
    const calibBtn = h('button', { type: 'button', className: 'primary' }, 'Calibrer (F2)');
    calibBtn.addEventListener('click', () => a.openCalibration());
    const patternBtn = h('button', { type: 'button' }, 'Mire (F3)');
    patternBtn.addEventListener('click', () => a.togglePattern());
    const exportBtn = h('button', { type: 'button' }, 'Exporter les réglages');
    exportBtn.addEventListener('click', () => a.exportSettings());
    const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importInput.addEventListener('change', () => importInput.files?.[0] && a.importSettings(importInput.files[0]));
    const importBtn = h('button', { type: 'button' }, 'Importer…');
    importBtn.addEventListener('click', () => importInput.click());
    const calibrage = h(
      'section',
      {},
      h('h2', {}, 'Calibrage'),
      row('Profil', this.profileSelect),
      h('div', { className: 'buttons' }, calibBtn, patternBtn, newProfile),
      row('Miroir horizontal', this.bound('profile.mirrorX', h('input', { type: 'checkbox' }))),
      row('Miroir vertical', this.bound('profile.mirrorY', h('input', { type: 'checkbox' }))),
      row('Compensation de luminosité (gauche ↔ droite)', this.slider('profile.brightnessTilt', -1, 1, 0.05)),
      h('div', { className: 'buttons' }, exportBtn, importBtn, importInput),
    );

    // --- Visuels ---
    const modeBoxes = (Object.keys(MODE_LABELS) as VisualModeId[]).map((id) => {
      const cb = h('input', { type: 'checkbox', checked: this.s().visual.modes.includes(id) });
      cb.addEventListener('input', () => {
        const order: VisualModeId[] = ['glow', 'bars', 'particles'];
        const set = new Set(this.s().visual.modes);
        if (cb.checked) set.add(id);
        else set.delete(id);
        this.s().visual.modes = order.filter((m) => set.has(m));
        a.settingsChanged('visual');
      });
      return row(MODE_LABELS[id], cb);
    });
    const colorSelect = this.bound('visual.colorMode', h('select'));
    colorSelect.append(...(Object.keys(COLOR_LABELS) as ColorMode[]).map((c) => opt(c, COLOR_LABELS[c])));
    const visuels = h(
      'section',
      {},
      h('h2', {}, 'Visuels'),
      ...modeBoxes,
      row('Couleurs', colorSelect),
      row('Main gauche', this.bound('visual.leftColor', h('input', { type: 'color' }))),
      row('Main droite', this.bound('visual.rightColor', h('input', { type: 'color' }))),
      row('Couleur unique', this.bound('visual.singleColor', h('input', { type: 'color' }))),
      row('Séparation des mains (MIDI, 60 = Do3)', this.bound('visual.splitNote', h('input', { type: 'number', min: '0', max: '127' }))),
      row('Vitesse de montée', this.slider('visual.riseSpeed', 0.1, 1.5, 0.05)),
      row('Effet de la vélocité', this.slider('visual.velocityAmount', 0, 1, 0.05)),
      row('Halo (plus gourmand)', this.bound('visual.halo', h('input', { type: 'checkbox' }))),
      row('Particules max', this.slider('visual.maxParticles', 200, 4000, 100)),
    );

    const fullBtn = h('button', { type: 'button' }, 'Plein écran (F8)');
    fullBtn.addEventListener('click', () => a.toggleFullscreen());
    const aide = h(
      'section',
      {},
      h('h2', {}, 'Raccourcis'),
      h(
        'p',
        { className: 'hint' },
        'Tab : réglages · F2 : calibrage · F3 : mire · F4 : démo · F8 : plein écran · Échap : quitter le calibrage',
      ),
      h('div', { className: 'buttons' }, fullBtn),
    );

    this.el.append(h('h1', {}, 'PianoViz'), entree, clavier, calibrage, visuels, aide);
  }
}
