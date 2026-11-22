# Rebito · 晚回舟

晚回舟（Rebito）是一個可在線遊玩經典遊戲的開源網站。其名取自李清照《如夢令》中的「興盡晚回舟」，寄意於溪亭日暮、藕花深處的一場舊日歡遊；Rebito 源於拉丁語，意為「返回」，與「回舟」相應。光陰自去，舊趣猶存。方寸屏間，自有一隅少年天地：故曲重聞，舊局再啟，昔年意氣，仍可於指間重拾。願君暫歇塵勞，循舊徑，訪舊遊，盡一晌清歡；待到興盡，便載今日歡喜，從容回舟。

Rebito (晚回舟) is an open-source website for playing classic games online.
Its Chinese name is drawn from Li Qingzhao’s lyric *Ru Meng Ling*—“Our revels over,
we rowed home at dusk”—evoking an outing remembered with delight: the streamside
pavilion at dusk, the boat deep among lotus blossoms. Rebito itself comes from a
Latin verb meaning “to return,” echoing that homeward journey. Time flows on; old
joys endure. A small screen holds a corner of the world we knew in youth: familiar
melodies return, old games begin anew, and the spirit of those days is once more
within reach. Lay aside the cares of the day, follow familiar paths, revisit old
adventures, and savor a little quiet joy. When you have played to your heart’s
content, carry today’s happiness with you as you row gently home.

Name sources: [Li Qingzhao's Ru Meng Ling](https://zh.wikisource.org/zh-hans/如夢令_(李清照)/如夢令_(常記溪亭日暮)) ·
[Latin: rebito](https://www.latin-english.com/latin/rebito/)

Games run on players' devices. The server handles authentication, the game library,
save revisions and optional game-specific save editors.

## Features and scope

- Play DOS, FC/NES, SFC/SNES, GB, GBA, Sega MD/Genesis, Master System, Game Gear
  and Mega CD/Sega CD in one page. Administrators supply games and any required BIOS.
- Administrators can upload games, configure launch commands and save files, edit
  configurations, and review the impact before deleting games and related data.
- Saves are private to each account. Revision checks, bounded queuing and safe
  retries protect concurrent saves; conflicts preserve local progress.
- DOS supports groups of native save files. Consoles support battery saves and
  snapshots provided by their emulator core.
- Uncharted Waters II (Koukai2) is the first game-specific editor, not a universal
  save format for the platform. Original DOS Heroes of Jin Yong also has character,
  martial-art and inventory editing; MODs and remakes are outside its scope.
- English and Simplified Chinese interfaces follow the browser's language on first
  use, fall back to English, and remember manual language changes.

This is an early-stage project. Support for a system does not mean every game has
been verified; snapshots depend on the same game and emulator versions. Windows
games, persistent offline upload queues and automatic save-history collection are
not implemented. See [verified scope](docs/platform/STATUS.md) and
[save recovery behavior](platform/SYNCHRONIZATION.md).

## Run locally

Install Docker Engine or Docker Desktop, Compose v2, and Node.js 24 or 26.

```sh
cd platform
node scripts/configure.mjs
docker compose up -d --build --wait
```

Open <http://localhost:3000>. Initial configuration generates independent random
secrets. Registration is disabled by default, and there are no built-in credentials.
Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` before deployment to create
the initial administrator; the email is the sign-in name. Restarts preserve existing
accounts and passwords. Follow the [deployment guide](platform/DEPLOYMENT.md), then
import games you are entitled to use through the administrator page.

The build downloads pinned emulator assets. Their licenses differ from the project's
own code; see below. Internet-facing deployments need an HTTPS reverse proxy and a
correct `APP_ORIGIN`.

PostgreSQL holds accounts and revision metadata. Game and save files reside in
persistent volumes. Do not run `docker compose down --volumes` against a real
deployment. See [operations](platform/OPERATIONS.md) for backups, recovery, capacity
and deletion. The [five-user capacity test](docs/platform/CAPACITY_SAVE_QUEUE.md)
used local limits of 2 CPUs and 2 GiB; it does not replace network and disk tests on
your target cloud server.

## Development and contributions

The stack is TypeScript, Vue, Fastify and PostgreSQL. Emulators reuse js-dos and
EmulatorJS. Platform services, emulator adapters and pure save transformations
are separate; see the [architecture](docs/platform/ARCHITECTURE.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[development setup](platform/README.md) first. Quality gates cover formatting,
types, unit tests, real-database integration, browser tests with Chromium's sandbox
enabled, and container persistence. Commits must be independently reviewable,
follow Conventional Commits and contain no more than 500 handwritten added and
deleted lines. [The source review](docs/platform/OPEN_SOURCE_REVIEW.md) records
the scope and results of final-tree and per-commit checks.

## Licensing and game content

Original source, documentation and test programs in this repository use
[AGPL-3.0-or-later](LICENSE). AGPL permits commercial use subject to its copyright,
license and corresponding-source obligations. Modified versions offered over a
network must prominently offer their corresponding source to users of that service.
This project publishes source only, not precompiled runtime bundles or Docker images.

Third-party components retain their own licenses. The project's AGPL grant does
not remove their restrictions. The following selected cores contain noncommercial
terms; without separate authorization from the relevant rights holders, they must
not be used in commercial products or activities:

| Core | Current use | Upstream terms |
| --- | --- | --- |
| Snes9x | SFC / SNES | [Noncommercial terms](https://github.com/EmulatorJS/snes9x/blob/6ca2343e5f3b0acbea49ca958251e3a0af58a81d/LICENSE) |
| Genesis Plus GX | MD, Master System, Game Gear | [Noncommercial and component terms](https://github.com/EmulatorJS/Genesis-Plus-GX/blob/594cdf3a666546f65f46391c3615ac5e9550bfc1/LICENSE.txt) |
| PicoDrive | Mega CD / Sega CD | [Noncommercial and component terms](https://github.com/EmulatorJS/picodrive/blob/3cf1e26179584fc06b4794b0b2bf5d41c01b19dd/COPYING) |

**Free-of-charge, noncommercial use does not automatically resolve incompatible
licenses.** Current builds link RetroArch (GPLv3) and these noncommercial cores into
the same WASM. Additional authorization covering that combination has not been
confirmed. Build scripts download these assets from upstream; download URLs do not
confer redistribution permission through this project, and these combinations must
not be treated as approved release bundles. Public deployments also deliver
JavaScript and WASM copies to browsers, so distribution and corresponding-source
obligations still apply. See [licensing](docs/platform/LICENSING.md) and the
[runtime source review](docs/platform/RUNTIME_SOURCE_REVIEW.md) for evidence and limits.

The repository supplies no commercial games, vendor BIOS, system images, game saves
or legacy editor executable. Tests generate original minimal programs and synthetic
saves at runtime. Do not attach game files you cannot redistribute to issues, pull
requests or releases. Game names identify compatibility only; this project is not
affiliated with game publishers or console manufacturers.

See [support](SUPPORT.md) for usage questions. Report security issues privately
under the [security policy](SECURITY.md).
