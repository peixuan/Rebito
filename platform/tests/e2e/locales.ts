import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../client/locales/zh-CN/", import.meta.url);
const messages: Record<string, string> = {};
for (const file of readdirSync(root, { recursive: true })) {
  if (typeof file === "string" && file.endsWith(".json"))
    Object.assign(
      messages,
      JSON.parse(readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8")),
    );
}

/** Read expected Chinese labels without embedding translated text in test code. */
export function chinese(key: string): string {
  const value = messages[key];
  if (!value) throw new Error(`Missing Chinese test label: ${key}`);
  return value;
}
