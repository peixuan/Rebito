# Reference feature coverage

This is a behavior comparison for the Japanese Mega-CD memory editor, not a
claim that every control from the desktop debugger is replicated. Both supplied
GameCheatKits branches were reviewed: `master` at `151071e7848943c7088c02634eb2b1dbcaa5e96d`
and `master2` at `688d076d6748ecab3d5ff9402f80179a8c5d6b62`.
Only reachable controls and their edit callbacks count as legacy features;
serializer methods alone do not establish a working UI feature.

The earlier branch edits custom definitions and cities. Its faction and live
officer edit callbacks are empty. The later branch adds live officer editing,
ruler editing, officer relocation and the 68-name preset action. Historical
definition tables are read-only in both. Their code is a behavior reference,
not implementation copied into this project.

## Editable gameplay coverage

| Area                          | Reference behavior                                                                                 | Rebito behavior                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| City resources                | Population, gold and food                                                                          | Implemented with native bounds; population is displayed in people.                                                                                                                    |
| City economy                  | Development, cultivation, irrigation, flood protection, commerce, tax and popular loyalty          | All seven fields implemented. Development does not silently rescale other values.                                                                                                     |
| City stores                   | Three weapon and three warship stocks                                                              | All six fields implemented with native caps.                                                                                                                                          |
| City prices                   | Food selling/buying and three equipment prices                                                     | All five implemented; zero is rejected because native trades divide by these values.                                                                                                  |
| Six base abilities            | Custom definitions editable; historical/live abilities displayed                                   | Implemented for all valid historical and custom definitions, including officers not yet present.                                                                                      |
| Custom definitions            | Names, six abilities, gender, birthday, age and portrait                                           | Implemented across 68 slots, with game encoding, calendar and verified portrait checks.                                                                                               |
| Name preset                   | Later branch replaces both names in all 68 custom slots                                            | Previewable name/reading draft implemented; abilities and registration state are preserved.                                                                                           |
| New-officer creation defaults | No equivalent reachable legacy control                                                             | Added four six-ability templates in the registration overlay; validates remaining allocation capacity.                                                                                |
| Current army                  | Soldiers, loyalty, training and morale                                                             | Implemented for eligible existing armies; loyalty follows the native cap and ruler loyalty is locked.                                                                                 |
| Personality and service       | Ambition, luck, composure, bravery, lifespan, compatibility, morality, current/prior service years | Implemented with native masks and service-counter invariants.                                                                                                                         |
| Completed action              | Raw completion flag                                                                                | Implemented for eligible serving officers; assigned, dead and battling officers are locked. Other native action conditions still apply.                                               |
| Officer relocation            | Dedicated tool plus unrestricted city/faction setters                                              | Coherent guarded relocation repairs membership and advisor links and previews disbanding/role changes.                                                                                |
| Faction ruler                 | Independent ruler-ID write                                                                         | Guarded same-capital replacement updates governor/list/role/loyalty/advisor state together.                                                                                           |
| Numeric batch editing         | Selected rows in editable dialogs                                                                  | Domain expansion validates every target and the complete draft atomically; names and structural operations are separate workflows.                                                    |
| Treasures                     | Raw officer inventory mask                                                                         | Unique item ownership and redundant masks update together; book quantities respect the shared seven-copy limit and seal discovery markers are consumed. Event custodians stay locked. |
| Recovery and covert status    | Raw status flags and counters                                                                      | Finish recovery, end covert affiliation without changing current faction, and edit the independent 0..3 turncoat countdown. Dependent cleanup is previewed.                           |
| Officer roles                 | Independent role setter                                                                            | Qualified same-city strategist/general/military/civil appointments maintain advisor links; explicit city-strategist replacement preserves armies and loyalty.                         |
| Mobility                      | Unrestricted live-officer byte                                                                     | Separate verified land-battle view edits deployed units' remaining mobility in the reviewed 0..90 range. Naval combat and strategic movement are excluded.                            |

