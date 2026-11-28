/** Petits utilitaires DOM partagés par les écrans de réglage. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};

export const opt = (value: string, label: string, selected = false): HTMLOptionElement => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  o.selected = selected;
  return o;
};

/**
 * Ligne « libellé : contrôle ». Si `helpText` est donné, la ligne affiche son explication au survol
 * (un petit ⓘ après le libellé le signale).
 */
export const row = (label: string, helpText: string | null, ...controls: (Node | string)[]) => {
  const el = h('label', { className: 'row' }, h('span', { className: 'label' }, label), ...controls);
  if (helpText) {
    el.dataset.help = helpText;
    el.classList.add('has-help');
  }
  return el;
};

export const button = (label: string, onClick: () => void, className = '', helpText?: string) => {
  const b = h('button', { type: 'button', className }, label);
  b.addEventListener('click', onClick);
  if (helpText) b.dataset.help = helpText;
  return b;
};

export const numToHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Bouton qui, une fois cliqué, se change en petit champ « nom » + valider / annuler.
 * Remplace `prompt()`, qui ferait sortir du plein écran pendant les réglages.
 */
export const nameEntry = (
  label: string,
  helpText: string,
  placeholder: string,
  initial: () => string,
  onSubmit: (name: string) => void,
  className = '',
): HTMLElement => {
  const wrap = h('span', { className: 'name-entry' });
  const start = button(label, () => edit(), className, helpText);
  const idle = () => wrap.replaceChildren(start);
  const edit = () => {
    const input = h('input', { type: 'text', value: initial(), placeholder, maxLength: 40 });
    const submit = () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      idle();
      onSubmit(name);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') idle();
      else return;
      // Échap ne doit pas fermer tout l'écran de réglage, seulement ce champ.
      e.preventDefault();
      e.stopPropagation();
    });
    wrap.replaceChildren(input, button('OK', submit, 'primary'), button('✕', idle, 'icon', 'Annuler'));
    input.focus();
    input.select();
  };
  // Clic ailleurs : on abandonne la saisie.
  wrap.addEventListener('focusout', (e) => {
    if (wrap.querySelector('input') && !wrap.contains(e.relatedTarget as Node | null)) idle();
  });
  idle();
  return wrap;
};
