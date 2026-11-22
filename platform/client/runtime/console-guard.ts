import { MessageError, message } from "../../src/shared/messages.ts";

interface ConsolePlayback {
  pause(dontUpdate?: boolean): void;
  play(dontUpdate?: boolean): void;
  gameManager: {
    simulateInput(player: number, index: number, value: number): void;
  };
}

/** The workspace owns pauses; wrapper menus and local quick states cannot bypass it. */
export function guardConsolePlayback(emulator: ConsolePlayback) {
  const play = emulator.play.bind(emulator);
  const stop = emulator.pause.bind(emulator);
  const input = emulator.gameManager.simulateInput.bind(emulator.gameManager);
  let held = false;
  emulator.play = () => {
    if (!held) play(true);
  };
  emulator.gameManager.simulateInput = (player, index, value) => {
    if (index !== 24 && index !== 25) input(player, index, value);
  };
  function pause() {
    held = true;
    // Otherwise EJS's togglePlaying makes its hidden Play button visible again.
    stop(true);
  }
  return {
    pause,
    resume() {
      held = false;
      play(true);
    },
    async advance() {
      held = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        play(true);
        await new Promise<void>((resolve, reject) => {
          timer = setTimeout(
            () => reject(new MessageError(message("runtime.snapshotEditUnconfirmed"))),
            2000,
          );
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      } finally {
        clearTimeout(timer);
        pause();
      }
    },
  };
}
