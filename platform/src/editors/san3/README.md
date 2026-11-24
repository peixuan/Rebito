# Romance of the Three Kingdoms III: Japanese Mega-CD memory

This adapter edits the sub-68000's 512 KiB program RAM in the supplied Japanese
Mega-CD edition. Strategic commands, officer registration and land/naval battle
use separate verified schemas. Cartridge editions, mods, raw BRAM files and
arbitrary emulator versions are outside scope. Runtime identity is checked by
the snapshot binding; administrator association alone does not verify a game.
See the [two-branch feature comparison](PARITY.md) for the exact coverage boundary.

## Use and persistence

1. Return to the strategic command menu, registration screen before allocation,
   or the player's battle command menu. Close cached information/Move panels.
2. Capture for editing. The runtime stays paused while the editor builds a draft.
3. Review the named effects, save the edits and resume. Reopen game panels to
   refresh their cached text. Failed writeback stays paused for the same revision.
4. Use the original game's Save command to persist campaign changes in native
   SRAM. An editor write preserves all 73,728 native companion bytes.

A checkpoint carries the current RAM, including temporary creation presets and
battle state. Native campaign Save serializes custom records and campaign data;
it excludes historical definitions and creation templates. Historical abilities
are therefore read-only in both the interface and edit API. Existing checkpoints
with earlier historical edits are not silently rewritten; a fresh native-save
boot restores the disc definitions.
An in-session Load can retain even unsaved historical edits in RAM. The original
game retained an unsaved second set after loading a slot, while a fresh runtime
loading only that slot's SRAM restored all six disc values. In-session retention
must not be presented as native-save persistence.

Creation and battle operations remain available with explicit temporary-state
instructions. Campaign Save includes custom definitions, but the original title
Load uses the separate registration copy instead. After a fresh native-save boot,
load the same campaign slot once more from the strategic system menu to restore
its custom definitions. This was verified with different saved and unsaved values
and identical SRAM bytes across the fresh runtime. Checkpoints already contain
the edited definitions. The creation
templates themselves reset on a cold boot or module reload. Battle-state
persistence through native saving is not established. These schemas cannot
prove the game is between commands.

## Data and controls

Guest integers are big-endian; the snapshot layer normalizes PicoDrive's
word-swapped representation before parsing. Unknown bytes remain unchanged.

| Table                  | Address   | Count / stride | Editing boundary                                                       |
| ---------------------- | --------- | -------------- | ---------------------------------------------------------------------- |
| Cities                 | `0x787c4` | 46 / `0x34`    | Resources, economy, stocks, prices, ship queues and coherent ownership |
| Live officers          | `0x79562` | 600 / `0x1e`   | Army, traits, tasks, life, membership and reviewed status transitions  |
| Factions               | `0x79148` | 21 / `0x32`    | Succession and absorption; diplomacy is context                        |
| Historical definitions | `0x4021e` | 532 / `0x1e`   | Read-only abilities and definition traits; excluded from native saves  |
| Custom definitions     | `0x78004` | 68 / `0x1c`    | Names, six abilities, birthday, age, gender and verified portraits     |
| Registration defaults  | `0x5d0ac` | 4 / 6 bytes    | Male/female, younger/older ability templates in `SETTEI.PRG`           |

Population is displayed in people but stored in hundreds, up to 30,000 units.
Gold is capped at 50,000 and food at 3,000,000. Development, cultivation,
irrigation, flood protection, tax and popular loyalty use 0..100; commerce and
weapon stocks use 0..9999. Warship stocks use 0..100. The five trade prices use
1..255 because native trading divides by them. Food prices are rice per gold;
equipment prices are gold per unit. Resource edits do not rescale other stocks.

All six custom base abilities use 1..100. Historical abilities remain visible
but cannot be edited, including through mixed drafts and batch actions. Army
capacity follows the final draft's land and naval leadership:
`10000 + 100 * max(land, naval)`. Changing custom abilities alone preserves
existing troops. Explicit recruitment must fit the resulting limit.
Soldiers can be created or disbanded for eligible idle, unequipped officers;
zero clears training/morale, and a new army starts omitted values at zero.
Training and loyalty use 0..100; morale can reach 120. Ruler loyalty is locked.
These are free editor operations, without native recruitment costs.

Personality nibbles, compatibility, morality, service counters and the completed
action flag are masked writes. Lifespan uses bits 4..6, not the old editor's
entire high nibble: it changes a random-death threshold, not a fixed death age.
Personality and both service counters remain editable for inactive, deceased,
busy and battling records in the campaign view. They do not change membership,
mission or battle flags. Service counters independently accept 0..255; native
covert return computes `(current + prior - 1) & 255`, so the game can wrap the
result. The action-completed flag has its separate command-state boundary.

