import { readFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";

/** Non-auth flows reuse fixture sessions; the account suite exercises public login. */
export async function useSession(context: BrowserContext, name: string) {
  const sessions = JSON.parse(await readFile(".runtime-cache/e2e-sessions.json", "utf8"));
  if (!sessions[name]) throw new Error(`Missing browser fixture session: ${name}`);
  await context.addCookies(sessions[name]);
}
