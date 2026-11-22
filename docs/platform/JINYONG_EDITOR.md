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
This format check alone is not a passed game-load or deployment test.
