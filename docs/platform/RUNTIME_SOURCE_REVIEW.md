# Runtime source and redistribution review

Reviewed 2026-11-16 against the eight SHA-512 archives in
[runtime-lock.json](../../platform/runtime-lock.json). The default complete runtime
is **not cleared for redistribution**, including noncommercial Docker images.
This review narrows the missing evidence; it is not a legal approval.

## Evidence obtained

[runtime-materials.json](../../platform/runtime-materials.json) records immutable
source revisions and SHA-256 hashes for license texts and build materials. Its
archive-set digest binds the review to the selected runtime package bytes.
The records distinguish release source, revisions embedded in binaries and a
candidate build recipe. None means a clean, reproducible native build was proved.

All 24 console archives were extracted privately: normal, threaded, legacy and
threaded-legacy variants of six cores. Every WASM contains its listed core revision
and RetroArch `6dd4353`. Each archive's `license.txt` is byte-identical to the
listed core source license; all four variants agree. Build reports contain times
and options, but no complete source/submodule/toolchain lock.

| Component | Source revision | Evidence |
| --- | --- | --- |
| js-dos 8.5.3 | `506dfd2a99f56bc4e393a716125ae94e58eb3fba` | Release source/package declaration |
| emulators 8.5.2 | `6bbf0925d221a7304ea8e0dda1e89b8dc01569b2` | Release tag and js-dos dependency |
| EmulatorJS 4.2.3 | `e150dc0491ae747028919fb82d6598954976ede6` | Release source |
| RetroArch frontend | `6dd4353937ef48b6ec0bfbdbb15d1c5992d86927` | Embedded in all 24 core binaries |
| FCEUmm | `d9d7e141274d07186b6a871ca2919b6f13cfb2f9` | Embedded core revision |
| Snes9x | `6ca2343e5f3b0acbea49ca958251e3a0af58a81d` | Embedded core revision |
| Gambatte | `4ac2b30d196a842061d6b333ea5e523a7c1a7cce` | Embedded core revision |
| mGBA | `1d9dbb1dc8d51ed744fe6be82183f7f5076e549d` | Embedded core revision |
| Genesis Plus GX | `594cdf3a666546f65f46391c3615ac5e9550bfc1` | Embedded core revision |
| PicoDrive | `3cf1e26179584fc06b4794b0b2bf5d41c01b19dd` | Embedded core revision, resolved through upstream commit API |
| EmulatorJS build | `b24e5b535034dc7c3428d76f236d4793881969b6` | Candidate recipe predating the reported builds |

The last commit before a reported build is not necessarily its source. In
particular, the Gambatte and Genesis Plus GX binaries identify older revisions.
A short embedded revision also cannot prove the absence of local build patches.

## Build materials and nested source

The pinned js-dos workflow uses Node 22, Yarn, its lockfile, the emulators npm
package and a Vite/Terser build. It also copies prebuilt File Explorer and
WebRTC-NET assets from its `public` tree. The js-dos package declares GPL-2.0 but
has no standalone license file; do not invent an upstream copyright grant.

The emulators workflow specifies Emscripten 5.0.2, CMake/Ninja and
`yarn run gulp production`. That pipeline includes DOSBox, DOSBox-X, libzip,
SDL network code, sockdrive JavaScript and GL4ES. Its exact Git dependencies are:

| Location / dependency | Pinned revision |
| --- | --- |
| `native/dosbox` (`js-dos/dosbox`) | `528578d5a6f76afd4d5ef4e722b5670826f1183a` |
| `native/dosbox-x` (`js-dos/dosbox-x`) | `788fde99d3d451eab3621009186e5abe516f2b9c` |
| `native/sokol-lib` (`floooh/sokol`) | `fa3d7cbe9ca85b8b87824ac366c724cb0e33a6af` |
| `native/sokol-tools-bin` (`floooh/sokol-tools-bin`) | `8573f3ccbb2a8d05ff5a97295f8d2c7bdc2f6065` |
| GL4ES external CMake project (`ptitSeb/gl4es`) | `a744af14d4afbda77bf472bc53f43b9ceba39cc0` |

Sokol shader tools are themselves prebuilt tools, not their preferred source.
Distinguish build-only tools from code linked into delivered binaries. Preserve
DOSBox-X as the planned Windows 95/98/ME candidate; this audit does not establish
general Win32 support.

The candidate EmulatorJS recipe specifies Emscripten 3.1.74 but pulls moving
branches and uses `git pull`. Normal core WASM producer strings include LLVM 21;
PicoDrive instead includes an LLVM 20 fork revision. Consequently this recipe
cannot yet be called the verified recipe for the shipped binaries. Pin all build
inputs and patches, including the Emscripten sysroot, before a reconstruction.

PicoDrive's recorded submodules also need their own sources/notices:

| Location | Revision |
| --- | --- |
| `cpu/cyclone` | `3ac7cf1bdeecb60e2414980e8dc72ff092f69769` |
| `pico/cd/libchdr` | `e62ac5995b1c7ef65ece35293914843b8ee57d49` |
| `pico/sound/emu2413` | `a2dfc20ff507e4fd075cd325620bcea655e2c1f7` |
| `platform/common/dr_libs` | `dd762b861ecadf5ddd5fb03e9ca1db6707b54fbb` |
| `platform/libpicofe` | `86a086ed64aadc1e87fc58a90703a07d91c9cdbe` |

## Unresolved publication blockers

1. **License compatibility of combined WASM.** The pinned
   [RetroArch link command](https://github.com/EmulatorJS/RetroArch/blob/6dd4353937ef48b6ec0bfbdbb15d1c5992d86927/Makefile.emulatorjs)
   links frontend objects and core bitcode into one output. RetroArch uses
   [GPLv3-or-later](https://github.com/EmulatorJS/RetroArch/blob/6dd4353937ef48b6ec0bfbdbb15d1c5992d86927/retroarch.c);
   Snes9x, Genesis Plus GX and PicoDrive add noncommercial restrictions.
   GPLv3 sections 10 and 12 require compatible conditions for conveying combined
   work. No applicable additional permission was found in the reviewed materials.
   Noncommercial intent alone does not resolve this combination. Obtain applicable
   permission or use a compatible core/frontend and validate that replacement.
2. **Complete corresponding source.** Core revision markers and build excerpts
   are insufficient. Include the actual preferred source, nested dependencies,
   local patches, interface definitions and build/install controls required by
   each license, with a tested reconstruction or other reliable provenance.
3. **Other shipped code and data.** Complete the file-level inventory for native
   libraries, EmulatorJS compression workers, bundled JavaScript, WebRTC-NET,
   File Explorer and its font/sprite assets. The latter's upstream offers MIT or
   LGPL, but the exact copied revision and associated notices still need binding.
4. **Release delivery.** Serve required sources and full notices alongside browser
   assets and retain them in offline bundles/images. Review base-image and server
   package obligations too. A source link to a moving branch, an unavailable
   download, or just this review file does not satisfy source delivery.

Do not publish upstream test ROMs, BIOS or unrelated binaries while collecting
source. Build source archives from reviewed inputs, retain their hashes and keep
them outside Git. A rebuilt emulator changes runtime identity: preserve old
profiles/snapshots and require an explicit migration, never silently reassign them.

Candidate replacements such as bsnes for SNES and ClownMDEmu for MD/Mega CD
require separate build, performance, save-format and browser integration checks.
Upstream feature lists are evaluation leads, not passed platform acceptance.
