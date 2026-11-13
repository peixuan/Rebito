# Engineering decisions and exceptions

Keep this file limited to decisions that affect reproducibility or verification.
Routine command output belongs in local diagnostics, not in the repository.

## 2026-11-17: Internationalization and authorized history replay

The owner requested English README instructions, English source/comments and
Chinese application text confined to language resources. Initial interface
selection follows the browser's first supported language, with English fallback
and a persisted manual override. Vue I18n provides the maintained formatter;
pure editors and services exchange stable message descriptors without importing it.
Language switches preserve drafts, selection, sort state and running emulators.

Vue I18n 11.4.20 and `@intlify/unplugin-vue-i18n` 11.2.8 are exact MIT-licensed
build inputs. Their installed license files and transitive metadata were reviewed.
Their complete generated dependency graph is retained in a dedicated lockfile
commit before the interface integration; other changed files keep the normal limit.
No existing locked package version changes. Precompiled messages keep the runtime
compiler out of the browser and preserve the current CSP. The account entry chunk
is approximately 433 KB uncompressed after editor/library code splitting.

The owner requested internationalization in the original feature sequence and
folding five publication follow-ups into their owning changes. The 2026-11-17
follow-up restores original source author/committer dates instead of replay dates.
Unsplit steps retain both dates; each split group retains its source anchor.
The owner authorized small ordering offsets for additional parts, within neighboring
source boundaries and with at least three seconds between commits. These offsets
are ordering metadata, not historical development durations. Licensing, naming
and internationalization remain retrospective changes, not claims about when those
decisions were originally made. Keep recovery references private. Any scoped
publication exception requires immediate protection restoration and verification.

## 2026-11-16: Rebito · 晚回舟

The owner selected Rebito (晚回舟) and supplied the bilingual introduction.
The README presents it from the first platform commit after the retained baseline;
this is a retrospective editorial change, not a claim about the original naming date.
Display names, package metadata and original project notices follow that name.
Compose uses the `rebito` namespace for containers, networks and default volumes;
earlier deployments must migrate both data stores explicitly. Cookie namespaces
and identity bindings remain stable so the name does not change accounts.
The AGPL body and third-party license notices are unchanged.

## 2026-11-16: AGPL source grant and complete legal text

The owner selected AGPL-3.0-or-later for original project work and source-only
publication. This decision was applied retrospectively to the first platform
commit after the retained template baseline; it is not a claim that the decision
was made on that commit's original author date. Third-party terms are unchanged.

The owner approved an exception for the complete 661-line official AGPLv3 body,
including the identical copy required by the independent Docker build context.
Source: <https://www.gnu.org/licenses/agpl-3.0.txt>, retrieved 2026-11-16.
SHA-256: `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`.
It is preserved verbatim, not reformatted or split into incomplete grants. Only
its initial introduction is exempt; the original project notice still counts.
Each complete legal text is introduced in its own commit; its exception cannot
cover unrelated files. All other handwritten changes retain the 500-line budget. The policy verifies
the complete file hash before allowing the exception. Canonical `LICENSE` files
and separately counted `NOTICE` grants are used from introduction in the new
replay. The earlier exact prefixed blob remains recognized for auditing the
original published history; neither form permits edited or repeated legal text.

## 2026-11-07: commit policy

Commits count all added and deleted lines against a 500-line limit and use a
single Conventional Commits subject. Only the approved complete legal texts or
`platform/package-lock.json` may exceed it, each in a dedicated single-file commit.

The small Git policy script implements project-specific limits without adding a
runtime dependency. It is not a replacement for formatting, lint, type, test or
dependency-security tooling. These gates are introduced with the application.

## 2026-11-07: initial application dependency lock

A minimal package and lock establish an installable npm workspace first. The
complete generated dependency graph follows in its own lockfile-only commit;
the service then declares and uses those dependencies. All intermediate npm
states support `npm ci`. Install scripts are disabled, direct versions are pinned,
and production dependency audit is a CI gate.

## 2026-11-07: identity dependency lock update

Better Auth 1.7.18, pg 8.23.1 and its type definitions add transitive dependencies
to the npm lockfile. A dedicated lockfile commit prepares the graph before the
identity integration declares these dependencies; the preceding manifest remains
installable. The implementation stays within 500 lines including all other files.
Installation scripts remain disabled.

