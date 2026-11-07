# Browser runtime assets

`npm run runtimes` downloads the exact archives in `runtime-lock.json`, checks
their SHA-512 integrity and copies their browser assets into a private build
cache. Vite includes these files in the production output. Docker uses the same
installer with a BuildKit cache. Upstream installation scripts are never run.
The installer fails on a corrupt cache instead of trusting altered bytes.

The application serves these assets itself; runtime and core versions do not
follow a CDN's `latest` alias. Cache files, downloaded archives and WASM binaries
must not be committed. `inventory.json` and upstream notices accompany the assets.
The current console core archives contain their own complete `license.txt`.
The npm wrapper omits its combined JavaScript/CSS assets, so the installer joins
the original scripts in the pinned loader's order. It disables the wrapper's
automatic CDN update check; updates are reviewed through our lock instead.
Original sources are retained beside the combined file, and the exact build
adjustment is recorded in `scripts/runtime-assets.mjs`.

The selected components are js-dos 8.5.3 (with emulators 8.5.2) and EmulatorJS
4.2.3 with its 4.2.3 FCEUmm, Snes9x, Gambatte and mGBA packages. The wrapper version
does not identify a native core revision by itself: preserve the complete lock
and use a lock-derived fingerprint when recording emulator snapshots.

Snes9x has noncommercial restrictions; it is not covered by a blanket claim that
every runtime has a permissive license. This fits the stated noncommercial scope
but must be reconsidered if distribution terms or project goals change.
Before public binary distribution, assemble the corresponding source/build
materials required by the selected GPL/MPL components. Source links and package
metadata alone are not a source offer.
Local development and container validation do not imply that release packaging
has already passed this review.

Runtime adapters must isolate browser persistence by profile and load the chosen
server revision before play. A server-side edit or history restore requires a
fresh runtime instance; continuing an old instance would restore stale memory.
Real game acceptance checks are separate from installer and manifest tests.

js-dos applies plain `initFs` files before extracting archive overlays. The DOS
adapter therefore supplies edited native files as a final ZIP overlay. A real
DOSBox test verifies that edited bytes replace the older bytes inside the saved
filesystem. The runtime document alone permits dynamic JavaScript evaluation,
which this Emscripten loader requires; the account/editor document keeps its
stricter script policy. The same-origin iframe isolates runtime globals/styles,
not an adversarial JavaScript plugin.

DOS exposes a relative-mouse switch through the pinned player's
[`setMouseCapture` API](https://js-dos.com/player-api.html). Click the canvas to
capture the pointer; Escape releases it. A real-browser check covers both states.
This is useful for games whose absolute DOS mouse coordinates differ from the
letterboxed display. The option resets when the runtime stops; pointer handlers
are removed with that instance.

The console adapter uses the pinned `saveDatabaseLoaded` event before ROM startup.
It replaces the browser's persistent save mount with MEMFS and writes the selected
native save there. This prevents IndexedDB data from overwriting an
imported or edited cloud save. Snapshots include emulator state and native SRAM
when available, and require an identical release/core/runtime fingerprint.
The replacement remains a mount so the upstream exit handler can unmount it normally.
The NES acceptance fixture is an original tiny program: it writes battery SRAM,
changes its palette on a real keyboard input and restores that volatile palette
from a snapshot after a fresh boot. A variant without the battery flag verifies
the same volatile-state restoration with no native save file. No commercial ROM
is part of the tests.
Original LoROM, MBC1 and ARM fixtures exercise Snes9x, Gambatte and mGBA too.
Each test imports a changed battery save and then restores a state over deliberately
different boot SRAM, proving that the state load—not merely a restart—restores data.
