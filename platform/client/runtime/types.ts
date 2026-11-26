import type { ProgressKind, RuntimeIdentity } from "../../src/domain/artifacts.ts";
import type { Game } from "../../src/library/catalog.ts";
import type { DisplayText } from "../../src/shared/messages.ts";
import type { Locale } from "../locale-preference.ts";
import type { RuntimeSnapshotAccess } from "./snapshot-edit.ts";
import type { TouchInput } from "./touch-input.ts";

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
  /** Caller keeps the runtime paused until the whole batch succeeds or rolls back. */
  replace(files: readonly RuntimeReplacement[]): Promise<void>;
}
export interface RuntimeReplacement extends RuntimeFile {
  previous: Uint8Array<ArrayBuffer>;
}
export interface RuntimeControl {
  button: DisplayText;
  key: DisplayText;
}
export interface RuntimeControls {
  /** Immediately reports player one's bindings; unsubscribe before discarding the view. */
  watch(listener: (bindings: RuntimeControl[]) => void): () => void;
  configure(): void;
}
export interface RuntimeHandle {
  touch?: TouchInput;
  /** Explicit user handoff only; background resume must not steal editor focus. */
  focus?(): void;
  pause(): void;
  resume(): void;
  capture(): Promise<RuntimeProgress | null>;
  /** Running-file observations are change hints only; publish a fresh paused capture. */
  readNativeFiles?(): Promise<RuntimeFile[]>;
  stop(): Promise<void>;
  setMouseCapture?(enabled: boolean): void;
  setIntegerScaling?(enabled: boolean): void;
  files?: RuntimeFileAccess;
  snapshot?: RuntimeSnapshotAccess;
  controls?: RuntimeControls;
}
export interface RuntimeHost {
  start(launch: RuntimeLaunch): Promise<RuntimeHandle>;
}
export type RuntimeWindow = Window & { retroRuntime?: RuntimeHost };
