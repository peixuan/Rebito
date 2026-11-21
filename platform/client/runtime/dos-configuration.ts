/** Defaults for the pinned js-dos DOSBox backend, not DOSBox-X. */
export function browserDosConfiguration(configuration: string): string {
  // The native prebuffer controller overproduces PCM into js-dos's independently
  // buffered AudioWorklet. Disable that controller, not the browser audio buffer.
  // DOSBox processes repeated sections in order: explicit game values still win.
  return `[mixer]\nprebuffer=0\n\n${configuration}`;
}
