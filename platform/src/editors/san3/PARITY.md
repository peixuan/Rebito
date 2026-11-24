# Reference feature coverage

This compares meaningful gameplay operations with both supplied GameCheatKits
branches: `master` at `151071e7848943c7088c02634eb2b1dbcaa5e96d` and `master2` at
`688d076d6748ecab3d5ff9402f80179a8c5d6b62`. Reachable controls and their edit
callbacks establish legacy behavior; serializer methods alone do not.
Reference code was inspected, not copied into this implementation.

The earlier branch edits custom definitions and cities; its faction/live-officer
edit callbacks are empty. The later branch adds live officers, ruler editing,
relocation and a 68-name preset. Historical definitions are read-only in both.
Rebito replaces independent raw writes with coherent operations that preserve
native lists, ownership and related state. Full coverage below refers to those
meaningful gameplay capabilities, not unrestricted debugger writes.

## Gameplay mapping

| Area                   | Legacy control                                                           | Rebito operation                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| City resources         | Population, gold, food                                                   | All three, with native bounds and population displayed in people                                                                           |
| City economy           | Development, cultivation, irrigation, flood work, commerce, tax, loyalty | All seven without silently rescaling stocks                                                                                                |
| City stocks/prices     | Three weapons, three ships, five trade prices                            | All eleven; native caps and nonzero trade divisors                                                                                         |
| City ownership         | Independent faction field                                                | Transfer a complete serving roster; claim a neutral city with a governor; abandon a noncapital city                                        |
| Governor               | First officer in city list                                               | Explicit appointment repairs ordering and strategist links                                                                                 |
| Ruler                  | Independent ruler ID                                                     | Same-city or cross-city succession updates capital, roles and live command caches                                                          |
| Faction membership     | Raw officer/city faction fields                                          | Relocation, roster conversion, whole-city transfer or complete faction absorption                                                          |
| Six abilities          | Custom editable, historical/live displayed                               | All six historical/custom base abilities editable, including unappeared records                                                            |
| Custom profile         | Names, gender, birthday, age, portrait                                   | All fields with game encoding, calendar and verified portrait checks                                                                       |
| Name preset            | Replace 68 custom name/reading pairs                                     | Previewable draft preserving abilities and registration state                                                                              |
| Creation defaults      | No equivalent reachable control                                          | Four six-ability templates with native allocation capacity checks                                                                          |
| Current army           | Soldiers, training, morale, loyalty                                      | Existing armies, recruitment and disbanding; dependent effects previewed                                                                   |
| Personality/service    | Nibbles, compatibility, morality, lifespan, current/prior service        | Native masks and safe return arithmetic; historical traits remain context                                                                  |
| Completed action       | Raw flag                                                                 | Eligible idle officers; task operations show the dependent flag change                                                                     |
| Relocation             | Dedicated tool and independent city/faction writes                       | Validated lists, explicit disbanding, allegiance and strategist repair                                                                     |
| Officer role           | Raw 0..7 selector                                                        | Qualified appointments, civil recruitment, free/hidden conversion, introduction and withdrawal; leadership changes have dedicated controls |
| Death                  | Raw flag                                                                 | Death with list removal and inheritance; revival into a chosen city's free roster                                                          |
| Treasures              | Raw inventory mask                                                       | Unique ownership and masks together, shared book limit, seal discovery cleanup                                                             |
| Recovery               | Raw flags/counter                                                        | Start, adjust or finish recovery with associated hold handling                                                                             |
| Turncoat/covert clocks | Raw packed counters                                                      | Independent turncoat months and elapsed covert months with checked bounds                                                                  |
| Prior faction          | Independent faction field                                                | Change a valid stored affiliation; no immediate membership transfer                                                                        |
| Covert activity        | Raw status flag                                                          | Deploy a free agent, establish an insider or end affiliation while preserving current membership                                           |
| Rebellion              | Raw flag                                                                 | Establish/cancel a drive-tiger plan; native rules determine consequences                                                                   |
| Tasks                  | Raw kind, packed clock and result                                        | Start/change/cancel complete native groups, adjust clocks/results, join a compatible group and select spy destinations                     |
| Construction label     | Task label 9 and editable unknown city byte                              | Actual port ship queues; task 9 is not offered as an officer assignment                                                                    |
| Equipment              | Editable unknown allocation nibble                                       | Stock-balanced weapon/ship exchange at verified land/naval command menus                                                                   |
| Mobility               | Unrestricted live-officer byte                                           | Deployed land/naval units' remaining mobility in the reviewed 0..90 range                                                                  |
| In-battle flag         | Raw bit setter                                                           | Verified city-reserve deployment eligibility; native Deploy/Retreat maintains map placement                                                |
| Numeric batches        | Selected rows in editable dialogs                                        | Explicit scalar edits expand atomically; every target is validated                                                                         |

