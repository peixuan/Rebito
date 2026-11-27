# NES cheats

The NES player has an independent live editor below the game. The player
verifies the downloaded cartridge before selecting presets by its complete
SHA-256, including the header. Titles, mapper numbers and transient RAM
contents are insufficient to identify a particular translation.

## Playing with rules

- Start the cartridge and choose a value under **Verified for this cartridge**.
  Switching a value replaces its whole code group. **Off** removes that rule.
  For starting values, make the selection at the title screen before starting
  a new game. Turning a rule off does not rewind changes already made in game.
- **Custom codes and tools** includes the RAM search, optional local files and
  any previously verified adjustable ranges for this cartridge.
- Enter a six- or eight-letter Game Genie code, a raw code such as `00FE:09`
  or a basic Pro Action Replay code such as `0000FE09`. The latter converts
  to the same address and value and obeys the same limits. Each session accepts
  up to 32 rules. Uncheck a rule
  to disable it. Changes that have already happened in-game can persist.
- Search the 2 KiB of CPU RAM for a byte, an unaligned little-endian word or
  two packed decimal digits. Take the first sample, change something in the
  game, then refine the matches. Each refinement compares the last two explicit
  samples. Selecting a word applies both bytes together.
- Open a local RetroArch `.cht` file to search its emulator-handled entries.
  Select a rule to enable it. Combined codes toggle as one group. Unsupported
  handlers and partially supported groups are counted and skipped. Exported
  lists carry the current cartridge digest and reopen with every rule inactive.
- Use the normal player controls to save progress. Rule activation creates no
  save revision. Stored progress reflects the data the game or core writes.

## Runtime and preset validation

The bridge requires the pinned FCEUmm fingerprint. It copies CPU RAM from the
FCS state in the RetroArch container and rejects unknown versions, ambiguous
records and invalid lengths. Boards with no extra state can end with an empty
mapper record outside the declared FCS body. Dancing Blocks and Magic Mathematic
exercised this writer behavior. FCEUmm applies zero-page codes periodically. Other
raw codes can change what the CPU reads while captured RAM holds a different
value. Test a named effect in the game as well as reading back its address.
See the upstream [state writer](https://github.com/EmulatorJS/libretro-fceumm/blob/d9d7e141274d07186b6a871ca2919b6f13cfb2f9/src/state.c)
and [cheat engine](https://github.com/EmulatorJS/libretro-fceumm/blob/d9d7e141274d07186b6a871ca2919b6f13cfb2f9/src/cheat.c).

To add a preset, run the exact release in a disposable session, reach a
controllable scene, record baseline RAM and the HUD, apply two test values
and check the in-game result. Repeat for every translation. Keep ROMs, saves
and captures outside the repository. Commit the release digest, bounded
setting, translations and tests.

The built-in choice catalog covers 138 release digests across 136 games, with
139 settings and 278 choices. Three other verified releases retain their
adjustable controls. A game upload automatically gains the applicable controls
when its exact cartridge matches. A playable release alone does not qualify.

Add choices to `src/editors/nes/catalog-data.ts` under `onTitle` if a new game
must read the value, or `inGame` for immediate changes. One setting may contain
several codes joined by `+`; keep the whole group for each choice. Add labels
to both locale catalogs. Store only independently verified code/value facts
and original labels. Never bundle a third-party cheat collection or game image.

| Game             | In-game observation                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Castlevania      | Simon's HP bar in stage 1 shortened at 16 and filled at 64. Displayed HP followed actual HP.       |
| Mega Man         | The vertical HP bar in Cut Man's stage changed between 8 and 28.                                   |
| Adventure Island | The first area's stamina bar changed between 4 and 15 on both the Justin and Nokoh editions.       |
| Double Dragon II | In the first street P1's health bar followed the read override in the Xingkong and Ayuan editions. |
| Contra           | P1's reserve-life icons changed in the first jungle stage when the counter changed from 1 to 8.    |

Additional verified settings include Mario's small and large sprites in world
1-1, Kirby's on-screen lives in Vegetable Valley, P1's reserve ships in Life
Force, and Little Mac's health bar against Glass Joe. In Ninja Gaiden, starting
stage 1-1 at 4 and 16 HP produces the corresponding health bars. Battle City's
first-stage HUD counts reserve tanks, one fewer than the total including the
tank in play. Two independently tested Chinese Contra editions also change
their reserve-life icons in the first jungle stage. Both Rescue Rangers games
display health as hearts but use different address/value encodings. Blaster
Master's tank power gauge in area 1 dropped at 24 and filled at 255. In
Metroid's starting area, energy displayed 60 and 80 when the tens value
was set to 6 and 8. This preset was verified before collecting energy tanks.

Reference material includes the [Mega Man disassembly](https://www.bisqwit.iki.fi/jutut/megamansource/),
[Castlevania field observations](https://tasvideos.org/UserFiles/Info/638218293535388156),
[Adventure Island RAM symbols](https://github.com/cyneprepou4uk/NES-Games-Disassembly/blob/df2c8e55e7f13e5792482527db9e7c9e4a84c6e1/Adventure%20Island/bank_ram.inc),
[Double Dragon II RAM symbols](https://github.com/cyneprepou4uk/NES-Games-Disassembly/blob/df2c8e55e7f13e5792482527db9e7c9e4a84c6e1/Double%20Dragon%20II/bank_ram.inc)
and the [Contra disassembly](https://github.com/vermiceli/nes-contra-us).
