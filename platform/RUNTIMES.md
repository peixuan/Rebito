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
4.2.3 with its 4.2.3 FCEUmm, Snes9x, Gambatte, mGBA, Genesis Plus GX and PicoDrive packages. The wrapper version
does not identify a native core revision by itself: preserve the complete lock
and use a lock-derived fingerprint when recording emulator snapshots.

Snapshot identities are derived from the selected core and wrapper, so adding an
unrelated core does not invalidate existing progress. `snapshotBaseline` records
the original deployment's identity and archive integrities. Unchanged legacy
components retain that identity; changed archives or local variants receive a new fingerprint.
Keep this baseline immutable during upgrades; it is compatibility evidence, not
a version alias for newly built binaries.

The DOSBox browser adapter defaults `[mixer] prebuffer` to `0`; explicit game
settings still override this default through DOSBox's ordered section parser.
It installs the effective config after the game archive and restored overlay,
since extraction otherwise replaces the startup option. Stored releases and
private saves are unchanged, and running instances adopt it on their next start.
The reviewed `runtime-audio.mjs` variant gives the browser worklet a 100 ms target
buffer to tolerate brief delivery stalls, at about 54 ms more latency than upstream.
It preserves playback/resampling logic and updates the mapped preferred source;
see [source review](../docs/platform/RUNTIME_SOURCE_REVIEW.md). It does not alter
console audio, native-save formats or synchronization/conflict rules.
This is specific to js-dos 8.5.3/emulators 8.5.2, not DOSBox-X.
The native prebuffer refill controller otherwise overproduces PCM into the
separately buffered AudioWorklet, whose bounded queue drops samples. Disabling
the native controller leaves the browser buffer intact; increasing `blocksize`
does not fix this build's fixed-block mixer. Recheck this default on upgrades.
See the pinned [native mixer](https://github.com/caiiiycuk/emulators/blob/6bbf0925d221a7304ea8e0dda1e89b8dc01569b2/native/jsdos/dosbox/jsdos-mixer.cpp)
and [worklet](https://github.com/caiiiycuk/emulators/blob/6bbf0925d221a7304ea8e0dda1e89b8dc01569b2/src/dos/dosbox/ts/audio-worklet.ts).
`dos-audio.spec.ts` runs an original PC-speaker program through the production
adapter and real WASM, measuring sample pacing, overflow and underruns at 44.1/48
kHz output, and verifying explicit config overrides. It is not a subjective audio
quality assessment or a guarantee for all games and browser/device combinations.

DOSBox-X assets are intentionally retained for the planned Windows-game scope
(decision: 2026-11-13). js-dos documents Windows 95/98/ME through its DOSBox-X
backend; see [upstream support](https://js-dos.com/dosbox-x.html). This is a candidate
for early Windows games, not a claim that arbitrary Win32/NT/XP games run here.
The current adapter still selects ordinary DOSBox and does not expose Windows
launching. Keep Windows OS images operator-supplied. A future adapter must verify
boot/graphics/input and model immutable base disks plus private writable disk
changes, with revision checks, quotas and recovery. Current native-file syncing
cannot be assumed to capture writes inside a mounted disk image. Preserve runtime
identities for existing DOS saves when introducing that separate capability.

Snes9x, Genesis Plus GX and PicoDrive have noncommercial restrictions; do not claim
that every runtime permits commercial use. The project's original AGPL code does
not remove these restrictions. See [licensing boundaries](../docs/platform/LICENSING.md).
Before public binary distribution, assemble the corresponding source/build
materials required by the selected GPL/MPL components. Source links and package
metadata alone are not a source offer.
Local development and container validation do not imply that release packaging
has already passed this review.

Runtime adapters must isolate browser persistence by profile and load the chosen
server revision before play. History restores and external imports invalidate an
active instance. DOS editor saves use the guarded native-file capability below;
reviewed MD/Mega-CD editors use guarded checkpoint replacement. Other adapters
still require a fresh instance after an editor publication.
Real game acceptance checks are separate from installer and manifest tests.

Console editing parses the pinned RetroArch `RASTATE` envelope and a selected
Genesis Plus GX or PicoDrive memory domain. It preserves unknown state blocks,
padding and unrelated memory. Genesis Plus GX work RAM and PicoDrive main/program
RAM are word-swapped in these builds and converted to guest byte order before
game-specific editing. The server accepts only explicitly reviewed runtime
fingerprints; an emulator upgrade needs fresh format and actual load/readback
evidence. Snapshot size or magic alone does not establish compatibility.
See [snapshot synchronization](SYNCHRONIZATION.md#console-memory-editing),
[Phantasy Star IV](src/editors/phantasy-star4/README.md) and
[Romance of the Three Kingdoms III](src/editors/san3/README.md).

State loads use one adapter-owned temporary file and cancel its previous cleanup
timer before replacing it. The pinned wrapper's `GameManager.loadState` instead
reuses `game.state` with independent five-second timers: an earlier timer can
delete a later queued load. A controlled-clock reproduction with the shipped
wrapper confirmed that lifecycle race. The adapter calls the same named-file core
entrypoint, retains the five-second cleanup and removes its file on stop. This
does not weaken changed-byte/native-save readback, alter snapshot identities or
republish a failed edit; unconfirmed loads still remain paused for explicit retry.

The touch controller starts collapsed under the embedded game. The directional
pad accepts diagonals and multiple simultaneous contacts. Its buttons send player
one's native controller indices or DOS key events through the running adapter.
Releasing, cancelling, hiding, pausing or leaving clears held touch input.

The player shows an expanded keyboard-to-controller guide for player one after
startup. The optional `RuntimeControls` capability keeps the page independent of
EmulatorJS: the console adapter reads the active scheme's labels and current keys
from the pinned wrapper, and opens its existing control settings. The 4.2.3 wrapper
has no binding-change event; the adapter wraps `checkGamepadInputs`, restoring it
on stop, to report rebinding, clearing and resets without polling during gameplay.
Hints cover controller inputs and disk controls; account saving stays in the page
toolbar. Remapping lasts for this runtime only, since browser settings persistence
is disabled. DOS uses each game's own keyboard/mouse conventions instead.

The runtime canvas owns navigation keys only while it has focus. Explicit Start,
Resume and canvas clicks hand focus to the game; a control selected during loading
keeps its focus. Capture-phase cancellation covers held/repeated arrows, Space and
page-navigation keys without blocking emulator input or page controls. Background
resume never moves focus. Failed stops retain keyboard handling until the runtime
actually stops; successful cleanup restores the canvas tab index.

Live DOS editing pauses the existing instance and checks every target file against
the editor's base revision before server publication. It downloads only the edited
native file group, verifies all hashes, rechecks every original file before writing,
then writes and reads back the group before restoring the previous pause state.
Only manifest-declared native saves are writable; archives and other files remain
untouched. Worker writes receive copies because their buffers may be transferred.
Failed writes attempt verified rollback of all attempted members, continuing other
rollbacks if one fails; failed writeback keeps the runtime paused
with a retry that reuses the published revision. A failed rollback requires reloading
the page from the retained cloud revision. Upload/resume is blocked while pending.
This changes files, not game RAM: the player must load the save inside the game.
Unit tests cover guards, corruption and rollback; real DOS tests read replacements
from DOS and exercise publication, unchanged files, pause preservation and retry.

`saveFiles` is a portable-path allowlist and already supports multiple files and
subdirectories. The same capture/upload/restore flow handles the complete collection.
Editor requests now accept multiple files and slots in one atomic cloud revision;
all pending UI drafts are submitted together. The older single-file request remains
accepted for already-open clients. A real DOS fixture verifies two-file UI publication
and live replacement; no Koukai2 filename is hardcoded in platform synchronization.
New games still need verified manifests and format-specific editors. Related index,
world and character files must be declared and edited together by that game's adapter;
the current Koukai2 adapter does not parse other games' formats. File creation/deletion,
dynamic filename discovery and games that cache open save handles need separate
compatibility work; do not infer universal live-edit compatibility from DOS support.

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

DOS display defaults to integer multiples of physical device pixels, centered in
the available canvas container. The Integer pixels switch restores fit-to-window
scaling when disabled. Small viewports fit the whole image without cropping.
The adapter observes video-mode and container-size changes; it does not alter
DOSBox CPU timing or the game's original resolution. Scoped CSS overrides the
upstream inline canvas geometry and keeps nearest-neighbor sampling; unsupported
`crisp-edges` browsers retain the player's `pixelated` fallback.

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

Genesis Plus GX serves MD/Genesis, Master System and Game Gear through the existing
adapter. Each binding specifies its ROM suffix and control scheme; the wrapper's
reverse lookup otherwise treats all three as Master System. Tests also verify MD
button labels: the pinned wrapper omits MD from its settings menu, so its identical
Sega CD pad scheme supplies A/B/C and X/Y/Z/MODE. Original 68000/Z80 fixtures cover
raw/SMD MD, both 8-bit models, keyboard input, native SRAM import and visible palette
restoration. This core excludes SRAM from its state, so snapshots
must retain both `save.srm` and `__runtime/state.bin`; the test deliberately uses
different boot SRAM and verifies the restored palette independently. These checks
prove the tested runtime paths, not compatibility with every commercial game.

Mega CD uses PicoDrive 4.2.3 with the RAM cartridge enabled and locked. Genesis
Plus GX does not expose live CD BRAM through its native save API and omits it from
states. PicoDrive states include internal BRAM; its native `.srm` with RAM cart
enabled stores the cartridge (73,728 bytes, including its reserved prefix), not
internal BRAM. Always retain both snapshot artifacts for complete progress.
The canonical `disc.cue` selects `disc.srm` in each isolated runtime MEMFS.
The pinned core initially allocates a smaller cartridge buffer when RAM cart is
already enabled. Start with the option disabled so that buffer is released, enable
it after the core starts, then reset before importing the 72 KiB file. This uses
the wrapper's core-option/reset API; never patch WASM memory addresses. Original
firmware writes both ends of the cart and reads imported bytes into the visible
palette, checking actual emulated memory rather than just a file round trip.
The original test firmware verifies keyboard input, cartridge import and visible
snapshot restoration without distributing a vendor BIOS. CD uploads contain one
CUE, BINARY tracks and an operator-supplied region-matched BIOS; CHD, compressed
audio, multi-disc switching and arbitrary emulator settings are not supported.
