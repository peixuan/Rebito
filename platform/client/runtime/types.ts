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
export interface RuntimeFileAccess {
  read(name: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Caller pauses the runtime; reject changed bytes and roll back a failed write. */
  replace(
    name: string,
    previous: Uint8Array<ArrayBuffer>,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void>;
}
export interface RuntimeHandle {
  pause(): void;
  resume(): void;
  capture(): Promise<RuntimeProgress | null>;
  stop(): Promise<void>;
  setMouseCapture?(enabled: boolean): void;
  setIntegerScaling?(enabled: boolean): void;
  files?: RuntimeFileAccess;
}
export interface RuntimeHost {
  start(launch: RuntimeLaunch): Promise<RuntimeHandle>;
}
export type RuntimeWindow = Window & { retroRuntime?: RuntimeHost };