Names are decoded from the user's game, including private glyphs and phonetic
reading. The writable alphabet comes from its sorted 2,173-entry RAM index at
`0x3f124`; no extracted font/name table is distributed. The codec allows three
double-byte characters or seven reading bytes, including separate voicing marks.
Equivalent text preserves the original encoding. All 1,064 historical name and
reading fields round-tripped in private original-game memory checks.

Custom slots retain the `0xffff` unregistered portrait sentinel. Editing a
definition does not register it. Calendar checks validate the final month/day
pair; portrait choices are backed by the game lookup. The optional 68-name
preset creates a previewable name/reading draft and fills all six abilities with
100, including unused slots. It preserves registration and live membership;
both languages use the same names. Batches expand explicit scalar
edits and officer relocation destinations; names and other relationship workflows
remain separate. Every selected target is validated before any change is published.

To introduce an unused custom officer, fill its name, reading, birthday, age and
abilities, preview, then choose Serving/Free/Hidden and a city on the same custom
officer page. Registration assigns the native default portrait and updates the
complete roster atomically. Ordinary registered slots can instead be scheduled
for a future automatic appearance when that scenario option is enabled. The
native annual event, direct service and subsequent ruler appointment were checked
in the original game. A cold title Load can show old or blank registration data;
the second strategic Load described above restores the campaign definitions.

## Coherent campaign operations

Structural workflows validate complete reachable lists. Workflow-specific checks
reject conflicting combinations; independent safe edits may share a draft where
explicitly supported. Preview effects are explanatory; only canonical user intents are
replayed. Any invalid request rejects the complete operation without publication.

- Governor appointments repair city ordering and strategist references. Succession
  may choose an officer from another owned city, moves the capital and refreshes
  active ruler caches. Armies survive. Leaders must hand over before leaving.
- City administration offers direct, military, production and adaptive modes.
  Military/civil governors require delegation. The executing city, battles and
  inconsistent leadership remain locked. This workflow preserves all other city
  flags and runs separately from other edits. Port capability and the hidden-seal
  discovery marker are read-only context; seal ownership uses the treasure workflow.
- City transfers move the complete serving roster and preserve armies/stores.
  A neutral city needs an explicit incoming governor, whose incoming army is
  disbanded. Abandonment releases local officers and disbands their armies.
  Current command cities and capitals need the separate succession workflow first.
- Faction absorption transfers all cities and armies, reconciles player control,
  allegiance and contracts, and demotes the former ruler. The current turn faction
  cannot be dissolved. Previews include cancelled agreements and status cleanup.
- Active factions expose Player/Computer control, including batch changes. Native
  dispatch reads the flag again; this does not reorder turns or interrupt an
  executing command. Two player flags survived original Save and a fresh
  SRAM-only Load. The sandboxed browser flow checks canonical drafts, language
  switches, actual checkpoint writeback and unchanged native companions.
- Relocation keeps same-faction armies, equipment and personal status. Governors
  and rulers can move; offices, capital chains and rosters follow automatically.
  It cancels only departing task participants. Changing faction releases the army
  and former commitments, refunds equipment to capped source stores, and previews
  losses. Empty noncurrent cities become neutral. The executing city cannot be
  emptied while native code retains its command context; battle/dead records stay
  separate. Native base abilities still determine qualified appointments.
  Capture at the normal city command menu, choose **Move to city**, preview and
  save. For a batch, select **Copy to records**, then **Copy changed fields**.
  Resume, reopen the map/list, and save inside the game. Original ordinary,
  governor and ruler moves retained their armies and full rosters after Save and
  a fresh SRAM-only Load. Invalid selections reject the entire batch.
- Service/discovery changes support civil recruitment, resignation, hidden/free
  transitions and explicit introduction of registered unappeared officers.
  Withdrawal to unappeared removes membership without rewinding appearance events;
  return treasures first. A consumed event will not repeat; use introduction later.
- Death removes membership and passes belongings to the ruler or returns them to
  the pool. Revival places a valid deceased officer in a chosen city as a free
  officer; former armies, equipment and missions are not restored.
- Global treasure transfers update the old/new owners' flags and preserve other
  officers' duplicate flags. Each officer can hold up to seven books independently;
  edits leave the native issuance counter unchanged. Death inheritance combines
  personal flags and caps received books at seven, previewing overflow loss.
  Claiming the hidden seal consumes its discovery marker. Event custodians and
  unsafe global recipients stay locked; item bonuses are game-derived.

Personal treasure checkboxes can give the same item to several officers without
changing global ownership or consuming a hidden item. Books and personal flags
support batch copying. Ordinary bonuses use personal flags; special events may
still consult global ownership. Save inside the game to retain these edits.

Resolve ongoing missions, recovery/covert activity and allocated equipment before
operations whose controls require it. Do not bypass these prerequisites with raw
pointers or flags. Malformed lists hide relationship controls while leaving safe
scalar fields readable. Expensive graph checks run for selected records only.

