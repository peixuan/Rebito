# Local real-game acceptance

Verified on 2026-11-07 in Chrome with the pinned js-dos/DOSBox WASM runtime.
This is a manual integration check of the supplied Chinese DOS Koukai2 release;
it complements the automated original-program fixtures and editor golden tests.

## Procedure and result

1. Prepared a deterministic DOS bundle from an explicit resource allowlist.
   Excluded `Dk2Edit.exe`, `KOUKAI2.DAT` and both personal save copies. Original
   files were read only. Imported the bundle using the operator importer.
2. Signed in, created a fresh personal progress profile and started the game.
   Created the first protagonist with the default name. The game's password
   prompt accepted Enter with the supplied original launcher.
3. Used the game's Function → Save menu and slot 1, then the page's Save to
   account button. The game created a valid 328,991-byte `KOUKAI2.DAT` without
   requiring a pre-existing personal save or a shared blank-save template.
4. Changed money from 0 to 12,345,678 and protagonist leadership from 78 to 200
   in the web editor. At that time publishing stopped the old instance; the live
   writeback follow-up below supersedes this behavior for DOS editor saves.
5. Restarted and loaded slot 1 in the actual game. Its display showed 1,234 gold
   bars plus 5,678 coins, and the character information screen showed leadership
   200. Saved again inside the game and uploaded another cloud revision.
6. Downloaded that final native file and independently checked its length, little
   endian money at `0x6a1`, and leadership at `0x97 + 0x62c + 2`. Both edited
   values survived the game's own save writer. Revision sources were game →
   editor → game. The original user's save hash remained unchanged.

## Reproducibility evidence

| Artifact | SHA-256 |
| --- | --- |
| Shared game bundle, without personal saves | `342281db2fe7fdb77272dde37c23db2ee627134a3c6e9bc5ae0f7614a6d2c911` |
| New save generated during acceptance | `65fee75c578b8fdd59a1bb678e1d4ab6d3e65572dc810731f300051652d8fbad` |
| Modified save written again by the game | `c62612d360b8410e7136283990165c87592506c01ad1a40efe88a5ed5b4e8497` |
| Original personal save, before and after | `fd5ceaa8bc606344c4f5041c0826da6aaaf5dd861b0bb07bae886817c247f426` |

Private evidence is under `.analysis/koukai-web-qa/`: bundle specification, config,
screenshots, generated saves and `evidence.json`. Do not commit or distribute them.
The committed [editor verification](../../platform/EDITORS.md) covers all eight editing modules
and 13 complete-file legacy comparisons; this real-game check exercises two
representative fields, not every possible edit or a complete playthrough.

During this check the game's absolute mouse position needed a vertical adjustment
within its letterboxed display; keyboard menu navigation worked. The DOS window
now offers relative mouse capture, with canvas capture and Escape release verified
in the browser. Absolute pointer alignment remains game-dependent.
The first round trip used the Windows host service. The following deployment
check used the Linux container image with the same pinned runtimes.

## Container restart and independent recovery

The application image was built in WSL from pinned dependencies and runtime
archives. Imported the private game bundle through the operator CLI, logged in
through the browser, edited money to 87,654,321 and started the WASM player.

Stopped the app, verified storage integrity, captured PostgreSQL with `pg_dump`
and the complete data volume with `tar`, then resumed the original deployment.
Restored both captures into a separate Compose project with fresh database/data
volumes and a separate browser origin. Verification found three retained revisions,
three referenced blobs and no abandoned blobs. Login, revision IDs and downloaded
save bytes survived recovery. The restored game displayed 8,765 gold bars and
4,321 coins after loading slot 1.

Finally rebuilt the original deployment with relative mouse support and fully
stopped/restarted both app and database. Login and exact-byte recovery passed again.
The edited 328,991-byte file had SHA-256
`e701217fa1749ced32b2c881fef459809f6c7c310b34d9d66f7227a05da98a67`
before backup, after restore and after restart. Running offline maintenance against
the active deployment correctly failed with `Storage is in use`.

