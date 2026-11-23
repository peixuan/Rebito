# Romance of the Three Kingdoms III: Japanese Mega-CD memory

This adapter handles strategic-game data and verified registration defaults in
the sub-68000's 512 KiB program RAM. It does not handle the Mega Drive cartridge edition, mods,
raw BRAM files, native save containers or arbitrary emulator versions. Runtime
and game identity must be checked separately by the snapshot binding.

## Verified fields

All integers below use the guest's big-endian byte order. The shared snapshot
adapter converts PicoDrive's word-swapped representation before parsing.

This is a memory editor carried by an emulator checkpoint: capture and pause the
running game, edit only its program RAM, then restore the checkpoint and verify
the edited bytes through PicoDrive. Native SRAM accompanies the checkpoint but
is not rewritten by the editor. Use the game's own Save command after resuming
to persist changes in its native format; reopen cached game panels to see them.

| Table         | Address   | Count | Stride | Editable fields                                                         |
| ------------- | --------- | ----- | ------ | ----------------------------------------------------------------------- |
| Cities        | `0x787c4` | 46    | `0x34` | Population `+0x0c` u16, gold `+0x0e` u16, food `+0x10` u32              |
| Live officers | `0x79562` | 600   | `0x1e` | Soldiers `+2` u16, loyalty `+0x0f`, training `+0x15`, morale `+0x16` u8 |
| Factions      | `0x79148` | 21    | `0x32` | Same-capital ruler replacement; other relationships remain context      |

Population is stored in hundreds of people, capped at 30,000 stored units.
Gold is capped at 50,000 and food at 3,000,000. Soldier capacity follows the
game's allocation routine: `10000 + 100 * max(land leadership, naval leadership)`.
Loyalty and training have a maximum of 100; morale can reach 120 through the
game's battle routines. Ruler loyalty is read-only.
Direct troop-number editing excludes disbanding, recruitment and inactive armies;
those transitions involve additional state. Relocation below explicitly disbands.

City development, cultivation, irrigation, flood protection, tax and popular
loyalty use 0..100; commerce and the three weapon stocks use 0..9999. Each of
the three warship stocks uses 0..100. Five trade prices use 1..255: the game's
trade routines divide by these values without a zero guard. Food prices are
rice units per gold; weapon and horse prices are gold per unit. Development
changes do not rescale existing stocks. City links, ownership and command flags
are preserved. These offsets and bounds were checked against both reference
branches and the original game's trade, tax and equipment routines.

Historical names and leadership come from `0x4021e`, 532 records of `0x1e`
bytes. Custom officers start at `0x78004`, 68 records of `0x1c` bytes. Territory
names start at `0x44076`, 46 records of `0x1a` bytes. Names are decoded from the
user's game data, including its private glyph assignments and single-byte phonetic
reading. Unknown bytes fall back to the other name field when available. The
writable alphabet comes from the user's sorted 2,173-entry RAM index at `0x3f124`.
No extracted names, fonts or glyph repertoire are distributed. The codec enforces
three double-byte name characters or seven reading bytes, including separate
voicing marks. Semantic no-ops must preserve bytes: one character has two valid
game encodings. All 1,064 historical name/reading fields round-tripped as text in
the supplied original-game memory; synthetic fixtures cover malformed alphabets,
private codes, aliases, unsupported characters and overflow.
Name drafts survive record/tab/language changes and share one atomic publication
with numeric changes. The original game's registered-profile screen displayed a
private-glyph name, reading, changed birthday, age, gender and portrait. An in-game
save followed by a fresh native-only boot retained the complete custom record.
The optional 68-name preset reproduces the maintainer-authored name/reading list
from the later reference branch. It fills a previewable text draft, preserves
abilities and registration state, and uses the same encoding checks as manual
names. It does not create officers or publish automatically. Both language packs
carry identical game-name data so changing UI language cannot rename a character.
Numeric batches copy only explicitly changed source fields to selected records;
names and structural operations are excluded. The complete expanded draft must
pass every target's bounds, dates and eligibility before anything is published.