## Tasks, status and shipbuilding

Task kinds 0..8 have reviewed meanings: battle preparation, training, search,
development, cultivation, flood work, commerce, spying and treatment. Kind 255
cancels. Clock/result edits apply to the complete native group, including every
member's action flag. An idle officer can join a compatible same-city group;
its clock/result are copied, never silently overwritten, and groups cap at ten.
Spying remains an independent assignment with a named foreign destination.
Create a first task, then join additional officers through the group selector.

Recovery months can start, adjust or finish recovery; zero clears its hold.
Turncoat months are a separate 0..3 countdown. Covert service months are elapsed
0..7, not remaining: the next monthly update at seven attempts the native return.
An idle officer can be deployed as a free agent awaiting foreign recruitment, or
established as an insider while retaining current membership. Ending covert
affiliation preserves membership/army/prior service; it is not a return command.
A drive-tiger plan is resolved by the game's own rules and can cause casualties,
expulsion, death or ownership changes. Cancelling it does not reverse past events.

The legacy task label 9 (construction) is not an officer task. The real ship
queues share city byte `+42`: heavy/medium/light use 3/3/2 bits, allowing 7/7/3
months. Positive values create or adjust free queues; zero cancels without
completion or refund. Native monthly settlement adds two ships when a queue
reaches zero, capped at 100; ordinary initial durations are 6/4/2 months.
Controls require a player-controlled, nondelegated port with a valid roster.

## Registration and battle

Registration overlay 4 verifies the template consumers and allocation routines.
Each ability uses 1..100 while leaving room for the complete native 90-point
(under 30) or 70-point (at least 30) grant. Edit before allocation. Templates
survive checkpoints, not cold boot or reloading `SETTEI.PRG`. The maximum-defaults
button fills all four rows with 100 and disables additional allocation through
three verified instruction operands. Press Left (increase) on the allocation
screen to enter the existing confirmation path. Manual overrides remain possible.
An actual male registration completed with six 100s and retained its definition
after registration Save and a fresh SRAM-only boot; the older-age branch has
static and unit coverage. Registered officers are unaffected by template edits;
closing a dialog does not necessarily unload the module.

Battle overlay 1 validates both army sides, faction/capital relationships and
unique acyclic unit chains. Land and naval views edit troops, training, morale,
remaining mobility (reviewed legacy range 0..90) and equipment at command menus.
An equipment exchange returns old stock before taking new stock from the same
faction's source city. Weapons consume one unit per whole 100 soldiers; ships
consume one vessel. Shortages/overflow are rejected; naval exchanges require ports.
Current movement is preserved; native movement can recalculate it after an action.

City reserves expose deployment eligibility during a verified land siege.
The old 'in battle' bit also remains set after retreat: clearing it permits
redeployment, preserving losses and morale. Use native Deploy/Retreat to place
or remove units; the editor never invents coordinates or battlefield lists.
Naval/field reserves and strategically preallocated equipment are not exposed.

## Original-game evidence

Private analysis used the supplied Japanese disc, whose first MODE1/2352 track
has 4,745 sectors and SHA-256
`ed4589ab748e0a8a5cc4796413c751e887b1a4a7536f566a67632e203f997096`.
The [official edition page](https://www.sega.jp/mdmini2/soft/the-three-kingdoms3.html)
distinguishes cartridge and CD releases. Reference code supplied behavior, not
copied implementation; proprietary data and disassembly are never fixtures.

Original sandboxed Chrome/PicoDrive checks on 2026-11-22 through 2026-11-24 used
acknowledged public snapshot replacement, stable paused readback and unchanged
native companions. In-game Save followed by a fresh instance supplied only SRAM
verified campaign resources, custom records, relocation, appointments, treasures,
governors, cross-city succession, territory/faction changes, life/membership,
covert counters and ship queues. Ship clocks 1/2/3 survived cold load; the next
month completed two heavy ships, while cancelling the medium queue added none.

Native task processing confirmed shared training progression and cancellation.
Covert tests observed actual recruitment, return and drive-tiger consequences.
All four registration rows were consumed by original allocation flows; older
rows used the 70-point grant, while registered young data survived native saving.
Land/naval battle checks covered mobility, stock-balanced ship exchange and
retreat/redeployment eligibility. Army creation/disbanding was verified in the
strategic campaign. These are exercised
cases, not proof of every possible campaign event or emulator version.

Generated tests cover malformed data, atomic failure, canonical replay, draft
retention, masks and unrelated-byte preservation. Browser tests use redistributable
programs and real emulator cores; they complement, rather than replace, the
private original-game evidence. Hosted CI and deployment/save-preservation
acceptance are separate requirements for every exact published revision.
