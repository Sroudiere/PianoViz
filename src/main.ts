import { NoteBus } from './core/events';
import { KeyboardModel, noteNameFr } from './core/keyboardModel';
import { activeProfile, defaultCorners, loadSettings, sanitize, saveSettings, type Settings } from './config/settings';
import { applyStageTransform } from './calibration/stageTransform';
import { CalibrationOverlay } from './calibration/calibrationOverlay';
import { MidiInput } from './midi/midiInput';
import { VirtualKeyboard } from './midi/virtualKeyboard';
import { DemoPlayer } from './midi/demoPlayer';
import { Renderer } from './visuals/renderer';
import { Panel } from './ui/panel';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

async function main(): Promise<void> {
  let settings: Settings = loadSettings();
  const bus = new NoteBus();

  const buildModel = () =>
    new KeyboardModel(settings.keyboard.lowest, settings.keyboard.highest, activeProfile(settings).corrections);
  let model = buildModel();

  const renderer = new Renderer(model, settings.visual);
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

  const rebuildModel = () => {
    model = buildModel();
    renderer.setModel(model, activeProfile(settings).corrections.map((c) => c.note));
  };

  // --- Sources de notes ---
  const midi = new MidiInput(bus);
  new VirtualKeyboard(bus);
  const demo = new DemoPlayer(bus);

  // --- Calibrage ---
  let lastNote: number | null = null;
  const overlay = new CalibrationOverlay($('calibration-overlay'), () => activeProfile(settings), {
    changed: () => {
      applyTransform();
      save();
    },
    nudgeKey: (delta) => {
      if (lastNote === null) return;
      const prof = activeProfile(settings);
      const existing = prof.corrections.find((c) => c.note === lastNote);
      // Point de départ = correction déjà interpolée à cet endroit, pour ne pas faire sauter la touche.
      const start = existing?.dx ?? model.correctionAt(model.key(lastNote)?.cx ?? 0);
      if (existing) existing.dx = start + delta;
      else prof.corrections.push({ note: lastNote, dx: start + delta });
      rebuildModel();
      updateKeyInfo();
      save();
    },
    removeKey: () => {
      if (lastNote === null) return;
      const prof = activeProfile(settings);
      prof.corrections = prof.corrections.filter((c) => c.note !== lastNote);
      rebuildModel();
      updateKeyInfo();
      save();
    },
    resetCorners: () => {
      activeProfile(settings).corners = defaultCorners();
      applyTransform();
      overlay.render();
      save();
    },
    stepChanged: (step) => {
      if (step === 'keys') return;
      panel.toggle(true);
      panel.focusSection(step === 'keyboard' ? 'clavier' : 'calibrage');
    },
    togglePanel: () => panel.toggle(),
    exit: () => closeCalibration(),
  });

  const updateKeyInfo = () => {
    if (lastNote === null) return;
    const corr = activeProfile(settings).corrections.find((c) => c.note === lastNote);
    overlay.setKeyInfo(
      `<b>${noteNameFr(lastNote)}</b> (MIDI ${lastNote}) : ${corr ? `correction ${corr.dx.toFixed(2)} touche blanche` : 'pas de correction ici'}.
       <kbd>←</kbd> <kbd>→</kbd> pour décaler, <kbd>Maj</kbd> pour aller plus vite, <kbd>Suppr</kbd> pour retirer.`,
    );
  };

  let patternBeforeCalib = false;
  const openCalibration = () => {
    if (overlay.active) return;
    patternBeforeCalib = renderer.patternVisible;
    renderer.showPattern(true);
    overlay.open();
  };
  const closeCalibration = () => {
    overlay.close();
    panel.toggle(false);
    renderer.showPattern(patternBeforeCalib);
    renderer.highlight(null);
  };

  // --- Apprendre la plage ---
  let learning: number[] | null = null;

  // --- Panneau ---
  const panel = new Panel(() => settings, {
    settingsChanged: (kind) => {
      if (kind === 'keyboard' || kind === 'profile') rebuildModel();
      if (kind === 'profile') applyTransform();
      if (kind === 'visual') renderer.setSettings(settings.visual);
      if (kind === 'midi') midi.select(settings.midiInputId);
      save();
    },
    startLearn: () => {
      learning = [];
      panel.setLearning('Joue la touche la plus grave…');
    },
    openCalibration,
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
        rebuildModel();
        applyTransform();
        renderer.setSettings(settings.visual);
        midi.select(settings.midiInputId);
        panel.refresh();
        saveSettings(settings);
        hint('Réglages importés');
      } catch {
        hint('Fichier de réglages illisible');
      }
    },
  });

  midi.onStatus((st) => panel.setMidiStatus(st));
  void midi.start(settings.midiInputId);

  renderer.onNote = (e) => {
    if (e.type !== 'noteon') return;
    panel.setActivity(`${noteNameFr(e.note)} (MIDI ${e.note}) · vélocité ${Math.round(e.velocity * 127)} · ${e.source}`);
    if (learning) {
      learning.push(e.note);
      if (learning.length === 1) panel.setLearning('Joue maintenant la touche la plus aiguë…');
      else {
        const lo = Math.min(...learning);
        const hi = Math.max(...learning);
        learning = null;
        panel.setLearning(null);
        if (hi > lo) {
          Object.assign(settings.keyboard, { lowest: lo, highest: hi });
          rebuildModel();
          panel.refresh();
          save();
          hint(`Clavier : ${noteNameFr(lo)} – ${noteNameFr(hi)}, ${hi - lo + 1} touches`);
        }
      }
    }
    if (overlay.active) {
      lastNote = e.note;
      renderer.highlight(e.note);
      updateKeyInfo();
    }
  };

  // --- Raccourcis ---
  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      panel.toggle();
    } else if (e.key === 'F2') {
      e.preventDefault();
      if (overlay.active) closeCalibration();
      else openCalibration();
    } else if (e.key === 'F3') {
      e.preventDefault();
      renderer.showPattern(!renderer.patternVisible);
    } else if (e.key === 'F4') {
      e.preventDefault();
      if (demo.running) demo.stop();
      else demo.start();
      panel.setDemo(demo.running);
    } else if (e.key === 'F8') {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Le curseur disparaît après 2 s d'immobilité, pour ne pas le projeter sur le mur.
  let cursorTimer = 0;
  window.addEventListener('pointermove', () => {
    document.body.classList.remove('hide-cursor');
    window.clearTimeout(cursorTimer);
    cursorTimer = window.setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
  });

  hint('Tab : réglages · F2 : calibrage · F4 : démo', 6000);
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
