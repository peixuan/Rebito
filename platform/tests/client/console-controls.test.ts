import { afterEach, expect, it, vi } from "vitest";
import { type ConsoleControls, consoleControls } from "../../client/runtime/console-controls.ts";
import { message } from "../../src/shared/messages.ts";

afterEach(() => vi.unstubAllGlobals());

it("normalizes upstream translated labels and reports current bindings until disposed", () => {
  const rows = [
    { dataset: { id: "2", label: "Localized mode" } },
    { dataset: { id: "0", label: "Localized first button" } },
    { dataset: { id: "8", label: "Localized second button" } },
    { dataset: { id: "4", label: "UP" } },
    { dataset: { id: "5", label: "A" } },
    { dataset: { id: "24", label: "QUICK SAVE STATE" } },
  ];
  const menu = { querySelectorAll: vi.fn(() => rows), style: { display: "none" } };
  const refresh = vi.fn();
  const emulator: ConsoleControls = {
    controlMenu: menu as unknown as HTMLElement,
    controls: { 0: { 0: { value: 88 }, 8: { value: 90 }, 4: { value: 38 } } },
    keyMap: { 88: "x", 90: "z", 38: "up arrow", 13: "enter" },
    checkGamepadInputs: refresh,
  };
  const focus = vi.fn();
  vi.stubGlobal("window", { focus });
  const handle = consoleControls(emulator, {
    MODE: "Localized mode",
    "BUTTON 1 / START": "Localized first button",
    "BUTTON 2": "Localized second button",
  });
  const listener = vi.fn();
  const stop = handle.controls.watch(listener);
  expect(listener).toHaveBeenLastCalledWith([
    { button: message("controls.mode"), key: message("controls.unassigned") },
    { button: message("controls.buttonOneStart"), key: "X" },
    { button: message("controls.buttonTwo"), key: "Z" },
    { button: message("controls.up"), key: "↑" },
    { button: "A", key: message("controls.unassigned") },
  ]);
  emulator.controls[0] = { ...emulator.controls[0], 2: { value: 13 } };
  emulator.checkGamepadInputs();
  expect(refresh).toHaveBeenCalledOnce();
  expect(listener.mock.lastCall?.[0][0]).toEqual({
    button: message("controls.mode"),
    key: "Enter",
  });
  handle.controls.configure();
  expect(menu.style.display).toBe("");
  expect(focus).toHaveBeenCalledOnce();
  stop();
  emulator.checkGamepadInputs();
  expect(listener).toHaveBeenCalledTimes(2);
  handle.dispose();
  expect(emulator.checkGamepadInputs).toBe(refresh);
});
