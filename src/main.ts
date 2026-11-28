import { NoteBus } from './core/events';
import { KeyboardModel, noteNameFr } from './core/keyboardModel';
import { activeProfile, defaultCorners, loadSettings, sanitize, saveSettings, type Settings } from './config/settings';
import { applyStageTransform } from './calibration/stageTransform';
import { CornerEditor } from './calibration/cornerEditor';
import { MidiInput } from './midi/midiInput';
import { VirtualKeyboard } from './midi/virtualKeyboard';
import { DemoPlayer, PreviewLoop } from './midi/demoPlayer';
import { Renderer } from './visuals/renderer';
import { SetupScreen } from './ui/setup';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

async function main(): Promise<void> {
  let settings: Settings = loadSettings();
  const bus = new NoteBus();

  const buildModel = () => new KeyboardModel(settings.keyboard.lowest, settings.keyboard.highest);
  const renderer = new Renderer(buildModel(), settings.visual);
  await renderer.init($('canvas-host'), bus);

  const stage = $('stage');
  const compensation = $('compensation');
  const applyTransform = () => applyStageTransform(stage, compensation, activeProfile(settings));
  applyTransform();
  window.addEventListener('resize', applyTransform);

  let saveTimer = 0;
  const save = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveSettings(settings), 300);
  };

  // --- Sources de notes ---
  const midi = new MidiInput(bus);
  new VirtualKeyboard(bus);
  const demo = new DemoPlayer(bus);

  // --- Aperçu de l'onglet Visuels : un faux piano d'une octave, avec sa propre boucle de notes ---
  const previewBus = new NoteBus();
  const preview = new Renderer(new KeyboardModel(60, 72), settings.visual, { pianoHeight: 0.26 });
  const previewLoop = new PreviewLoop(previewBus);
  let previewReady: Promise<void> | null = null;
  const setPreview = async (on: boolean) => {
    if (on) {
      previewReady ??= preview.init(setup.previewHost, previewBus);
      await previewReady;
      preview.setRunning(true);
      previewLoop.start();
    } else if (previewReady) {
      previewLoop.stop();
      preview.setRunning(false);
    }
  };

  // --- Écran de réglage (F2) ---
  let learning: number[] | null = null;
  let patternBeforeSetup = false;
  const setup: SetupScreen = new SetupScreen(() => settings, {
    settingsChanged: (kind) => {
      if (kind === 'keyboard') renderer.setModel(buildModel());
      if (kind === 'profile') applyTransform();
      if (kind === 'visual') {
        renderer.setSettings(settings.visual);
        preview.setSettings(settings.visual);
      }
      if (kind === 'midi') midi.select(settings.midiInputId);
      corners.render();
      save();
    },
    tabChanged: (tab) => {
      corners.setActive(tab === 'position');
      renderer.showPattern(tab === 'position' ? true : patternBeforeSetup);
      if (tab !== 'position') renderer.highlight(null);
      void setPreview(tab === 'visuels');
    },
    startLearn: () => {
      learning = [];
      setup.setLearning('Joue la plus grave…');
    },
    resetCorners: () => {
      activeProfile(settings).corners = defaultCorners();
      applyTransform();
      corners.render();
      save();
    },
    togglePattern: () => renderer.showPattern(!renderer.patternVisible),
    toggleDemo: () => {
      if (demo.running) demo.stop();
      else demo.start();
      return demo.running;
    },
    toggleFullscreen,
    exportSettings: () => {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pianoviz-${settings.activeProfile.replace(/\W+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    importSettings: async (file) => {
      try {
        settings = sanitize(JSON.parse(await file.text()));
        renderer.setModel(buildModel());
        renderer.setSettings(settings.visual);
        preview.setSettings(settings.visual);
        applyTransform();
        midi.select(settings.midiInputId);
        setup.refresh();
        corners.render();
        saveSettings(settings);
        hint('Réglages importés');
      } catch {
        hint('Fichier de réglages illisible');
      }
    },
  });

  const corners = new CornerEditor(setup.cornerLayer, () => activeProfile(settings), () => {
    applyTransform();
    save();
  });
  corners.onSelect = (i) => setup.setSelectedCorner(i);

  const openSetup = () => {
    if (setup.isOpen) return;
    patternBeforeSetup = renderer.patternVisible;
    setup.open('position');
  };
  const closeSetup = () => {
    if (!setup.isOpen) return;
    setup.close();
  };

  midi.onStatus((st) => setup.setMidiStatus(st));
  void midi.start(settings.midiInputId);

  renderer.onNote = (e) => {
    if (e.type !== 'noteon') return;
    setup.setActivity(`${noteNameFr(e.note)} (MIDI ${e.note}) · vélocité ${Math.round(e.velocity * 127)} · ${e.source}`);
    if (learning) {
      learning.push(e.note);
      if (learning.length === 1) setup.setLearning('Joue la plus aiguë…');
      else {
        const lo = Math.min(...learning);
        const hi = Math.max(...learning);
        learning = null;
        setup.setLearning(null);
        if (hi > lo) {
          Object.assign(settings.keyboard, { lowest: lo, highest: hi });
          renderer.setModel(buildModel());
          setup.refresh();
          save();
          hint(`Clavier : ${noteNameFr(lo)} – ${noteNameFr(hi)}, ${hi - lo + 1} touches`);
        }
      }
    }
    // Sur la mire du positionnement, la touche jouée s'allume : pratique pour vérifier l'alignement.
    if (setup.isOpen && setup.currentTab === 'position') renderer.highlight(e.note);
  };

  // --- Raccourcis ---
  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (setup.isOpen) closeSetup();
      else openSetup();
    } else if (e.key === 'Escape' && setup.isOpen) {
      e.preventDefault();
      closeSetup();
    } else if (e.key === 'F3') {
      e.preventDefault();
      renderer.showPattern(!renderer.patternVisible);
    } else if (e.key === 'F4') {
      e.preventDefault();
      setup.setDemo(demo.running ? (demo.stop(), false) : (demo.start(), true));
    } else if (e.key === 'F8') {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Le curseur disparaît après 2 s d'immobilité hors réglages, pour ne pas le projeter sur le mur.
  let cursorTimer = 0;
  window.addEventListener('pointermove', () => {
    document.body.classList.remove('hide-cursor');
    window.clearTimeout(cursorTimer);
    cursorTimer = window.setTimeout(() => !setup.isOpen && document.body.classList.add('hide-cursor'), 2000);
  });

  hint('F2 : réglages · F4 : démo', 6000);
}

let hintTimer = 0;
function hint(text: string, ms = 2500): void {
  const el = $('hint');
  el.textContent = text;
  el.classList.add('show');
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="color:#fff;font:16px system-ui;padding:2em">Erreur au démarrage : ${String(err)}</p>`;
});
