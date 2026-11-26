# Rebito

Browser gaming with private, versioned cloud saves and server-side game editors.
See [architecture](../docs/platform/ARCHITECTURE.md) and
[status](../docs/platform/STATUS.md) for scope and verified capabilities.
Start with [container deployment](DEPLOYMENT.md) for installation, accounts and
game imports, or the development setup below.

Requires Node.js 24 or newer (supported LTS recommended) and npm.

```sh
cd platform
npm ci --ignore-scripts
```

Configure the required variables in [CONFIGURATION.md](CONFIGURATION.md), then
run `npm run dev`, or `npm run build && npm start` for the compiled service.
Startup migrates the authentication schema before accepting requests.
`/health/live` checks the process; `/health/ready` also checks PostgreSQL.

The browser login shell supports registration when explicitly enabled, login,
logout and session recovery. The UI is built into `dist/client` and served by the
same application. The game library supports private profiles, file imports,
downloads and history restoration. See [LIBRARY.md](LIBRARY.md) for game assets.
DOS, NES, SNES, GB and GBA run on the same page with cloud-save publication and
revision checks. The Koukai2 editor provides eight modules, compact bounded inputs,
sortable tables and multi-slot edits. The original DOS Heroes of Jin Yong editor
adds characters, learned martial arts and inventory/silver, with three native save
files and unchanged companion files; see [editor verification](EDITORS.md).
The [NES live editor](NES-CHEATS.md) offers cartridge-specific presets, RAM
search, Game Genie codes and portable RetroArch cheat files from the player.
Console snapshots retain emulator state and native battery saves when available;
games without battery saves can use snapshots. A runtime upgrade may require
importing a native save instead of loading an old snapshot. Back up before upgrades.

For DOS, save inside the game, then use **Synchronize and refresh** to read the running game's
files, publish a revision and refresh the editor/history. When no game is running,
**Refresh saves** reloads server history only. **Stop game** publishes progress before
closing; a failed synchronization retains the paused runtime for retry. Closing
the browser or navigating away is not a replacement for synchronization. Pending
editor drafts survive a new game revision and require an explicit reload.

DOS also checks declared native saves about every 30 seconds and publishes only
when their contents or membership change. This synchronizes files already written
by the game; it does not invoke the game's save command or capture DOS game RAM.
Returning to the library and signing out synchronize first and stay in the workspace
if saving fails. Closing/reloading a running game prompts before leaving. Browser
timer throttling, forced termination and power loss can still lose work after the
last successful synchronization; this is not an offline backup guarantee.
See [synchronization and conflict recovery](SYNCHRONIZATION.md) for multi-file
consistency, keeping both conflict branches, retries and compatibility boundaries.

Saving an editor change while DOS is running now pauses briefly, replaces only
the edited native file group and resumes the same instance. **Load that save inside
the game** to apply its values; running game memory does not change automatically.
If the game has saved since the last synchronization, use **Synchronize and refresh** first and
reload the editor before editing again. A failed writeback keeps the runtime paused
and offers **Retry edit synchronization**, reusing the published revision without publishing twice.

For browser development run `npm run dev:web` alongside the configured API.
Set the API's `APP_ORIGIN=http://127.0.0.1:5173` to the browser's Vite origin;
the API still listens on port 3000. Use that exact browser URL for CSRF checks.
`npm run typecheck` checks server TypeScript and Vue templates. `npm run test:e2e`
uses a disposable database and compiled UI; run `npm run build` first. Install its
browser with `npx playwright install chromium`, or set `PLAYWRIGHT_CHANNEL=chrome`
to test an installed Chrome. CI uses Chrome stable on Ubuntu 24.04, installed
through Playwright at the system path supported by Ubuntu's AppArmor policy.
Downloaded Chromium builds can fail before any test with `No usable sandbox`;
see [Chromium's explanation](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
Browser tests explicitly enable Chromium's sandbox and check the actual launch
arguments. Manual Playwright sessions must also use `chromiumSandbox: true`;
ordinary browser launches should use the browser's default sandbox. Do not add
`--no-sandbox` to make a feature or test work. Test hosts must support sandboxed
Chromium execution; fix their configuration if startup fails.

## Integration database

The full check suite requires a disposable PostgreSQL service. Each integration
suite creates and drops its own randomly named database; never point `PG_TEST_URL`
at a production account. The test compose file uses a loopback-only port and
temporary storage with a deliberately public test password.

```sh
docker compose -f compose.test.yaml up -d --wait
export PG_TEST_URL=postgresql://retro_test:integration-test-only@127.0.0.1:55432/retro_test
npm run check
docker compose -f compose.test.yaml down
```

In PowerShell use `$env:PG_TEST_URL = 'postgresql://...'` instead of `export`.
