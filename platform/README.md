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

The identity API supports local registration/login/logout and current-session
lookup. Registration is disabled by default. Game-library and browser screens
remain pending; see the status document for the current acceptance boundary.

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
