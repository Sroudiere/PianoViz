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

export const row = (label: string, ...controls: (Node | string)[]) =>
  h('label', { className: 'row' }, h('span', { className: 'label' }, label), ...controls);

export const button = (label: string, onClick: () => void, className = '') => {
  const b = h('button', { type: 'button', className }, label);
  b.addEventListener('click', onClick);
  return b;
};

export const numToHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
