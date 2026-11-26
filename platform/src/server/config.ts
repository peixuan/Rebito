import { resolve } from "node:path";
import { z } from "zod";
import { defaultLibraryBytes } from "../library/upload-settings.ts";
import { type StorageLimits, storageLimitSchema } from "../storage/limits.ts";
import { defaultSiteLimits, type SiteSaveLimits, siteLimitSchema } from "../storage/site-quota.ts";

export interface ServerConfig {
  readonly origin: string;
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly dataDirectory: string;
  readonly host: string;
  readonly port: number;
  readonly allowRegistration: boolean;
  readonly storageLimits: StorageLimits;
  readonly minimumFreeBytes: number;
  readonly adminUserIds: readonly string[];
  readonly siteSaveLimits: SiteSaveLimits;
  readonly maximumLibraryBytes: number;
  readonly initialAdmin?: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  };
  readonly oidc?: {
    readonly discoveryUrl: string;
    readonly clientId: string;
    readonly clientSecret: string;
  };
}

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, key: string): string {
  const value = environment[key];
  if (!value?.trim()) throw new Error(`${key} is required`);
  return value;
}

/** Only loopback development endpoints may use plaintext HTTP. */
function webUrl(value: string, label: string): URL {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) {
    throw new Error(`${label} requires HTTPS (HTTP is allowed on loopback only)`);
  }
  return url;
}

export function loadConfig(environment: Environment): ServerConfig {
  const origin = webUrl(required(environment, "APP_ORIGIN"), "APP_ORIGIN");
  if (origin.pathname !== "/" || origin.search) throw new Error("APP_ORIGIN must be an origin");
  const databaseUrl = required(environment, "DATABASE_URL");
  if (!["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  const authSecret = required(environment, "AUTH_SECRET");
  if (authSecret.length < 32) throw new Error("AUTH_SECRET needs at least 32 random characters");
  const port = Number(environment.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid");
  const registration = environment.ALLOW_REGISTRATION ?? "false";
  if (!["true", "false"].includes(registration)) {
    throw new Error("ALLOW_REGISTRATION must be true or false");
  }
  const minimumFreeBytes = Number(environment.MIN_FREE_DISK_BYTES ?? 1024 ** 3);
  if (!Number.isSafeInteger(minimumFreeBytes) || minimumFreeBytes < 0)
    throw new Error("MIN_FREE_DISK_BYTES must be a nonnegative safe integer");

  const oidcKeys = ["OIDC_DISCOVERY_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const;
  const oidc = oidcKeys.some((key) => Boolean(environment[key]))
    ? {
        discoveryUrl: webUrl(required(environment, oidcKeys[0]), oidcKeys[0]).href,
        clientId: required(environment, oidcKeys[1]),
        clientSecret: required(environment, oidcKeys[2]),
      }
    : undefined;
  const administratorKeys = ["INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD", "INITIAL_ADMIN_NAME"];
  let initialAdmin: ServerConfig["initialAdmin"];
  if (administratorKeys.some((key) => Boolean(environment[key]))) {
    const parsed = z
      .object({
        email: z.email().max(254),
        password: z.string().min(12).max(128),
        name: z.string().min(1).max(100),
      })
      .safeParse({
        email: environment.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),
        password: environment.INITIAL_ADMIN_PASSWORD,
        name: environment.INITIAL_ADMIN_NAME?.trim() || "Administrator",
      });
    if (!parsed.success)
      throw new Error(
        "Initial administrator requires a valid email, a 12-128 character password and a name of at most 100 characters",
      );
    initialAdmin = parsed.data;
  }
  return {
    origin: origin.origin,
    databaseUrl,
    authSecret,
    dataDirectory: resolve(environment.DATA_DIR ?? ".data"),
    host: environment.HOST ?? "127.0.0.1",
    port,
    allowRegistration: registration === "true",
    minimumFreeBytes,
    siteSaveLimits: siteLimitSchema.parse({
      bytes: Number(environment.MAX_TOTAL_SAVE_BYTES ?? defaultSiteLimits.bytes),
      revisions: Number(environment.MAX_TOTAL_REVISIONS ?? defaultSiteLimits.revisions),
    }),
    maximumLibraryBytes: z
      .number()
      .int()
      .min(1)
      .max(1024 ** 4)
      .parse(Number(environment.MAX_LIBRARY_BYTES ?? defaultLibraryBytes)),
    adminUserIds: z
      .array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/))
      .max(100)
      .parse(
        (environment.ADMIN_USER_IDS ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    storageLimits: storageLimitSchema.parse({
      profiles: Number(environment.MAX_PROFILES_PER_USER ?? 100),
      revisions: Number(environment.MAX_REVISIONS_PER_USER ?? 2000),
      bytes: Number(environment.MAX_SAVE_BYTES_PER_USER ?? 2 * 1024 ** 3),
    }),
    ...(oidc ? { oidc } : {}),
    ...(initialAdmin ? { initialAdmin } : {}),
  };
}