The numeric bounds intentionally follow verified game behavior rather than
unsafe legacy input ranges. Examples include loyalty/training, lifespan bits,
nonzero prices and troop capacity derived from the final leadership draft.
Editing an unregistered custom definition does not create a campaign officer.
The name preset does not register officers or apply default abilities.

## Read-only context

Historical portrait, birth year, lineage, lifespan, personality and affinity are
shown as definition context, separate from the current officer's campaign traits.
Six definition abilities are editable extensions to the old read-only table.
Faction context includes ruler, aggregate resources and counts, 21 alliances,
21 hostility values, joint-attack agreement and nomadic mission fields. The
original faction dialog did not edit these diplomacy/mission fields.

Names come from the user's loaded game. No extracted game-name, portrait, font,
or item table is distributed. Territory names support city labels; the original
territory table did not have a reachable editing workflow.

City context includes governor, advisor, local troops and serving/free/hidden
officer counts, derived once from verified linked lists. Live officers expose
named role and former faction; phonetic readings remain visible beside decoded
names. Invalid lists omit derived totals rather than inventing values. Task and
opaque status diagnostics do not have the old debugger's raw-byte presentation.

## Remaining gameplay differences

These are meaningful legacy controls, not merely debugger diagnostics:

- Death/revival, rebellion, entering battle, assigning tasks and starting covert
  affiliation are not editable transitions. Arbitrary recovery/infiltration
  counters and prior-faction reassignment remain unsupported; reviewed cleanup
  operations do not imply that those reverse transitions are safe.
- Task kind, timeline and result are not editable. Changing a task byte cannot
  substitute for completing or canceling its linked campaign state.
- City ownership, non-capital governor assignment and cross-capital ruler changes
  remain unsupported. Relocation, qualified role appointments, city-strategist
  assignment and same-capital succession cover their explicitly reviewed subsets.
- Direct troop editing does not recruit or disband an army. Relocation explicitly
  disbands; other recruitment/dismissal workflows remain in the game.
- Equipment allocation was exposed as an unknown nibble in the old editor.
  Native analysis identifies weapon/ship assignments. Those assignments remain
  protected because changes must reconcile city stocks and troop allocations at
  the game's selection stage. Native testing consumed 87 horses for 8,765 troops
  and refunded them on cancellation; strategic preallocation can be cleared and
  charged again by that selector. Equipped armies therefore cannot change troop
  counts here. Allocate and remove equipment through the game's own workflow.

Future work must implement coherent operations with a preview and whole-draft
validation. Passing scalar-field tests is not evidence that these transitions
are safe. Full legacy gameplay parity must not be claimed while these gaps remain.

## Intentionally excluded debugger controls

Raw next-record pointers, city-list heads, arbitrary unknown bytes/bits, process
addresses and serializer loopback diagnostics are not public editing features.
Verified operations update necessary links internally and preserve all other
bytes. A raw pointer input is not a substitute for a safe gameplay operation.
The custom-record unknown byte and unknown territory/faction/city bytes are
preserved without exposing unverified meanings.

## Persistence and evidence boundaries

This remains a memory editor: a paused emulator checkpoint carries program RAM;
native save companions are preserved until the game itself saves. Historical
definitions and creation templates can be restored by checkpoint, but a cold
boot reloads their disc defaults. Registered custom data and campaign changes
persist through the game's native save command. See [the adapter notes](README.md)
for supported overlays, checked ranges and real-runtime acceptance evidence.

Synthetic tests cover malformed input, masks, linked-list consistency, atomic
failure and unknown-byte preservation. Original-game runtime checks complement
them; private game data and captures are not repository fixtures. Candidate CI,
deployment and preservation of hosted user saves require separate acceptance.
Recovery/covert cleanup has instruction and synthetic-test evidence, but no
runtime check on an authentic naturally affected officer. The turncoat counter
did survive original-game saving and a fresh native-only load. Older creation-row
selection has instruction evidence; the young male/female allocation flows were
tested in the game. Land-battle mobility was exercised in the original Move UI.
