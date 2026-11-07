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
   in the web editor. Publishing stopped the old running instance automatically.
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
This run used the Windows host service; complete container acceptance is tracked
separately in [status](STATUS.md).
