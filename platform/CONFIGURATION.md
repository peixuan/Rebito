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

## OIDC and directory integration

Create a confidential OIDC client with authorization-code flow and PKCE S256.
Register exactly `<APP_ORIGIN>/api/auth/callback/oidc` as its redirect URI, with no
wildcards. The provider must support `client_secret_post`, discovery, signed ID
tokens/JWKS and the `openid profile email` scopes. Supply stable `sub`, `name` and
`email` claims. The server verifies ID-token signatures and nonce through Better
Auth; credentials and tokens never go into browser local storage.

`ALLOW_REGISTRATION=false` closes password signup. Authorized users of the configured
OIDC provider can still create their account on first login. Restrict client access
at the identity provider if only a particular group may use this application.
Automatic email-based account linking is disabled: matching an existing password
account's email does not authorize taking it over. Plan any account migration
explicitly. Do not change the configured provider to another tenant/issuer against
an existing user database without migrating its external identity bindings.

For LDAP/Active Directory, configure a provider such as Keycloak's
[LDAP federation](https://www.keycloak.org/docs/latest/server_admin/index.html#_ldap),
then connect this application to that realm's OIDC discovery endpoint. Directory
credentials, group synchronization and MFA remain with the provider. The application
does not need direct directory network access or an LDAP service-account secret.

Local logout invalidates the application session. It does not promise global logout
of every application connected to the identity provider; a subsequent login may use
the provider's existing SSO session.

Browser tests run a separate, loopback-only `oidc-provider` 9.13.3 development
fixture. They verify a real code exchange, PKCE, isolated user saves, closed
password signup, and rejection of tampered state/nonce. They do not constitute
acceptance of a particular production LDAP directory or identity-provider policy.

Compose reads `DATABASE_PASSWORD` for the restricted application role and
`POSTGRES_PASSWORD` for database initialization; neither belongs in source control.
`npm run configure` creates independent random values. Compose supplies
`DATABASE_URL` automatically. All-empty OIDC fields disable the optional provider.

See [deployment](DEPLOYMENT.md) for setup, account provisioning and persistence,
and [platform status](../docs/platform/STATUS.md) for verified capabilities.
