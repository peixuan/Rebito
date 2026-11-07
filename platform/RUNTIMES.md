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
