export const requireElement = <T extends HTMLElement>(
  id: string,
  type: new () => T,
): T => {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing element #${id} of type ${type.name}`);
  }
  return element;
};

interface ElementOptions {
  className?: string;
  text?: string;
  attributes?: Record<string, string>;
}

export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  { className, text, attributes = {} }: ElementOptions = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
};

export const showMessage = (element: HTMLElement, message: string): void => {
  element.textContent = message;
  element.hidden = message === "";
};
