import type { RuntimeHandle } from "./types.ts";

const navigationKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/** Own scrolling keys only while the isolated game's keyboard surface has focus. */
export function withRuntimeKeyboard(element: HTMLElement, handle: RuntimeHandle): RuntimeHandle {
  const canvas = element.querySelector("canvas");
  if (!canvas) throw new Error("Missing runtime canvas");
  const previousTabIndex = canvas.getAttribute("tabindex");
  canvas.tabIndex = 0;
  const focus = () => canvas.focus({ preventScroll: true });
  const preventNavigation = (event: KeyboardEvent) => {
    // EmulatorJS ignores repeated keydowns before cancelling their browser default.
    // Keep delivery to the emulator; controls and text inputs retain native behavior.
    if ((event.target === canvas || event.target === element) && navigationKeys.has(event.key))
      event.preventDefault();
  };
  element.addEventListener("keydown", preventNavigation, true);
  element.addEventListener("keyup", preventNavigation, true);
  canvas.addEventListener("click", focus);
  return {
    ...handle,
    focus,
    async stop() {
      // A rejected stop may leave a playable runtime; retain its keyboard handling.
      await handle.stop();
      element.removeEventListener("keydown", preventNavigation, true);
      element.removeEventListener("keyup", preventNavigation, true);
      canvas.removeEventListener("click", focus);
      if (previousTabIndex === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", previousTabIndex);
    },
  };
}
