export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
}
export function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
export function onState(fn: () => Promise<void>): void {
  chrome.storage.local.onChanged.addListener(() => void fn());
  void fn();
}
