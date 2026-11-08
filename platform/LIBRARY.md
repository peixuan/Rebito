# Operator game library

Game files belong to the deployment operator, outside the source repository. The
application serves verified assets only to signed-in users. Importing a game never
uploads it elsewhere. Supply only files you are entitled to use and distribute.

Create a metadata JSON file, for example:

```json
{ "title": "My game", "system": "nes" }
```

Systems are `dos`, `nes`, `snes`, `gb`, `gba`. Console files are uncompressed ROMs;
DOS files are `.jsdos` ZIP bundles with `.jsdos/dosbox.conf`. DOS metadata also
accepts `saveFiles` (portable relative file paths) and optional `editor: "koukai2"`.
Only enable an editor for a verified compatible release. Each imported file is
limited to 512 MiB. Do not put personalized saves into shared game bundles.
At most 127 native save paths are allowed; one additional artifact holds the DOS
filesystem overlay. The `__runtime` namespace and file/directory collisions are
rejected. No game, BIOS or private save is shipped in the application image.

```sh
# From platform/, after building. DATA_DIR defaults to .data.
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

Administrators can also publish through `POST /api/admin/games` using a multipart
`metadata` JSON field followed by one `file` (maximum 64 MiB). The server accepts
uncompressed console ROMs, or DOS ZIP/jsdos packages and an executable path,
arguments, cycles and explicit save paths. DOS archives are streamed, limited to
5,000 entries and 256 MiB expanded, and repackaged with generated configuration.
Existing `.jsdos` settings are replaced; declared save files are omitted. Each
changed DOS launch/sync configuration produces a new immutable release; existing
profiles and editor bindings are not reassigned. Arbitrary uploads cannot enable
the Koukai2 editor. Successful publication appears without restarting the server.

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
