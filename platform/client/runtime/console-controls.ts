import { type DisplayText, message } from "../../src/shared/messages.ts";
import type { RuntimeControl, RuntimeControls } from "./types.ts";

export interface ConsoleControls {
  controlMenu: HTMLElement;
  controls: Record<number, Record<number, { value?: number }>>;
  keyMap: Record<number, string>;
  checkGamepadInputs(): void;
}

const labels: Record<string, DisplayText> = {
  UP: message("controls.up"),
  DOWN: message("controls.down"),
  LEFT: message("controls.left"),
  RIGHT: message("controls.right"),
  START: message("controls.start"),
  SELECT: message("controls.select"),
  MODE: message("controls.mode"),
  "BUTTON 1": message("controls.buttonOne"),
  "BUTTON 1 / START": message("controls.buttonOneStart"),
  "BUTTON 2": message("controls.buttonTwo"),
  "SWAP DISKS": message("controls.changeDisc"),
  "EJECT/INSERT DISK": message("controls.ejectDisc"),
};
const keys: Record<string, string> = {
  "up arrow": "↑",
  "down arrow": "↓",
  "left arrow": "←",
  "right arrow": "→",
  enter: "Enter",
  space: "Space",
  shift: "Shift",
  ctrl: "Ctrl",
  alt: "Alt",
  tab: "Tab",
  escape: "Esc",
};

export function consoleControls(
  emulator: ConsoleControls,
  translations: Record<string, string> = {},
) {
  const localizedLabels = new Map(
    Object.entries(labels).map(([source, label]) => [translations[source] ?? source, label]),
  );
  const rows = [
    ...emulator.controlMenu.querySelectorAll<HTMLElement>('.ejs_control_bar[data-index="0"]'),
  ].filter((row) => Number(row.dataset.id) < 24);
  function read(): RuntimeControl[] {
    return rows.map((row) => {
      const label = row.dataset.label ?? "";
      const code = emulator.controls[0]?.[Number(row.dataset.id)]?.value;
      const key = code ? emulator.keyMap[code] : undefined;
      return {
        button: localizedLabels.get(label) ?? label,
        key: key ? (keys[key.toLowerCase()] ?? key.toUpperCase()) : message("controls.unassigned"),
      };
    });
  }
  const listeners = new Set<(bindings: RuntimeControl[]) => void>();
  const refresh = emulator.checkGamepadInputs;
  // Pinned EJS 4.2.3 has no binding-change event. Its UI refresh hook covers
  // keyboard/gamepad rebinding, Clear and Reset; keep this coupling in the adapter.
  emulator.checkGamepadInputs = () => {
    refresh.call(emulator);
    for (const listener of listeners) listener(read());
  };
  const controls: RuntimeControls = {
    watch(listener) {
      listeners.add(listener);
      listener(read());
      return () => listeners.delete(listener);
    },
    configure() {
      emulator.controlMenu.style.display = "";
      window.focus();
    },
  };
  return {
    controls,
    dispose() {
      listeners.clear();
      emulator.checkGamepadInputs = refresh;
    },
  };
}
