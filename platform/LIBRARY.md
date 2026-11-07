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
docker compose restart app
```

The command copies and hashes the asset, verifies existing catalog assets, then
atomically publishes the updated catalog. Source files remain untouched. An
existing release is rejected. The running application keeps its verified catalog
until restarted. Back up `DATA_DIR/library` with the private save directory.

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
