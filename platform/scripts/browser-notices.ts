import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";

/** Keep license text for bundled packages after omitting build dependencies from the image. */
export async function packageNotice(directory: string): Promise<string> {
  const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  const licenses = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!licenses.length) throw new Error(`Missing browser license notice: ${metadata.name}`);
  const texts = await Promise.all(
    licenses.map(async (name) => `${name}\n${await readFile(join(directory, name), "utf8")}`),
  );
  return `${metadata.name}@${metadata.version} (${metadata.license})\n${texts.join("\n")}\n`;
}

export function browserNotices(): Plugin {
  return {
    name: "browser-dependency-notices",
    async generateBundle(_options, bundle) {
      const directories = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of Object.keys(output.modules)) {
          const path = id.replaceAll("\\", "/");
          const marker = "/node_modules/";
          const index = path.lastIndexOf(marker);
          if (index < 0) continue;
          const start = index + marker.length;
          const name = path
            .slice(start)
            .split("/")
            .slice(0, path[start] === "@" ? 2 : 1)
            .join("/");
          directories.add(path.slice(0, start) + name);
        }
      }
      const notices = await Promise.all([...directories].sort().map(packageNotice));
      if (!notices.length) throw new Error("No bundled browser dependencies were inventoried");
      const packages = await Promise.all(
        [...directories].sort().map(async (directory) => {
          const { name, version } = JSON.parse(
            await readFile(join(directory, "package.json"), "utf8"),
          );
          return { name, version };
        }),
      );
      this.emitFile({
        type: "asset",
        fileName: "BROWSER_DEPENDENCIES.json",
        source: JSON.stringify({ version: 1, packages }),
      });
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source: `Application and browser dependency notices\n\n${await packageNotice(".")}\n---\n${notices.join("\n---\n\n")}`,
      });
    },
  };
}
