# Game library

Game files belong to the deployment operator, outside the source repository. The
application serves verified assets only to signed-in users. Importing a game never
uploads it elsewhere. Supply only files you are entitled to use and distribute.

For routine uploads, use [browser administration](#browser-administration) after
the [one-time administrator setup](DEPLOYMENT.md#creating-accounts). The command
below remains available for operator-prepared releases.

Create a metadata JSON file, for example:

```json
{ "title": "My game", "system": "nes" }
```

Systems are `dos`, `nes`, `snes`, `gb`, `gba`, `md`, `sms`, `gg`. Console files are uncompressed ROMs;
DOS files are `.jsdos` ZIP bundles with `.jsdos/dosbox.conf`. DOS metadata also
accepts `saveFiles` (portable relative file paths) and optional `editor: "koukai2"`.
Only enable an editor for a verified compatible release. Each CLI-imported file is
limited to 512 MiB; browser uploads are limited to 64 MiB. Do not put personalized
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
3. Publish, then return to the library and create private progress for the game.
   Leaving a running game for management first synchronizes its progress; a failure
   preserves the runtime so the player can retry.

Empty DOS save paths disable automatic native-file change detection; manual saves
still capture the writable collection. Remove unrelated/private files before upload:
the server removes only the explicitly declared save files. Launch/configuration
changes reuse the stored game file through **编辑配置**, without another upload.
Renaming preserves the release ID; changed DOS launch/sync rules create a new release
and preserve old profiles. Complex legacy launch scripts are not guessed: leaving
the launch program empty renames only; selecting one replaces the launch script.
Console save locations are managed by the emulator adapter.
Sega uploads receive bounded header/model checks; ROM bytes are preserved, including
SMD interleaving. Headers are not a complete compatibility guarantee. Sega CD, 32X,
Pico, Saturn and Dreamcast are outside this cartridge integration. The selected
MD/SMS/GG core runs these cartridge formats without a separately supplied BIOS.

Administrators can also publish through `POST /api/admin/games` using a multipart
`metadata` JSON field followed by one `file` (maximum 64 MiB). The server accepts
uncompressed console ROMs, or DOS ZIP/jsdos packages and an executable path,
arguments, cycles and explicit save paths. DOS archives are streamed, limited to
5,000 entries and 256 MiB expanded, and repackaged with generated configuration.
Existing `.jsdos` settings are replaced; declared save files are omitted. Each
changed DOS launch/sync configuration produces a new immutable release; existing
profiles and editor bindings are not reassigned. Arbitrary uploads cannot enable
the Koukai2 editor. Successful publication appears without restarting the server.

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
