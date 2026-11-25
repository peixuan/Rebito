# Sangokushi Eiketsuden (original DOS)

This module targets the original Traditional Chinese DOS release, not the Windows
remake, console editions or MOD formats. Administrator association selects the
editor; structure checks do not prove a game's provenance or every edition's
compatibility. No game executable, resource table or real save is distributed.

## Native save boundary

The game has five native slots: `MSAVE0.R3S` through `MSAVE4.R3S`, each paired
with the corresponding `ESAVE0.R3S` through `ESAVE4.R3S` in the same directory.
`MSAVE` holds character/progress data; `ESAVE` retains the matching event state.
The unnumbered `MSAVE.R3` is a game resource, not an editable slot.

The reviewed `MSAVE` is 8,789 bytes. Money is a little-endian 16-bit word at
offset 35. The 384 character records begin at offset 1,685, with an 18-byte stride.
The preceding scene data, flags and final 192 bytes remain opaque.

| Relative offset | Stored value                              |
| --------------- | ----------------------------------------- |
| 0               | Faction and state flag; preserved         |
| 1               | Role; preserved                           |
| 2–4             | Unverified runtime/event state; preserved |
| 5–6             | Current troop count, little-endian        |
| 7               | Troop class                               |
| 8               | Level                                     |
| 9               | Experience toward the next level          |
| 10–17           | Eight item slots; 255 means empty         |

Names and base leadership, strength and intelligence belong to the immutable
`BAKDATA.R3` resource, not these saved character records. Changing a saved troop
count does not change the game's computed maximum. Preserve unknown item IDs
unless the user explicitly replaces the corresponding slot.

The saved byte at relative offset 4 is not established as morale: setting it to
70 survives a load/save round trip but battle morale still starts at 100. It is
deliberately not editable. The game caps money at 10,000 on load and replenishes
troops to the class/level maximum; neither a larger money word nor an arbitrary
saved troop count promises an effective in-game change.

## Evidence and limits

Private original-game checks on 2026-11-25 confirmed launch through `REKO3.COM`,
paired files for slots 1 and 5, and unchanged file hashes after restarting the
production DOS adapter and loading the restored progress. This establishes the
file boundary; individual edit behavior needs separate load/save verification.
The observed battle menu has no ordinary save command, and battle exit produced
no new native files. Filesystem synchronization is not a DOS memory snapshot.

References are format research, not incorporated source code:

- [Original DOS editor description](https://www.vector.co.jp/download/file/dos/game/fh020454.html)
- [Original player save research](https://huaweicloud.csdn.net/6707cceae2ce0119e0a23d45.html)
- [Character-code research](https://www.xycq.org.cn/forum/archiver/tid-310142.html)

Public tests generate their own byte layouts and labels. Keep runtime captures,
resource tables and executable analysis in private evidence directories.
