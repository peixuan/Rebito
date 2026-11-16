# Game-specific save editors

Editor transformations live in `src/editors`, independent of HTTP, Vue, storage,
identity and emulator APIs. The service must authorize a revision, choose the
adapter from its immutable game release, transform a copy and publish through the
normal revision check. Requests contain known field keys/values, never byte offsets.

## Adapter registry and game association

Each game editor has its own directory under `src/editors/<game>/`. Its pure
adapter owns the save format; `registration.ts` declares its display name and
format guidance. `src/editors/registry.ts` is the single lookup used by the service
and catalog. Add a registry entry and format tests when introducing another editor.
The administration upload and configuration forms list this metadata automatically.
Administrators can associate or remove an editor without uploading the game again;
existing saves remain intact and open editors recheck the association on each request.
Associations are explicit administrator/operator choices. Program hashes, launcher
names and edition allowlists do not gate them: a fingerprint cannot establish every
game package's compatibility, and patches/translations may retain the same save format.
Only installed adapters are selectable; ordinary players cannot submit a parser ID
to override their release's association. This is not executable plugin upload.

Before editing, the adapter validates supported save size/structure and field ranges.
Those checks reject malformed input but cannot guarantee that an arbitrary edition
uses the same semantics. Preserve unknown bytes and immutable revision history.
The current Koukai2 adapter targets the DOS PC ten-slot `KOUKAI2.DAT` format;
administrators must declare its path for native synchronization. The library's
asset hashes still protect storage integrity and identify releases, not compatibility.

## Koukai2 PC format

The first module recognizes a candidate layout of exactly 328991 bytes:
`0x97 + 10 * 0x8074`. Slot `s` starts at `0x97 + s * 0x8074`. Its directory entry
starts at `1 + 15*s`: zero means empty; otherwise its first 11 bytes hold a date
in `DD/MMM/YYYY` padded decimal form. The protagonist at slot offset `0x611`
must be 0–5. These checks do not uniquely identify every historical game edition.
Only explicitly configured `editor: "koukai2"` releases should use this adapter.

The pure model provides the 14 basic fields. Money is a little-endian
uint32 at `0x60a`, limited to 600000000. Three uint16 fame values start at
`0x5b6 + protagonist*14`; six contribution bytes start at `0x5bc + protagonist*14`
and encode display value + 100. Date bytes at offsets 6–9 encode year−1501,
month−1, day−1 and a 20-minute time index. Editing time preserves the directory
date, which describes the last in-game save.

Field metadata carries ranges, choices, masks and display units. Rendering first
validates the entire request, writes a copy and preserves all unrelated bytes.
Untouched values outside an editor's allowed input range remain readable and are
not silently normalized. UI clamping improves entry; the server still rejects
invalid values. Masked changes preserve unrelated bits unless the legacy operation
explicitly reconstructs a byte, such as nationality.

The persons module covers 120 records at `0x62c + id*50`: eight abilities,
two levels, two uint16 experience values, age, loyalty, five masked skill bits,
nationality and affiliation bytes. The first six people also have titles at
`0x5c3 + id*14`. Nationality changes write `value | 0x60` as in the legacy editor.
Person 60's alternate labels depend on the independent marker at `0x11cb`.
Membership filtering uses the 30-byte roster at `0x2177`, even if status is stale.
Companion salaries occupy `0x2195..0x21b2` in units of ten coins; empty positions
keep their existing salary. Recruiting fills the first `255` roster position and
writes affiliation `(heroFleet, 255, 6)`. Hero fleets are `[0,10,30,50,40,20]`.
Dismissal requires a selected port 0–99 and writes `(255,port,0)`; hiding writes
`(254,0,0)`. Both remove the first matching roster entry, reproducing the original
behavior even for duplicate entries. Actions reject changing the current hero.
Bulk salary/loyalty copies only to valid members and uses pending edited values.

Fleet owners map heroes to `[0,1,3,5,4,2]`. Ten 9-byte positions begin at
`0x21fd + 133*owner*10`, with per-position supplies at `0x4630 + 30*position`.
Position byte 7 references a 22-byte descriptor at `0x4bfd + 22*id` (IDs 0–64).
Unknown references and empty descriptors cannot be edited. Duplicate references
share the first descriptor controls. IDs 40–64 alias template allocations, so
both views use the same field keys. There are 17 instance fields and twelve
fields per each of 25 templates. Template stats begin at `0x5184 + 12*type`;
default allocations at `0x4f5e + 22*type + 17`. Cannon type encodes selection+16.
Water/food display storage/10; salaries, industry, max crew and prices use ×10.

Twenty inventory bytes begin at `0x21b3`; choices retain all known legacy item
IDs and `255` for empty. Unknown original IDs survive until explicitly replaced.
The map action writes 539 bytes of `0xff` and a final `0xc0` at `0x144`; map reward
is the uint16 `0x8d76` at `0x36c`. One hundred discovery records begin at `0x72ee`,
stride seven: bits 7,6,5,4 mean disabled, found A, found B, reported. Every other
bit remains intact, including when composing the three bulk operations.

Synthetic whole-file tests specify expected bytes independently of field metadata.
All eight binary modules are implemented. On 2026-11-07, the TypeScript model
matched all 13 private golden outputs captured from the original Dk2Edit.exe,
comparing every byte after each sequential stage. This covers representative
paths through every module, not every possible real save or game edition.
The private editor API previews a selected revision and publishes a batch of slot
edits as one new revision. Only the owning account can read or edit it. The server
chooses the adapter from the catalog, restricts editable files to configured native
paths and rejects snapshots whose memory could undo native edits. Every slot must
transform successfully before publication. Existing filesystem overlays remain
immutable; DOS applies changed native files last on startup, or replaces the selected
file in a running instance through [guarded writeback](RUNTIMES.md). The player must
reload the save inside the game to update game memory. The compact browser
editor now retains drafts across modules and slots, exposes all fields without
advanced foldouts and saves all pending files and slots as one revision. Numeric
inputs normalize edited values on Enter/blur; untouched abnormal values remain.
The reusable table supports search, sortable columns and a companion filter.
The browser acceptance test downloads the resulting file and independently checks
every byte after clamping, person edits, recruitment, map reveal and two-slot save.
Actual in-game acceptance is still required; the catalog fixture is not a game.

Reproduce locally with Node 24 or newer:
`node scripts/verify-koukai-legacy.mjs PRIVATE_CORPUS_DIRECTORY`.
The verifier checks the known baseline/final hashes, reads the corpus and writes
no save files. The corpus is intentionally excluded from version control. CI uses
the independently specified synthetic tests, including all physical ship aliases
and all discovery-byte values/bulk-action combinations.
