# NES cheats

The NES player has an independent live editor below the game. The player
verifies the downloaded cartridge before selecting presets by its complete
SHA-256, including the header. Titles, mapper numbers and transient RAM
contents are insufficient to identify a particular translation.

## Playing with rules

- A verified preset accepts a decimal target. Apply it in the scene where the
  value is meaningful. Adjusting the same preset replaces its earlier rule.
- Enter a single six- or eight-letter Game Genie code or a hexadecimal raw
  code such as `00FE:09`. Each session accepts up to 32 rules. Uncheck a rule
  to disable it. Changes that have already happened in-game can persist.
- Search the 2 KiB of CPU RAM for a byte, an unaligned little-endian word or
  two packed decimal digits. Take the first sample, change something in the
  game, then refine the matches. Each refinement compares the last two explicit
  samples. Selecting a word applies both bytes together.
- Use the normal player controls to save progress. Rule activation creates no
  save revision. Stored progress reflects the data the game or core writes.

## Runtime and preset validation

The bridge requires the pinned FCEUmm fingerprint. It copies CPU RAM from the
FCS state in the RetroArch container and rejects unknown versions, ambiguous
records and invalid lengths. FCEUmm applies zero-page codes periodically. Other
raw codes can change what the CPU reads while captured RAM holds a different
value. Test a named effect in the game as well as reading back its address.
See the upstream [state writer](https://github.com/EmulatorJS/libretro-fceumm/blob/d9d7e141274d07186b6a871ca2919b6f13cfb2f9/src/state.c)
and [cheat engine](https://github.com/EmulatorJS/libretro-fceumm/blob/d9d7e141274d07186b6a871ca2919b6f13cfb2f9/src/cheat.c).

To add a preset, run the exact release in a disposable session, reach a
controllable scene, record baseline RAM and the HUD, apply two test values
and check the in-game result. Repeat for every translation. Keep ROMs, saves
and captures outside the repository. Commit the release digest, bounded
setting, translations and tests.

| Game | In-game observation |
| --- | --- |
| Castlevania | Simon's HP bar in stage 1 shortened at 16 and filled at 64. Displayed HP followed actual HP. |
| Mega Man | The vertical HP bar in Cut Man's stage changed between 8 and 28. |
| Adventure Island | The first area's stamina bar changed between 4 and 15 on both the Justin and Nokoh editions. |
| Double Dragon II | In the first street P1's health bar followed the read override in the Xingkong and Ayuan editions. |
| Contra | P1's reserve-life icons changed in the first jungle stage when the counter changed from 1 to 8. |

Reference material includes the [Mega Man disassembly](https://www.bisqwit.iki.fi/jutut/megamansource/),
[Castlevania field observations](https://tasvideos.org/UserFiles/Info/638218293535388156),
[Adventure Island RAM symbols](https://github.com/cyneprepou4uk/NES-Games-Disassembly/blob/df2c8e55e7f13e5792482527db9e7c9e4a84c6e1/Adventure%20Island/bank_ram.inc),
[Double Dragon II RAM symbols](https://github.com/cyneprepou4uk/NES-Games-Disassembly/blob/df2c8e55e7f13e5792482527db9e7c9e4a84c6e1/Double%20Dragon%20II/bank_ram.inc)
and the [Contra disassembly](https://github.com/vermiceli/nes-contra-us).