Six base abilities (land/naval leadership, strength, intelligence, politics and
charisma) are editable at historical offsets `+5..+10` and custom offsets
`+4..+9`, with the game's 1..100 range. The controls also support historical
officers who have not appeared yet. Recruitment capacity follows the final draft's
leadership, independent of edit order; changing abilities never silently changes
existing troops. Explicit troop edits must fit the resulting recruitment capacity.
Historical definitions live outside the native-save payload: use a checkpoint to
keep them across a fresh boot. A fresh boot with only native SRAM reloads disc
defaults. Custom abilities are inside the native payload and require in-game saving.
The original-game checkpoint test changed all six values for one historical and
one custom record, read back all twelve after acknowledged PicoDrive writeback,
and preserved the 73,728-byte native companion. The bilingual browser flow also
checks ability drafts, retained changes, failed-download recovery and troop limits.

The custom-officer tab includes all 68 definition slots, even before registration.
Gender, birthday and age have bounded fields; calendar validation checks the final
draft so month/day edits are order independent. Portrait choices use verified
creation IDs plus historical IDs backed by the game's lookup table. The `0xffff`
unregistered sentinel cannot be changed through this editor. Editing a definition
does not create a live officer or modify city lists; registration remains in-game.

Personality nibbles, compatibility, morality, lifespan category, service years
and the completed-action flag are editable for eligible live officers. Masked
writes preserve adjacent flags and equipment allocations. Lifespan uses only
bits 4..6 (0..7), not the entire high nibble shown by the old editor. It changes
the age threshold for random death checks rather than fixing a death age.
Service counters use 0..255; with a former faction, their final sum must be
1..256 because the return routine adds them and subtracts one in a byte.
Dead or battling officers stay locked, as do assigned officers' action flags.
Troop counts are also locked while weapons or ships are allocated: the game
refunds equipment using the current army size. Remove equipment through the game
before editing troops to avoid manufacturing or losing city inventory.
Historical definition traits remain separate read-only context, distinguished
from a live officer's current campaign traits. Factions expose their alliances,
hostility values, joint attack agreement and nomadic mission data as read-only
context, matching the original editor's display scope. Alliance bits follow the
game's big-endian word checks, not the legacy debugger's byte-array formatting.
Officers also show their named role, previous faction and phonetic reading.
Cities show their governor, strategist, serving/free/undiscovered counts and troop
total. These totals come from one validated list traversal per view; malformed
lists leave the scalar editor available without inventing relationship totals.

Eligible idle officers can finish recovery, set the independent 0..3 turncoat
countdown, or end covert affiliation. Recovery also clears its associated hold.
Ending infiltration removes the previous covert faction and elapsed months while
preserving the current city/faction and previous service years; it is not a return
or transfer. Unknown infiltration states remain locked. These transitions cannot
mix with structural operations or other live traits of the same officer, and
numeric batches exclude them. Death, rebellion and mission flags remain unavailable.
An original-game save and fresh native-only boot retained an editor-set turncoat
countdown; clearing it changed only its two bits. Recovery/infiltration cleanup
has instruction and synthetic-test evidence, not an observed affected-game case.

## Evidence and limits

The treasure view transfers unique items with their shared ownership table and
officer masks. Strategy books share a world limit of seven; their quantity field
is separate from unique-item bits. Claiming the hidden seal clears its discovery
marker. Event custodians and unsafe officers remain read-only. These edits preserve
base abilities; the game computes item bonuses. Original-game snapshot readback
and a fresh native-only load retained a transfer, two books and the claimed seal,
including its consumed city marker. The native roundtrip changed only 11 bytes.

The registration overlay (`0x4abc4 == 4`) exposes a separate creation-default
view after verifying both table consumers and the point-allocation instructions.
Its four six-byte rows at `0x5d0ac` select male/female and age below/at least 30.
Each ability is 1..100. The game additionally grants 90 or 70 points which must
all be allocated, so each row leaves that much room below a total of 600.
Edit before entering allocation. Registered officers are untouched. These defaults
survive checkpoint restoration but not a cold boot or reloading `SETTEI.PRG`;
merely closing its dialog does not necessarily unload the module. This extends
the original editor, whose custom-officer import only replaced names.
The original-game check displayed edited young male/female defaults, spent the
90-point grant, saved a completed officer, and restored all 24 template bytes
from a checkpoint. A native-only cold boot restored disc templates while retaining
that registered officer's abilities. Older-row selection remains instruction evidence.

