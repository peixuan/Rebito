import type { ProgressKind, RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";
import type { Locale } from "../locale-preference.ts";

export interface RuntimeFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}
export interface RuntimeProgress {
  kind: ProgressKind;
  files: RuntimeFile[];
  runtime?: RuntimeIdentity;
}
export interface RuntimeLaunch {
  locale?: Locale;
  game: Game;
  profileId: string;
  gameBytes: Uint8Array<ArrayBuffer>;
  progress: RuntimeProgress | null;
}
export interface RuntimeHandle {
  pause(): void;
  resume(): void;
  capture(): Promise<RuntimeProgress | null>;
  stop(): Promise<void>;
}
export interface RuntimeHost {
  start(launch: RuntimeLaunch): Promise<RuntimeHandle>;
}
export type RuntimeWindow = Window & { retroRuntime: RuntimeHost };
