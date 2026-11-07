import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const settings = [
  "APP_ORIGIN=http://localhost:3000",
  `AUTH_SECRET=${randomBytes(32).toString("hex")}`,
  `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}`,
  `DATABASE_PASSWORD=${randomBytes(32).toString("hex")}`,
  "ALLOW_REGISTRATION=false",
  "",
].join("\n");

try {
  await writeFile(".env", settings, { flag: "wx", mode: 0o600 });
  console.log("Created private .env. Review APP_ORIGIN before deploying.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.error("Refusing to overwrite the existing .env.");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
