# Operator-managed game library

Place `catalog.json` and immutable game assets under `DATA_DIR/library`. A missing
catalog means an empty library. Startup fails for malformed entries, missing files,
size/checksum mismatches, duplicate releases and paths escaping the directory.
Changing an asset requires a new checksum/release and an application restart.

```json
{
  "version": 1,
  "games": [
    {
      "title": "Example homebrew",
      "system": "nes",
      "file": "example.nes",
      "sha256": "REPLACE_WITH_THE_64_CHARACTER_LOWERCASE_SHA256",
      "size": 12345
    }
  ]
}
```

Supported manifest systems are `dos`, `nes`, `snes`, `gb` and `gba`; this is a
format contract, not a claim that all runtime integrations are already verified.
DOS uses a js-dos bundle; consoles use an uncompressed ROM. DOS entries may list
portable relative `saveFiles` and select `editor: "koukai2"` when appropriate.
Keep personalized saves out of shared game bundles. The operator supplies assets;
no game, BIOS or private save is shipped in the repository or application image.

A release identifier combines the system and asset SHA-256. Titles and storage
paths can change without assigning old progress to different game bytes. Files
must remain immutable while the service runs. `GET /api/games` lists logical
release IDs, not server filesystem paths. `GET /api/games/:id/asset` streams verified
assets. Both require a session; shared game assets do not contain personal saves.