## 2026-11-07: verify the lint preset after configuration migration

Review found that the migrated Biome config selected `none` for the lint preset.
Formatting, types and tests had run, but recommended lint rules were not active.
The config now explicitly selects `recommended`. Its sole existing finding was
the intentional rejection of control bytes in portable save paths; a local,
explained suppression retains that validation. Do not infer active lint rules
from `linter.enabled` alone when upgrading tooling.

## 2026-11-07: browser toolchain and lock update

The browser uses Vue 3.5.45, PrimeVue 4.5.5, Vite 8.3.6 and Playwright 1.65.0.
The compiler is aligned first with a small manifest/lock update. The complete
browser graph then uses a lockfile-only commit before interface integration.
TypeScript is pinned to 6.0.3 because the Vue checker uses Volar, whose declared
compiler peer range is `<7`. Both server and Vue type checks pass on this supported
combination. Biome's HTML/Vue support is enabled explicitly so template uses count
when checking imports and variables; recommended lint rules remain enabled.
PrimeVue 5 and PrimeUI themes 3 require a license key and eligibility renewal.
The project instead pins the MIT-licensed PrimeVue 4.5.5 and themes 1.2.5; do not
silently upgrade these across the license boundary.

## 2026-11-07: independent OIDC provider for browser tests

The test-only MIT-licensed `oidc-provider` 9.13.3 performs real discovery, PKCE,
code exchange, signed ID tokens and userinfo in browser integration tests. Its
generated dependency lock adds 404 lines in a dedicated preparation commit.
Both the lock update and subsequent integration stay below 500 lines separately.
The provider's deliberately permissive
development login binds to loopback and is excluded from the deployment image.

## 2026-11-13: stack and redundancy review

Reviewed application revision `bbf738a`, lockfiles, build/CI configuration, runtime
adapters, identity, catalog and save publication boundaries, and the running local
Linux containers. This is an audit record; the remediation items below have not
been applied to the application or its stored data.

### Retain the current architecture

Vue 3/PrimeVue 4 with Vite, Node 24/Fastify 5, Better Auth and PostgreSQL 18 fit the
current multi-user browser player/editor. Only the app and database are required
services. No extra cache, queue, ORM, server-side emulator or C++ bridge is needed.
The optional OIDC provider stays external; LDAP belongs behind that provider.
The earlier source-based RomM decision remains appropriate for atomic editing of
file collections; this review does not claim a new live RomM integration test.

An import graph from the browser, runtime, server and three operator CLI entrypoints
reaches all 90 production TS/Vue modules (about 8,160 lines including templates,
comments and data tables). All 13 declared production dependencies have imports;
development dependencies are accounted for by imports, CLI scripts, types or
build/test configuration. This does not prove that every exported symbol is used.
The largest UI modules are AdminLibrary (541 lines) and PlayerPanel (411 lines).
They are future extraction candidates when behavior changes, not unused modules.

Seemingly overlapping components have different jobs: js-dos runs DOS while
EmulatorJS runs consoles; PicoDrive is the verified CD path while Genesis Plus GX
handles Sega cartridges. Browser fflate and server streaming yauzl/yazl address
different memory environments. PostgreSQL transactions, the offline storage lease,
the online deletion lease and catalog publication lock protect different invariants.
Do not remove these guards merely to reduce line count. The legacy desktop tree
is a preserved local reference and is absent from the container build context.

### Findings, in recommended order