The original supplied Japanese disc's first MODE1/2352 track has 4,745 sectors
and SHA-256 `ed4589ab748e0a8a5cc4796413c751e887b1a4a7536f566a67632e203f997096`.
Independent local analysis of its table access, clamps and allocation routines
established the addresses and limits. No mock-editor offsets were accepted as
game evidence. Sega's [official edition page](https://www.sega.jp/mdmini2/soft/the-three-kingdoms3.html)
distinguishes the cartridge and CD releases.

On 2026-11-22, a real sandboxed Chrome/PicoDrive session started scenario 1 from
the original disc and a separately supplied Japanese BIOS. The game's own panels
confirmed all seven fields. Changed values were saved with the in-game Save
command, then loaded in a fresh emulator session supplied only with native SRAM:
population 123400, gold 23456, food 123456, soldiers 8765, training 67, morale 78,
and loyalty 89 all survived. Private captures and disassembly are not fixtures.
Unit tests use an independently generated minimal structure.

The 2026-11-23 runtime-boundary recheck used the public snapshot read/replace
interface and all seven editable fields. PicoDrive acknowledged the load, every
edited value read back correctly, the paused state remained stable, and all
73,728 native-save companion bytes remained identical. This confirms the memory
writeback path, not parity with every feature of the local reference editor.

The constructor checks both KOEI markers, date, table references, resource limits
and overlay selector `0x4abc4 == 0` (the `UCOM.PRG` strategic module). Registration
uses the separate schema above; land combat has its own schema below. Other
overlays are rejected. None of these schemas proves the game is idle between commands:
users must return to the strategic command menu before editing. In-game panels
cache their rendering; reopen a panel to refresh it after editing. Runtime
writeback must still verify the replacement and preserve a failed update paused.

Relocation validates all reachable city/officer/faction lists before rewriting
membership. It rejects rulers, governors, assigned equipment and ongoing actions.
Arrivals serve the destination faction as civil officers, or become free officers
in a neutral city. Troops, training, morale and the action flag are cleared;
advisor references are repaired. The preview shows those effects. Raw list pointers
never become writable intents. A failed batch returns no partial result.
The original-game transfer check updated both city lists and displayed the reduced
source army/count. In-game saving and a fresh native-only load retained the new
city, faction, civil role, loyalty and cleared army statistics.

Ruler replacement selects an idle, unequipped officer already in the capital.
It preserves both armies and the capital, updates the governor and advisor links,
and gives the former ruler a military/civil role with loyalty 100. This is an
explicit editor policy, not the game's death/succession command. The original-game
UI and a fresh native-only load both retained the new ruler, roles and armies.
Relocation and ruler changes cannot share a draft or silently overwrite separate
live-trait edits on the affected officers. City ownership, arbitrary role changes,
alliances, birth/death and live officer creation remain guarded game transitions.

Appointments support qualified serving strategists, generals, military and civil
officers, plus explicit city-strategist replacement. They update the advisor link
without changing the governor, loyalty or armies. Civil conversion requires no
troops or allocated equipment. Qualification uses native base-ability checks;
treasure bonuses do not qualify an officer. Preview exposes every role/advisor
change. Four original-game transitions survived native saving and a fresh load,
preserving troops, loyalty, training, morale, city and faction in each case.

Land battle (`HEX.PRG`, overlay 1, combat mode 0) exposes remaining mobility only.
Validation checks the reviewed consumers, both army sides, faction/capital links,
unique acyclic unit chains and the selected deployed unit. The editor keeps the
legacy 0..90 range; it is not a claim about the game's native maximum. Naval
combat is not supported. Finish or cancel Move before capturing at the player's
command menu: Move caches points until it closes, and the structure cannot prove
the current UI phase. Original-game checks displayed 90, spent two on one hex,
and retained 88 after closing Move; zero returned safely to the command menu.
Memory writeback preserved all native-save bytes. These checks do not establish
persistence of battle mobility through a native save.
