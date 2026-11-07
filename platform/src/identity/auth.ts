import { type BetterAuthOptions, betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Pool } from "pg";
import type { ServerConfig } from "../server/config.ts";

/** Keep credential, session and OIDC protocols inside the maintained auth library. */
export function identityOptions(config: ServerConfig, database: Pool) {
  return {
    appName: "Rebito",
    baseURL: config.origin,
    secret: config.authSecret,
    database,
    trustedOrigins: [config.origin],
    logger: {
      level: "warn",
      // Upstream diagnostics may include OAuth state, tokens or user-supplied data.
      log(level, message) {
        const event = message.startsWith("Failed to parse state")
          ? "invalid_oauth_state"
          : message.includes("id_token failed verification")
            ? "invalid_id_token"
            : "identity_diagnostic";
        console.error(JSON.stringify({ component: "identity", level, event }));
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.allowRegistration,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: {
      // Explicitly retain production origin/CSRF checks in integration tests too.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ["x-retro-client-ip"] },
      cookiePrefix: "retro",
      useSecureCookies: config.origin.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    plugins: config.oidc
      ? [
          genericOAuth({
            config: [
              {
                providerId: "oidc",
                ...config.oidc,
                scopes: ["openid", "profile", "email"],
                pkce: true,
                requireIdTokenVerification: true,
              },
            ],
          }),
        ]
      : [],
  } satisfies BetterAuthOptions;
}

export function createAuth(config: ServerConfig, database: Pool) {
  return betterAuth(identityOptions(config, database));
}

export type Identity = ReturnType<typeof createAuth>;
