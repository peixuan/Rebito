# Game library

Game files belong to the deployment operator, outside the source repository. The
application serves verified assets only to signed-in users. Importing a game never
uploads it elsewhere. Supply only files you are entitled to use and distribute.

For routine uploads, use [browser administration](#browser-administration) after
the [one-time administrator setup](DEPLOYMENT.md#creating-accounts). The command
below remains available for operator-prepared releases.

The shelf lists games with your playthroughs first. Within each group, recent
additions appear first. Search covers the whole library, including titles beyond
the first 24. Choose a cover to see your profiles, then select a profile name
to enter its workspace. On phones the profiles appear below the selected row.

Create a metadata JSON file, for example:

```json
{ "title": "My game", "system": "nes" }
```

Systems are `dos`, `nes`, `snes`, `gb`, `gba`, `md`, `sms`, `gg`, `segacd`.
Cartridge console files are uncompressed ROMs;
DOS files are `.jsdos` ZIP bundles with `.jsdos/dosbox.conf`. DOS metadata also
accepts `saveFiles` (portable relative file paths) and an optional installed editor:
`"koukai2"` or `"jinyong"`. For original DOS Heroes of Jin Yong, follow the
[editor and nine-file synchronization guide](../docs/platform/JINYONG_EDITOR.md).
The operator chooses the appropriate editor; program fingerprints do not gate
association. Each CLI-imported file is
limited to 512 MiB; browser cartridge/DOS uploads are limited to 64 MiB. Mega CD
uses the bounded package format below, up to 1 GiB plus ZIP overhead. Do not put personalized
saves into shared game bundles.
At most 127 native save paths are allowed; one additional artifact holds the DOS
filesystem overlay. The `__runtime` namespace and file/directory collisions are
rejected. No game, BIOS or private save is shipped in the application image.

```sh
# From platform/, after building and initializing the database; supply DATABASE_URL.
# DATA_DIR defaults to .data. The CLI shares the online storage coordination lease.
node dist/library/import-game.js /private/game.nes /private/game.json

# Containers: mount only the required operator input, read-only.
docker compose run --rm -T -v /private/import:/import:ro app \
  node dist/library/import-game.js /import/game.nes /import/game.json
```

The command copies and hashes the asset, verifies existing catalog assets, then
atomically publishes the updated catalog. Source files remain untouched. An
existing release is rejected. Refreshing the game library loads and verifies the
new catalog without restarting the server. Existing game assets remain immutable.
Back up `DATA_DIR/library` with the private save directory.

Imports use an exclusive `.import.lock`. After an interrupted process, stop all
import commands, inspect `catalog.json` and its referenced assets, then remove the
stale lock before retrying. Unreferenced `.asset`/`.tmp` files may remain after a
crash; they are not served. Never delete assets referenced by the catalog.
The CLI requires the initialized deployment's `DATABASE_URL`; it refuses imports
while game cleanup is pending, just like browser management.

The generated `catalog.json` has `version: 1` and a `games` array containing the
metadata plus `file`, `sha256` and `size`. A missing catalog means an empty library.
Startup rejects malformed entries, missing files, checksum/size mismatches,
duplicate releases and paths escaping the directory. Assets must stay immutable
while the service runs. A release ID combines the system and asset SHA-256, so
changing a title cannot assign progress to different game bytes.
`GET /api/games` and `GET /api/games/:id/asset` require a session; responses expose
logical release IDs, never physical storage paths.

## Browser administration

Administrators open **游戏管理** in the page header to upload and configure games.
The form suggests DOS launch programs, preserves failed drafts and shows shared usage.

1. Choose a title, system and file. DOS accepts ZIP/jsdos; consoles accept an
   uncompressed `.nes`, `.sfc`, `.smc`, `.gb` or `.gba` ROM. Sega MD/Genesis accepts
   `.md`, `.gen`, `.bin` and interleaved `.smd`; Master System accepts `.sms`, and
   Game Gear accepts `.gg`. Choose the actual machine, not just a matching suffix.
2. For DOS, choose the launch program and optional arguments/cycles. List each
   native save path on its own line relative to the archive root, using `/` for
   subdirectories. Paths are exact, not wildcards; multiple files are supported.
3. Optionally choose **存档修改器**. The list comes from the installed editor registry;
   follow its save-format instructions. Administrators decide which games use it;
   program hashes and edition allowlists do not gate association. **不关联修改器**
   keeps a game playable without editing. Format/field checks run when editing saves.
4. Publish, then return to the library and create private progress for the game.
   Leaving a running game for management first synchronizes its progress; a failure
   preserves the runtime so the player can retry.

Empty DOS save paths disable automatic native-file change detection; manual saves
still capture the writable collection. Remove unrelated/private files before upload:
the server removes only the explicitly declared save files. Launch/configuration
changes reuse the stored game file through **编辑配置**, without another upload.
Renaming or adding/removing an editor association preserves the release ID and uses
the existing asset without copying it. Removing an editor leaves all user saves intact.
The association applies to existing profiles of that release after refresh.
Changed DOS launch/sync rules create a new release
and preserve old profiles. Complex legacy launch scripts are not guessed: leaving
the launch program empty renames only; selecting one replaces the launch script.
Console save locations are managed by the emulator adapter.
The configuration API uses `editor: null` to remove an association. Omitting `editor`
preserves the current association for a metadata-only update, but leaves a newly
derived release unbound. The browser sends the selected editor explicitly for a
derived release. Unknown IDs, unsupported system/editor pairs and conflicting
configuration tokens are rejected without changing the title or association.
Sega uploads receive bounded header/model checks; ROM bytes are preserved, including
SMD interleaving. Headers are not a complete compatibility guarantee. 32X,
Pico, Saturn and Dreamcast are outside this cartridge integration. The selected
MD/SMS/GG core runs these cartridge formats without a separately supplied BIOS.

### Mega CD / Sega CD

Administrators can maintain a regional BIOS library through
`GET /api/admin/firmware` and `POST /api/admin/firmware`. Upload the returned `token`
and a base64 `firmware` file; the server identifies J/U/E from its contents. A stale
token returns 409 without replacing a newer upload. Each region retains one 128 KiB
file in `library/firmware` (384 KiB total), separate from immutable game packages.
Startup adopts BIOS files from existing releases only for missing regions, in
catalog order. It never overwrites an administrator's selection or changes a release.
Back up this directory with the rest of application data. BIOS files are operator
content, never source-code or distribution artifacts.

#### BIOS checksums

Files must be exactly **131072 bytes (128 KiB)** with a recognized regional header.
Upload names are unrestricted; published files use the canonical names below.
The registry recognizes these MD5 identities:

| Region | Canonical filename | Recognized MD5                     |
| ------ | ------------------ | ---------------------------------- |
| Japan  | `bios_CD_J.bin`    | `278a9397d192149e84e820ac621a8edd` |
| Japan  | `bios_CD_J.bin`    | `bdeb4c47da613946d422d97d98b21cda` |
| USA    | `bios_CD_U.bin`    | `2efd74e3232ff260e371b99f84024f7f` |
| USA    | `bios_CD_U.bin`    | `854b9150240a198070150e4566ae1290` |
| Europe | `bios_CD_E.bin`    | `e66fa1dc5820d254611fdcdba0662372` |

Sources: [PicoDrive](https://docs.libretro.com/library/picodrive/#bios),
[Genesis Plus GX](https://docs.libretro.com/library/genesis_plus_gx/#bios),
[webRcade's version table](https://docs.webrcade.com/apps/emulators/segacd/), and
[Provenance's additional Japanese dump](https://github.com/Provenance-Emu/wiki/blob/master/installation-and-usage/bios-requirements.md).
The US entries represent different revisions; one checksum is not a universal
requirement. Identity recognition does not guarantee compatibility with every game.

Unknown checksums are rejected by default, even with a valid size and header.
An administrator may explicitly accept unconfirmed compatibility after reviewing
the displayed MD5. The registry API uses `allowUnrecognized: true`; legacy per-game
uploads/configuration overrides use `allowUnrecognizedFirmware: true`. Neither
option bypasses size, header, region, authorization or revision checks. Existing
installed firmware remains usable and is labeled when unrecognized. SHA-256, not
MD5, continues to identify immutable releases and protect storage integrity.

In **Game management**, select **Mega CD / Sega CD**, then use **Shared Mega CD BIOS**
to upload each needed region once. The page shows Japan, USA and Europe availability,
regardless of file names. Upload a ZIP containing exactly one CUE and all its
referenced BIN tracks; the server selects the matching BIOS automatically.
A folder containing CUE/BIN files can be zipped directly; one BIN containing many
tracks and separate BINs are both supported.
The server resolves filename case, validates track indexes and regions, streams
CRC-checked tracks, and publishes a canonical package without unrelated files.
BIN/BIOS bytes are unchanged. No vendor BIOS is bundled with this project.

**Edit configuration** shows the installed BIOS region and retains it by default.
Check **Use the current shared BIOS for this region** to publish a new release
using the stored disc and the library's current regional BIOS.
Existing profiles stay on their original release. Supplying the same BIOS bytes
only updates the title and does not duplicate the package.

The uploaded ZIP and total expanded content are each limited to 1 GiB and 500
entries; the expanded limit also includes the BIOS and normalized CUE. The first
track must be MODE1/2048 or MODE1/2352 at index zero, followed by BINARY audio.
CHD, WAV/MP3 tracks, multi-disc switching and other CD platforms are not supported.
The metadata-first API automatically chooses shared firmware from the disc's boot
region when `firmware` is omitted. Legacy clients may still send an explicit base64
`firmware` override. Configuration requests can set `useLibraryFirmware: true`
to publish a new release with the current shared BIOS for that disc. A missing
region rejects publication without changing existing games or profiles.
For the trusted CLI, supply an already prepared canonical package; it does not
transform arbitrary CUE/BIN uploads.

PicoDrive runs with a RAM cartridge. Platform snapshots retain the cartridge and
emulator state together: the latter includes internal backup RAM. A downloaded
`save.srm` alone is only the 72 KiB cartridge format, not complete CD progress or
a universal Fusion save format. Use **Save to account** or **Stop game** before closing the
page; console progress is not automatically uploaded on tab close. The first boot
of a game may ask to initialize its new private backup cartridge.

Large discs are downloaded and expanded in browser memory. Browser RAM usage can
substantially exceed the archive size. Server preparation streams files instead
of holding an entire disc in memory.

Administrators can also publish through `POST /api/admin/games` using a multipart
`metadata` JSON field followed by one `file` (64 MiB, or 1 GiB for Mega CD). The server accepts
uncompressed console ROMs, or DOS ZIP/jsdos packages and an executable path,
arguments, cycles and explicit save paths. DOS archives are streamed, limited to
5,000 entries and 256 MiB expanded, and repackaged with generated configuration.
Existing `.jsdos` settings are replaced; declared save files are omitted. Each
changed DOS launch/sync configuration produces a new immutable release; existing
profiles and their release bindings are not reassigned. Only administrators can
choose editor associations. Successful publication appears without restarting the server.

**删除** shows affected users, profiles, revision count, logical save bytes and
estimated recoverable file bytes. The administrator must type the exact title and,
when profiles exist, explicitly consent to deleting every user's history for that
release. New saves/configuration changes invalidate this preview and require fresh
confirmation. No private save content or account identifiers are exposed in the preview.

Deletion removes the game release and related profiles/history, then unlinks its
unshared asset and save blobs. Other releases and shared bytes remain intact. Running
clients cannot recreate the deleted profile or upload its stale progress; failed
synchronization keeps their local runtime available. **重试清理** completes interrupted
disk cleanup, including after a restart. See [operations](OPERATIONS.md) for storage
leases, interrupted catalog locks and the distinction between filesystem free space
and host virtual-disk size. There is no implicit save migration or soft-delete archive.

## Preparing a DOS bundle with the CLI

With Node 24+ and `npm ci --ignore-scripts` in `platform/`, create a specification
outside the game directory. List every required resource explicitly; exclude
private saves, editors, backup copies and unrelated files. Do not exclude all
`.dat` files: many games use that extension for required resources.

```json
{ "configuration": "dosbox.conf", "files": ["PLAY.BAT", "GAME.EXE", "RESOURCE.DAT"] }
```

`configuration` is relative to this specification file. It names a DOSBox config
with an `[autoexec]` section that mounts the bundle directory and starts the game.
File names are relative to the source game directory. The bundler rejects escaped
paths and duplicate names, fixes archive timestamps for reproducibility, and never
overwrites output. Keep the output outside the original game directory.

```sh
node scripts/bundle-dos.mjs /private/original /private/specification.json /private/game.jsdos
```

Then import the resulting bundle using the command above. A new-user acceptance
test must confirm the game can create its own save file without a personalized
save in the shared bundle. Bundle preparation uses development dependencies on
the operator's workstation; the deployment image only needs the import command.

## Release artwork

After publishing a game, open its configuration to set or remove a cover.
The browser fits the full image within 256 × 256 pixels. Only those pixels
are sent to the server. Covers stay private to signed-in users and belong
to the exact release. Replacing artwork preserves profiles and game bytes.

Artwork uses a separate 32 MiB budget in `library/covers` and observes the
configured free-space reserve. The game deletion preview includes the cover
and its cleanup frees the file. Existing libraries need no migration.