1. **Update pinned runtime images and add update detection.** The deployed image
   reports Node 24.22.2 and PostgreSQL 18.6. Node's
   [24.22.3 security release](https://nodejs.org/en/blog/release/v24.22.3) was published
   on November 11; PostgreSQL's
   [18.7 security/bug-fix release](https://www.postgresql.org/about/news/postgresql-187-1712-1616-1520-1425-and-19-rc-2-released-3442/)
   followed on November 12. The major versions remain supported. CI's npm audit
   does not cover these images or downloaded emulator binaries. Update reviewed
   digests, test the new images in isolation, and verify existing data across restart.
   Current HTTP-only app binding and private database reduce exposure; this review
   does not assert that every upstream CVE is reachable through this application.

2. **Remove frontend installation weight from the final server image.** The
   production npm install retains Vue, PrimeVue and their compiler/theme directories
   after Vite bundles the client. Those directories occupy 42,484 KiB (41.49 MiB)
   of the image's 169,360 KiB node_modules directory. There is no SSR entrypoint.
   Separate build-only declarations from server dependencies, preserve browser
   notices, and verify npm's optional peer handling with a clean production install.
   The measured directory size is not a promised image-layer saving.

3. **Narrow the DOS asset set.** The player fixes `backend: "dosbox"` with
   `backendLocked: true`, but recursive package copying deploys eight
   `wdosbox-x*` files totaling 26,547,248 bytes (25.32 MiB), including debug/JSPI
   variants. They are unused by the current adapter. Build a tested asset allowlist
   into a clean output directory; retain notices and the actual DOS worker/WASM
   path. Console legacy/thread variants need browser-compatibility evidence before
   removal and are not counted as confirmed redundancy here.

4. **Give developer caches a retention policy.** The local Docker inventory reports
   4.437 GB of build cache, of which 3.767 GB is reclaimable. This is developer
   build storage, separate from saved games and runtime memory. Image and cache
   figures can overlap; do not add their reported reclaimable totals. No images,
   caches or volumes were pruned during review. Data-volume cleanup remains governed
   by the storage operations document, never by a broad Docker volume prune.

### Dependency maintenance and review limits

`npm audit --json` reports zero known vulnerabilities across its 280 locked package
records; the license metadata gate passes. Better Auth 1.7.18 is outside the
affected range of [GHSA-9hm7-xhfp-cx58](https://github.com/better-auth/better-auth/security/advisories/GHSA-9hm7-xhfp-cx58).
Newer patch versions exist and need normal update review; a clean npm audit is not
an OS/container/WASM vulnerability scan or a proof of application security.

Keep TypeScript 6 with the pinned Volar peer requirement `<7`; npm's newer major
alone does not justify upgrading. PrimeVue 4.5.5 and themes 1.2.5 remain MIT in the
installed package metadata. Runtime noncommercial/source-distribution obligations
and the project's own license are still release work described in DEPENDENCIES.md.
Private local acceptance does not certify an unrestricted public binary release.

Tests and measurements in this review concern the current single-host deployment.
No high-concurrency benchmark, public deployment assessment or new emulator/version
compatibility claim is made. Read-only container inspection did not restart the
user's app or database; browser tests use disposable synthetic libraries/databases.

Verification: on Windows Node 26.13.0, `npm run check` passes lint, both type checks,
all 292 unit/integration tests and the production build. Coverage is 97.99% lines
and 92.28% branches. The complete 41-test browser suite passes with Chrome's sandbox
enabled, including ownership, OIDC failures, DOS editing/conflicts, console/CD
native/state restoration and administrator lifecycle operations. `node
scripts/dependency-policy.mjs` passes all 280 lock records. The current deployed
app's readiness endpoint returns 200. No new container build or upgraded-image
acceptance was performed; the two image updates remain open findings.

## 2026-11-13 production dependency separation

Vue, PrimeVue and themes are client build inputs; the server has no SSR entrypoint.
Moving them to development dependencies alone was insufficient: Better Auth's
optional peer declarations reinstalled Vue and its compiler. A clean runtime
install now uses `--omit=dev --omit=optional`. No dependency versions changed.
The Vite plugin copies full root license/notice files for modules actually included
in browser chunks to `THIRD_PARTY_NOTICES.txt`; absent files stop the build.
Server dependency notices remain in their installed packages. This does not replace
the separate emulator source/distribution review.

Measured inside the previous and new Linux images: `node_modules` decreased from
169,360 to 50,148 KiB, a 116.42 MiB reduction. The 13,469-byte notice artifact is
served successfully; `dist` increased from 60,216 to 60,232 KiB. These are directory
measurements, not a claim about compressed downloads or shared Docker layers.
The image guard checks absent UI/compiler directories and retained notices, and
the existing container smoke checks their HTTP delivery.

Verification: 294 unit/integration tests, lint/types/build, 41 sandboxed Chrome
tests and the 280-record dependency policy pass. The actual Node 24.22.3 Linux
image passes isolated account/session/save persistence acceptance before and after
app/database restart. The deployed Mega CD game passes read-only control/remapping
and narrow-layout acceptance without browser errors or changed history. Existing
game/save hashes and all pre-upgrade revision metadata remain intact. Restore-drill
and image-smoke containers/volumes were removed; the private backup is retained.
