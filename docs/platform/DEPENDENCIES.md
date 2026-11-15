# Dependency policy

Run `node scripts/dependency-policy.mjs` from the repository root. CI checks all
locked npm packages, including transitive, development and optional native builds.
Unknown, absent and custom license metadata stops the gate for a human review;
do not add an expression merely to make an upgrade pass. This metadata gate does
not replace reading changed license files or preserving their required notices.

The initial reviewed set is MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
BlueOak-1.0.0, MPL-2.0 and the exact dual expression MIT OR Apache-2.0. The MPL
packages are unmodified Lightning CSS build tools. The final application image
retains production dependencies with their license files; build tools stay in
the builder image. Vue, PrimeVue and PrimeUI themes are build dependencies: their
bundled browser code is served from `dist/client`, not server `node_modules`.
The runtime installation omits optional dependencies as well, preventing Better
Auth's optional UI peers from reinstalling Vue and its compiler. Container CI
checks that these directories and TypeScript are absent.

The Vite build inventories bundled npm modules and emits their full license/notice
files as `dist/client/THIRD_PARTY_NOTICES.txt`, served at `/THIRD_PARTY_NOTICES.txt`.
Missing notice files fail the build. Keep this artifact with browser releases;
emulator notices and corresponding-source obligations remain separate below.

PrimeVue is pinned to MIT-licensed 4.5.5 and PrimeUI themes to 1.2.5. Their newer
major versions require a key and recurring eligibility confirmation. Do not
remove license enforcement, or upgrade across that boundary without a decision.

Vue I18n 11.4.20 and its Vite plugin `@intlify/unplugin-vue-i18n` 11.2.8 use MIT
licenses. Both are build dependencies; the browser uses the runtime-only library
and precompiled messages, with no runtime message compiler or CSP relaxation.
The browser notice inventory includes bundled Intlify modules; the plugin and its
compiler remain build tools. Editor catalogs load with the editor rather than the
account page. Review their exact lockfile changes and licenses on upgrades.

Emulator assets are outside npm's lockfile. Their exact versions, hashes, source
locations and notices require a separate runtime inventory before distribution.
Game assets are supplied by the operator and never included in this repository
or application image. Original project code uses AGPL-3.0-or-later; dependency and runtime
licenses remain separate. See [distribution boundaries](LICENSING.md).

Administrator DOS imports use yauzl 3.4.0 and yazl 3.3.1 for lazy ZIP reading and
streamed rewriting, instead of a custom archive parser or whole-archive buffering.
Their MIT licenses, pend's MIT license and buffer-crc32's MIT license were reviewed;
the pinned type packages are development-only. File-size limits, portable paths,
case collisions, special files, encryption and CRC checks remain application gates.

Sega integration reuses the pinned `@emulatorjs/core-genesis_plus_gx` 4.2.3 archive;
its actual `.data` archive's `license.txt` was reviewed on 2026-11-09. The core
prohibits commercial use/sale, requires retained notices and requires complete
component source for modified redistribution. Bundled components have additional
terms, including Nuked OPN2 under LGPL 2.1 or later. These core-level terms do not
clear its combination with RetroArch or establish an OSI license. Preserve the
entire notice file and fulfill source obligations before public binary releases.
The core binary is unmodified; no new npm dependency or service was introduced.
See the [core license](https://github.com/EmulatorJS/Genesis-Plus-GX/blob/master/LICENSE.txt)
and [runtime inventory](../../platform/RUNTIMES.md).

Mega CD uses unmodified PicoDrive 4.2.3. Its bundled `license.txt` was reviewed
on 2026-11-11: noncommercial redistribution, retained notices and complete source
for modified redistribution. The same release obligations apply; this is not an
OSI-approved license. No vendor BIOS is distributed. EmulatorJS's old warning
links to [issue 579](https://github.com/EmulatorJS/EmulatorJS/issues/579); actual
browser acceptance, rather than that warning or a feature list, gates this binding.
