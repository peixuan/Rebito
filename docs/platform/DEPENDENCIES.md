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
the builder image. Browser dependency notices must accompany release artifacts.

PrimeVue is pinned to MIT-licensed 4.5.5 and PrimeUI themes to 1.2.5. Their newer
major versions require a key and recurring eligibility confirmation. Do not
remove license enforcement, or upgrade across that boundary without a decision.

Vue I18n 11.4.20 and its Vite plugin `@intlify/unplugin-vue-i18n` 11.2.8 use MIT
licenses. Both are build dependencies; the browser uses the runtime-only library
and precompiled messages, with no runtime message compiler or CSP relaxation.
Preserve notices for bundled Intlify modules; the plugin and its compiler
remain build tools. Editor catalogs load with the editor rather than the
account page. Review their exact lockfile changes and licenses on upgrades.

Emulator assets are outside npm's lockfile. Their exact versions, hashes, source
locations and notices require a separate runtime inventory before distribution.
Game assets are supplied by the operator and never included in this repository
or application image. Original project code uses AGPL-3.0-or-later; dependency and runtime
licenses remain separate.
