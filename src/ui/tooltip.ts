/**
 * Bulles d'aide : tout élément portant `data-help` affiche son explication au survol,
 * après un court délai, dans une bulle placée sous l'élément (ou au-dessus s'il n'y a pas la place).
 */
export function installTooltips(): void {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  let target: HTMLElement | null = null;
  let timer = 0;
  // Bouton enfoncé (curseur qu'on tire, poignée…) : pas de bulle par-dessus.
  let pressed = false;

  const hide = () => {
    window.clearTimeout(timer);
    target = null;
    tip.classList.remove('show');
  };

  const show = (el: HTMLElement) => {
    tip.textContent = el.dataset.help ?? '';
    tip.classList.add('show');
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 8;
    let x = Math.min(Math.max(margin, r.left), window.innerWidth - t.width - margin);
    let y = r.bottom + 6;
    if (y + t.height > window.innerHeight - margin) y = r.top - t.height - 6;
    if (y < margin) {
      // Ni dessous ni dessus : à droite de l'élément.
      y = Math.max(margin, r.top);
      x = Math.min(r.right + 10, window.innerWidth - t.width - margin);
    }
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-help]') ?? null;
    if (el === target || pressed) return;
    hide();
    if (!el || !el.dataset.help) return;
    target = el;
    timer = window.setTimeout(() => target === el && show(el), 350);
  });
  document.addEventListener(
    'pointerdown',
    () => {
      pressed = true;
      hide();
    },
    true,
  );
  document.addEventListener('pointerup', () => (pressed = false), true);
  document.addEventListener('pointercancel', () => (pressed = false), true);
  window.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
}

/** Ajoute une explication au survol d'un élément et le renvoie. */
export function help<T extends HTMLElement>(el: T, text: string): T {
  el.dataset.help = text;
  el.classList.add('has-help');
  return el;
}