These checks follow [storage operations](../../platform/OPERATIONS.md). Private
backups, credentials and screenshots remain under `.analysis/`, outside commits.

## Live native-file writeback (2026-11-08)

Rebuilt the WSL container and verified healthy startup. Chrome ran with its sandbox
enabled. In the real Koukai2 runtime, consecutive editor publications changed slot 1
money from 87,654,321 to 87,654,322 and back. The same iframe/runtime remained alive;
all 328,991 native bytes matched the independently constructed expected file after
each edit. Stopping synchronized the final file, whose cloud bytes exactly matched
the pre-check baseline. The original game directory was not modified.

The synthetic DOS test additionally executes a DOS command that reads a replaced
file, and exercises unrelated-file preservation, an already-paused runtime, failed
download/retry without duplicate publication, and rejecting unsynchronized game
saves before publication. These checks verify live file replacement, not automatic
mutation of game RAM: users must load the save inside the game.

The subsequent multi-file/automatic-sync image also passed healthy container
startup. Real Koukai2 ran for 51 seconds with an unchanged cloud head, confirming
that unchanged native data did not create an automatic revision. Explicit Stop
published the full collection and preserved every native byte. The browser suite
now additionally checks two-file UI publication, automatic DOS upload, guarded
navigation/logout and genuine concurrent-writer conflict recovery, including a
committed backup whose success response was lost.

## Mega CD / Sega CD (2026-11-11)

Used the operator's Japanese Sangokushi III CUE/BIN (50 tracks, 604,405,200-byte
BIN) and Japanese Mega CD 1 BIOS, MD5 `bdeb4c47da613946d422d97d98b21cda`.
Original files were read only. The administrator browser upload published a
521,285,753-byte canonical ZIP through the Linux app with its 512 MiB memory limit.
The successful HTTP publication took 39 seconds; the upload staging directory
was empty afterward. An initial acceptance run exposed a 30-second socket timeout
during preparation. Both HTTP time limits now allow the bounded 15-minute operation.
Deleting the first empty test release reclaimed its 521,285,753 asset bytes before
repeating the upload, with no user profiles or history affected.

Sandboxed Chrome booted the supplied BIOS, recognized all 50 tracks, entered the
game's title/menu and new-game sequence, and accepted controller input. Formatting
the private RAM cartridge produced the expected `SEGA_CD_ROM`/`RAM_CARTRIDGE___`
markers. A fresh runtime imported those exact native bytes and booted the game.
Original test firmware separately writes both ends of the 64 KiB emulated cart,
reads imported bytes into a visible palette and restores volatile state. This
caught the core's undersized initial allocation; the supported option/reset
sequence in [runtimes](../../platform/RUNTIMES.md) fixes it without modifying WASM.

The deployed page saved the real game's 73,728-byte cartridge alongside a
1,560,568-byte emulator state. Fresh browser runtimes restored the title and
continued the disc-based intro/menu with working input. After stopping both the
app and PostgreSQL and starting them again, the same head and both downloaded
artifacts matched their recorded SHA-256 values. The pre-upgrade game asset and
all 29 existing save artifacts also matched their baseline bytes. The new game
and an isolated validation profile remain available for local user verification.
A new browser session after the full restart restored the saved game menu directly.

The complete 39-test browser regression suite and the additional BIOS-configuration
browser test passed. The latter verifies invalid size, mismatched regions, replacing
BIOS without disc upload, resetting the input and retaining the old private profile.
Full format/lint/type/unit/integration/build gates passed 292 tests, with 97.99%
line coverage. The later HTTP timeout change passed lint, types and 15 server tests,
plus the actual long container upload. Dependency policy reviewed 280 packages;
the 10 repository policy tests and every new commit's line budget passed.

This is evidence for the tested single-disc CUE/BINARY path, not every Mega CD game
or a complete commercial playthrough. Multiple BINs are covered by archive tests;
CHD, compressed audio and disc swapping remain outside this implementation. Native
cartridge files alone omit internal backup RAM; complete progress retains both
cartridge and emulator state. Private images, BIOS, saves and browser captures stay
under ignored local diagnostics and deployment storage, never in commits.
