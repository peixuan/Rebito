# Heroes of Jin Yong: original DOS saves

The target is the 1996 DOS game, not a remake, MOD, GRP32 container or alternate
engine. Administrators choose the editor association. Structural validation is
not proof of a game's provenance: a MOD can reuse the original layout.

## Binary boundary

Each original `R1.GRP`, `R2.GRP` or `R3.GRP` is 114242 bytes. Its companion index
contains six little-endian 32-bit ends: 836, 59076, 97076, 101444, 114092, 114242.
The adapter uses the fixed original layout, never guessed offsets from file size.

| Section | Start | Records | Bytes per record |
| --- | ---: | ---: | ---: |
| Header and six party members | 0 | 1 | 36 |
| Inventory | 36 | 200 | 4 |
| Characters | 836 | 320 | 182 |
| Item definitions | 59076 | 200 | 190 |
| Scene definitions | 97076 | 84 | 52 |
| Martial art definitions | 101444 | 93 | 136 |
| Shops | 114092 | 5 | 30 |

Record identifiers must match their original table positions. Party references and
inventory identifiers/quantities are validated before editing. Inventory entries
are signed 16-bit item/quantity pairs; `-1` denotes an empty entry. Silver is item
174, not a dedicated money field at byte 42. Original names use Big5; the editor
reads them from the user's file instead of distributing the game's vocabulary.
Unknown bytes and values outside an edited field remain unchanged.

Character edits cover level/experience, health/energy, injury/poison/stamina,
combat proficiencies, morality/reputation/aptitude and double attack. Ten learned
martial-art slots use the original 93-entry art table and 0–999 proficiency words.
Equipment ownership, training, animation fields, names and world/quest data are
not writable. Existing unusual values are retained until that field is edited.
Every request validates the whole edit batch before writing a separate copy.

The read-only sex/castration field reads the original character word at relative
offset 28 (the protagonist's absolute offset is 0x360): 0 male, 1 female, 2 castrated.
It does not infer status from learned arts or claim to reverse related events.
Unknown flag values remain visible as unknown and are never normalized.

Inventory edits select one of the original 200 item definitions, including silver
(174), and set its quantity to 0–30000. Zero removes the item. Adding/removing entries
compacts the known inventory section; quantity-only edits change only the selected
quantity words. Neither operation changes item definitions or other save sections.

The inventory table initially shows held items in native order with quantity and
position columns. Disable **Owned items only** to add from the full catalog.
After adding, preview the draft or switch records to refresh its position controls.
**Bag position** and the move buttons reorder actual item/quantity pairs; sorting
a column only changes the table. Preview lists changed bag slots by item name.
Moves replay against the original revision alongside quantity edits: removed items
leave the order and new items append. No move changes quantities or other sections.
The normal revision check rejects stale publication instead of rebasing the order.

## Library configuration

Choose **Heroes of Jin Yong (original DOS)** in the administrator's editor selector.
Declare all nine native save paths: `R1.GRP`, `S1.GRP`, `D1.GRP`, `R2.GRP`, `S2.GRP`,
`D2.GRP`, `R3.GRP`, `S3.GRP`, `D3.GRP`, with the game's directory prefix when needed.
Keep the original IDX/resource files in the game archive. Do not synchronize or edit
`RANGER.GRP`. Its size/layout resemble a save, but it is initial game data.

Save inside the game and synchronize before opening the editor. Select the R file
for the intended slot, edit characters, learned arts or inventory, review and save.
The platform publishes one private revision, preserving all other files and checking
the base revision. Reload that slot inside the game afterward: file edits do not
change the currently running game's memory. The editor does not change save-sync
conflict or recovery behavior.

## References and verification

- [The original DOS/PC editor author's release](https://www.cheatmaker.org/archiver/showtopic-2289.aspx)
  establishes an existing save-editor workflow; no executable or interface assets
  from that tool are distributed.
- [KYS general editor, reviewed revision](https://github.com/masterball-w/Kys_general_editor/tree/7f179e0250f9f5f252fce41f5bdbbd21393abdf8)
  provides comparison material, not a specification for the DOS game. Its classic
  header probe prefers inventory at 44 and money at 42; those offsets do not match
  the original 36-byte header and 200-entry inventory checked locally.
- [Pascal engine, reviewed revision](https://github.com/bolstycjw/kys-jedisdl/tree/4d225cb9b7b9a3ac46a796ecb0acde525ef72acc)
  documents related record semantics, but its extended character/skill structures
  are not adopted. References are independently checked against original data.

The implementation is original code based on independently checked format facts;
no reference implementation, game resource or private save is copied into tests.
Public fixtures are synthetic. Private read-only inspection confirmed the original
index boundaries, all record identifiers, names and byte-identical read/copy output.

On 2026-11-22, private acceptance ran the local DOS game through Rebito's js-dos
8.5.3 adapter in Chrome with its sandbox enabled. Initial data was copied into an
isolated save, loaded and saved through the game's menu. The adapter then changed
ten fields and replaced only R1.GRP through guarded live writeback. Reloading in
the game displayed health 876/888, energy 555/777, attack 90, level-10 art, item
quantity 8 and silver 12345. Saving again retained all ten edits; only two position
header bytes differed from the edited file after movement. Original files were
read-only, and no private files or screenshots are shipped. This is representative
game-load/save evidence, not every field, game dump, MOD or battle-path coverage.

Synthetic tests independently check byte offsets, malformed inputs, numeric bounds,
ownership, stale revisions, concurrent publication and atomic multi-file failures.
The browser flow verifies administrator association, accessible choices, clamping,
sorting, language retention and byte-exact downloads of all nine files after edits
to two slots. No emulator, database or revision protocol is replaced by this editor.
