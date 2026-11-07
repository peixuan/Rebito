# Server configuration

Configuration is validated before startup. Never commit a real `.env` file.

| Variable                               | Meaning                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `APP_ORIGIN`                           | Required public origin, e.g. `https://games.example.com`; no path |
| `DATABASE_URL`                         | Required PostgreSQL connection URL; keep credentials private      |
| `AUTH_SECRET`                          | Required randomly generated secret, at least 32 characters        |
| `DATA_DIR`                             | Private storage directory; defaults to `.data`                    |
| `HOST`, `PORT`                         | Listener; defaults to `127.0.0.1:3000`                            |
| `ALLOW_REGISTRATION`                   | Explicit `true` or `false`; defaults to closed registration       |
| `OIDC_DISCOVERY_URL`                   | Optional provider discovery URL                                   |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Both required when OIDC is configured                             |

Public origins and OIDC discovery require HTTPS; loopback HTTP is allowed for
local development. All three OIDC settings must be supplied together. LDAP/AD
integration uses an OIDC provider's directory federation, not application LDAP binds.

Compose reads `DATABASE_PASSWORD` for the restricted application role and
`POSTGRES_PASSWORD` for database initialization; neither belongs in source control.
`npm run configure` creates independent random values. Compose supplies
`DATABASE_URL` automatically. All-empty OIDC fields disable the optional provider.

See [deployment](DEPLOYMENT.md) for setup, account provisioning and persistence,
and [platform status](../docs/platform/STATUS.md) for verified capabilities.
