# Licensing and distribution boundaries

The project's original source, documentation and original test programs use the
[AGPL-3.0-or-later license](../../LICENSE). Copyright (c) 2026 Rebito
contributors. This grant covers only work the contributors can license; it does
not relicense third-party components, compatibility identifiers or game data.

`LICENSE` contains the unmodified GNU license text for automatic recognition.
The [project notice](../../NOTICE) retains the copyright and explicit
"or any later version" grant. Both files accompany the Docker build context and
browser notices; this separation does not change the project's license.

AGPL permits commercial use. Retain copyright/license notices and provide the
corresponding source required when conveying covered versions. A modified version
that supports remote network interaction must prominently offer its corresponding
source to those users. This includes the covered modifications and required build
materials, not private account data, passwords or uploaded games. See
[AGPL sections 4-6 and 13](https://opensource.org/license/agpl-3.0).

The publication scope is project source only, with no prebuilt runtime bundles or
container releases. Noncommercial intent is not an extra clause in the project's
AGPL and does not resolve conflicting third-party terms. Existing runtime bindings
remain for compatibility research; their presence is not redistribution clearance.

## Source repository versus assembled runtime

The Git repository contains original application code, original fixture generators,
dependency locks and download/build instructions. Downloaded dependencies, emulator
archives, WASM, ROMs, BIOS, saves, reverse-engineering output and generated assets
are excluded. GitHub's source archive must contain only reviewed tracked content.

This independent source-only publication does not include the combined emulator
works identified below. Publishing our adapters and build instructions does not
grant permission to redistribute the downloaded assets or any resulting combined
work. Recheck this boundary when vendoring code, adding patches or changing linkage;
source form alone does not exempt a derivative work from license obligations.

An installed application contains more than that source archive. Browser delivery
of JavaScript/WASM transfers copies to clients; running a web service does not by
itself exempt those assets from redistribution requirements. An iframe is not a
blanket licensing exemption. Preserve applicable licenses and provide the exact
corresponding source/build materials required by each component before distributing
an assembled browser bundle or container. A link to a moving repository branch is
not evidence of corresponding source for a particular binary.

| Component | Current license boundary | Distribution consequence |
| --- | --- | --- |
| Original application and test generators | AGPL-3.0-or-later | Preserve notices and satisfy conveyance/network source obligations; commercial use permitted |
| Bundled npm frontend dependencies | Primarily MIT/ISC/BSD; exact lock reviewed separately | Preserve emitted `THIRD_PARTY_NOTICES.txt` |
| Server npm dependencies | Licenses in installed packages | Preserve package notices and applicable terms |
| js-dos / DOSBox family | GPL components; exact package composition needs source inventory | Preserve notices and satisfy corresponding-source obligations |
| EmulatorJS wrapper | GPLv3 | Preserve notices, changed-source/build materials and GPL obligations |
| FCEUmm / Gambatte | GPL components | Match source and build materials to selected binaries |
| mGBA | MPL components and bundled dependencies | Review file-level source and component obligations |
| Snes9x / Genesis Plus GX / PicoDrive | Noncommercial/component-specific terms | No blanket commercial-use permission for these runtimes |

The [runtime lock](../../platform/runtime-lock.json) identifies archives, not a
completed legal/source audit of every native build. In particular, core wrapper
version `4.2.3` is not an exact native source commit. Until the source inventory
and distribution obligations are verified, publish reviewed source only; do not
publish project-built runtime bundles or container images as cleared releases.
Local build and compatibility tests do not establish public distribution readiness.

Upstream evidence includes [EmulatorJS GPLv3](https://github.com/EmulatorJS/EmulatorJS/blob/e150dc0491ae747028919fb82d6598954976ede6/LICENSE),
[Genesis Plus GX terms](https://github.com/EmulatorJS/Genesis-Plus-GX/blob/master/LICENSE.txt)
and [PicoDrive terms](https://github.com/libretro/picodrive/blob/master/COPYING).
Inspect the exact downloaded package notices as well as upstream declarations;
dependency metadata alone cannot certify compliance.

## Fixtures and proprietary material

Tests generate original small CPU programs, synthetic discs/firmware and patterned
save files. They contain no copied commercial game, vendor BIOS or vendor logo
bitmaps. Console header identifiers and hardware handshake constants are used for
interoperability, not endorsement. Their original source uses AGPL-3.0-or-later.

The Koukai2 adapter implements an observed file layout and preserves unknown bytes.
The legacy executable, real save samples, game packages and private comparison
captures are not distributable project fixtures. No decompiled implementation is
vendored. Contributors must identify the origin and redistribution rights of new
data or code; a local file's availability is not permission to publish it.

Operators are responsible for the rights to their uploaded games, BIOS and system
images, including access they grant to other users. Do not infer redistribution
permission from age, abandonment, possession of a copy or noncommercial hosting.
