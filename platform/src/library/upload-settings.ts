import { z } from "zod";
import { dosExecutablePattern } from "../domain/game-import.ts";
import { type DisplayMessage, MessageError } from "../shared/messages.ts";
import { catalogSchema } from "./catalog.ts";

export { gameUploadLimits } from "../domain/game-import.ts";
export const defaultLibraryBytes = 10 * 1024 ** 3;
const shape = catalogSchema.shape.games.element.shape;
export const gameUploadSchema = z
  .strictObject({
    title: shape.title,
    system: shape.system,
    saveFiles: shape.saveFiles,
    executable: z.string().max(240).default(""),
    arguments: z
      .string()
      .max(200)
      .regex(/^[a-zA-Z0-9 _./:+-]*$/)
      .default(""),
    cycles: z
      .string()
      .regex(/^(auto|max|[1-9]\d{0,5})$/)
      .default("auto"),
  })
  .superRefine((value, context) => {
    const entry = catalogSchema.shape.games.element.safeParse({
      title: value.title,
      system: value.system,
      saveFiles: value.saveFiles,
      file: "upload.asset",
      size: 1,
      sha256: "0".repeat(64),
    });
    const launch =
      value.system === "dos"
        ? dosExecutablePattern.test(value.executable)
        : !value.executable && !value.arguments && value.cycles === "auto";
    if (!entry.success || !launch)
      context.addIssue({ code: "custom", message: "Invalid game launch or save settings" });
  });
export type GameUploadSettings = z.infer<typeof gameUploadSchema>;

/** Only fixed, user-facing messages belong in this error; never filesystem diagnostics. */
export class LibraryError extends MessageError {
  readonly statusCode: number;
  constructor(message: DisplayMessage, statusCode = 422) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function dosConfiguration(settings: GameUploadSettings): string {
  const parts = settings.executable.split("/");
  const command = parts.pop();
  return [
    "[cpu]",
    `cycles=${settings.cycles}`,
    "[autoexec]",
    "mount c .",
    "c:",
    ...(parts.length ? [`cd ${parts.join("\\")}`] : []),
    `${command}${settings.arguments ? ` ${settings.arguments}` : ""}`,
    "",
  ].join("\r\n");
}