## Deliberate semantic boundaries

Native rules, rather than unsafe legacy input ranges, define public bounds.
Loyalty/training, lifespan bits, nonzero prices and troop capacity are examples.
Structural operations reject ambiguous or inconsistent lists. Workflow-specific
checks reject conflicting combinations; permitted independent scalar edits remain
compatible. Their derived effects are preview-only.

Leaders hand over before death, relocation, resignation or withdrawal. Active
missions and allocated equipment must be resolved where required. Withdrawn
unappeared officers leave city lists; this does not rewind event queues, years
or already consumed appearance events. A later return uses explicit introduction.
Unused custom slots require original in-game registration before introduction.

Joining a task copies its complete existing clock/result and caps the native
group at ten. Create a first task, then add idle officers. Spying remains an
individual assignment. Ship queues belong to player-controlled, nondelegated
ports; zero cancels without completing ships. Positive queues settle through
native monthly processing, not a fabricated officer construction task.

Strategic equipment allocation is left to the native selection workflow, which
can clear and charge preallocation again. Equipped armies cannot freely change
troop counts. The battle editor reconciles both old and new stocks. The old
'in battle' bit also means a reserve already deployed and withdrew; clearing
eligibility does not place that unit on the map or restore lost troops/morale.
Use native Deploy/Retreat. Naval/field reserve lists have no corresponding control.

## Context and debugger exclusions

Historical portrait, birth year, lineage and other definition traits remain
read-only, separate from live traits. Faction context includes alliances,
hostility, joint-attack and nomadic-mission fields, matching the legacy display
scope. Necessary contract cleanup during absorption/abandonment is previewed.
City totals derive from verified lists; malformed graphs omit totals rather
than inventing values. Named role, prior faction and phonetic reading remain
visible. Territory names come from the loaded game, not a distributed table.

Raw next pointers, list heads, process addresses, arbitrary unknown bytes/bits,
battle coordinates and serializer diagnostics are intentionally excluded.
They are debugger mechanics, not safe independent gameplay operations. Reviewed
operations update required links internally and preserve unknown bytes. No ROM,
BIOS, game executable, save, extracted font or private capture is distributed.

## Evidence and persistence

The editor remains based on paused program RAM. Public snapshot replacement is
acknowledged and read back; native save companions remain unchanged. Campaign
persistence requires the game's Save command. Historical definitions and creation
templates survive checkpoints but reload disc defaults on cold boot/module reload.
Registered custom records can persist in native SRAM. Battle edits were exercised
in command menus; their native-save persistence is not claimed.

Original-game acceptance includes all four creation rows, ability changes,
custom names/profile data, native-save/cold-load campaign operations, real task
monthly settlement, covert recruitment/return, ship completion/cancellation,
land/naval movement, equipment exchange and reserve redeployment. See the
[adapter guide](README.md) for exact exercised cases and limitations.

Synthetic unit tests cover masks, malformed data, canonical replay, atomic
failure and unrelated bytes. Browser flows use real cores with original generated
programs, including bilingual drafts and private revision preservation. They
are distinct from original-game checks. Complete candidate CI, deployment and
hosted save-preservation verification remain release requirements.
