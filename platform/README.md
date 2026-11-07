# Rebito

The web platform under development. See [architecture](../docs/platform/ARCHITECTURE.md)
and [status](../docs/platform/STATUS.md) for scope and verified capabilities.

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
same application. Game-library and runtime screens remain pending; consult status.

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
