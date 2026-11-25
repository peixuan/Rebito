import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import { nativeFileGroup } from "../../src/editors/native-files.ts";
import type { EditorRegistration } from "../../src/editors/registry.ts";
import { EditorService } from "../../src/editors/service.ts";
import type { EditorAdapter, EditorView } from "../../src/editors/types.ts";
import type { LocalLibrary } from "../../src/library/catalog.ts";
import type { SaveService } from "../../src/saves/service.ts";

const { findEditor } = vi.hoisted(() => ({ findEditor: vi.fn() }));
vi.mock("../../src/editors/registry.ts", () => ({ findEditor }));

const view: EditorView = {
  slots: [],
  slot: 0,
  modules: [],
  module: "test",
  columns: [],
  records: [],
  selected: "0",
  fields: [],
  actions: [],
  changes: {},
  preview: [],
};
const primary = "saves/MAIN0.DAT";
const companion = "saves/INDEX0.DAT";
const adapter: EditorAdapter = {
  size: 3,
  acceptsFile: (name) => /MAIN[01]\.DAT$/i.test(name),
  requiredFiles: (name) => [{ name: name.replace(/MAIN/i, "INDEX"), size: 2 }],
  view: () => view,
  apply: (bytes) => Uint8Array.from(bytes, (value) => value + 1),
};
const declarations = [primary, companion];
const primaryArtifact = { name: primary, size: 3 };
const artifacts = [primaryArtifact, { name: companion, size: 2 }];
beforeEach(() => findEditor.mockReset());

it("resolves declared companions case-insensitively and keeps their actual names", () => {
  expect(
    nativeFileGroup(
      adapter,
      primary,
      declarations.map((name) => name.toLowerCase()),
      artifacts,
    ),
  ).toEqual([primary, companion]);
  expect(
    nativeFileGroup(
      adapter,
      primary,
      declarations,
      artifacts.map((entry) => ({
        ...entry,
        name: entry.name.toLowerCase(),
      })),
    ),
  ).toEqual(declarations.map((name) => name.toLowerCase()));
  const variable: EditorAdapter = {
    ...adapter,
    requiredFiles: () => [{ name: companion.toLowerCase() }],
  };
  expect(
    nativeFileGroup(variable, primary, declarations, [
      primaryArtifact,
      { name: companion, size: 27 },
    ]),
  ).toEqual([primary, companion]);
  const { requiredFiles: _, ...single } = adapter;
  expect(nativeFileGroup(single, primary, declarations, artifacts)).toEqual([primary]);
});

it("rejects missing, ambiguous, undeclared and wrongly sized group members", () => {
  for (const [declared, members] of [
    [[primary], artifacts],
    [declarations, artifacts.slice(0, 1)],
    [declarations, [...artifacts, { name: companion.toLowerCase(), size: 2 }]],
    [[...declarations, companion.toLowerCase()], artifacts],
    [declarations, [primaryArtifact, { name: companion, size: 3 }]],
    [declarations, [primaryArtifact, { name: "other/INDEX0.DAT", size: 2 }]],
    [declarations, [primaryArtifact, { name: "saves/INDEX1.DAT", size: 2 }]],
  ] as const)
    expect(() => nativeFileGroup(adapter, primary, declared, members)).toThrow();
});

function fixture() {
  const registration: EditorRegistration = {
    label: "Synthetic editor",
    instructions: "Synthetic instructions",
    system: "dos",
    adapter,
  };
  findEditor.mockReturnValue(registration);
  const gameBytes = Uint8Array.of(4, 5);
  const game = {
    id: "game",
    system: "dos",
    editor: "synthetic",
    size: gameBytes.length,
    sha256: createHash("sha256").update(gameBytes).digest("hex"),
    saveFiles: [...declarations],
  };
  const revision = {
    manifest: { kind: "game-save", releaseId: "game", artifacts: [...artifacts] },
  };
  const saves = {
    revisions: { read: vi.fn().mockResolvedValue(revision) },
    file: vi.fn().mockResolvedValue(Uint8Array.of(1, 2, 3)),
    replaceFiles: vi.fn().mockResolvedValue({ id: "published" }),
  };
  const library = {
    refresh: vi.fn(),
    get: () => game,
    stream: vi.fn(() => Readable.from([gameBytes])),
  };
  const service = new EditorService(
    saves as unknown as SaveService,
    library as unknown as LocalLibrary,
  );
  return { service, saves, game, registration, revision, library };
}

it("exposes the complete sync group but publishes only changed primary bytes", async () => {
  const { service, saves } = fixture();
  expect(await service.preview("owner", "base", {})).toMatchObject({
    file: primary,
    files: [primary],
    syncFiles: [primary, companion],
  });
  await service.publish("owner", "base", {
    files: [{ file: primary, edits: [{ slot: 0, changes: { value: 2 } }] }],
  });
  expect(saves.replaceFiles).toHaveBeenCalledExactlyOnceWith("owner", "base", [
    { name: primary, bytes: Uint8Array.of(2, 3, 4) },
  ]);
});

it("rechecks companions during publication and never publishes a partial group", async () => {
  const { service, saves, revision } = fixture();
  await service.preview("owner", "base", {});
  revision.manifest.artifacts.pop();
  await expect(
    service.publish("owner", "base", {
      files: [{ file: primary, edits: [{ slot: 0, changes: { value: 2 } }] }],
    }),
  ).rejects.toMatchObject({ code: "no_editable_save" });
  expect(saves.replaceFiles).not.toHaveBeenCalled();
});

it("rejects invalid companion declarations and sizes before reading native bytes", async () => {
  for (const invalid of ["undeclared", "size", "ambiguous"]) {
    const { service, game, revision, saves } = fixture();
    if (invalid === "undeclared") game.saveFiles.pop();
    if (invalid === "size") revision.manifest.artifacts[1] = { name: companion, size: 4 };
    if (invalid === "ambiguous")
      revision.manifest.artifacts.push({ name: companion.toLowerCase(), size: 2 });
    await expect(service.preview("owner", "base", {})).rejects.toMatchObject({
      code: invalid === "size" ? "invalid_save" : "no_editable_save",
    });
    expect(saves.file).not.toHaveBeenCalled();
    expect(saves.replaceFiles).not.toHaveBeenCalled();
  }
});

it("keeps separate native groups for two drafts and rejects an incomplete later group", async () => {
  const { service, game, revision, saves } = fixture();
  const second = "saves/MAIN1.DAT";
  const index = "saves/INDEX1.DAT";
  game.saveFiles.push(second, index);
  revision.manifest.artifacts.push({ name: second, size: 3 }, { name: index, size: 2 });
  expect((await service.preview("owner", "base", { file: primary })).syncFiles).toEqual([
    primary,
    companion,
  ]);
  expect((await service.preview("owner", "base", { file: second })).syncFiles).toEqual([
    second,
    index,
  ]);
  const batch = {
    files: [primary, second].map((file) => ({
      file,
      edits: [{ slot: 0, changes: { value: 2 } }],
    })),
  };
  await service.publish("owner", "base", batch);
  expect(saves.replaceFiles).toHaveBeenCalledExactlyOnceWith("owner", "base", [
    { name: primary, bytes: Uint8Array.of(2, 3, 4) },
    { name: second, bytes: Uint8Array.of(2, 3, 4) },
  ]);
  saves.replaceFiles.mockClear();
  revision.manifest.artifacts.pop();
  await expect(service.publish("owner", "base", batch)).rejects.toMatchObject({
    code: "no_editable_save",
  });
  expect(saves.replaceFiles).not.toHaveBeenCalled();
});

it("binds verified immutable game data for DOS and retains the oversized fallback", async () => {
  const { service, registration, library } = fixture();
  const bound = { ...adapter, view: () => ({ ...view, selected: "bound" }) };
  const bind = vi.fn(() => bound);
  findEditor.mockReturnValue({ ...registration, gameData: { maxBytes: 2, bind } });
  expect(await service.preview("owner", "base", {})).toMatchObject({ selected: "bound" });
  expect(bind).toHaveBeenCalledExactlyOnceWith(Buffer.from([4, 5]));
  findEditor.mockReturnValue({ ...registration, gameData: { maxBytes: 1, bind } });
  expect(await service.preview("owner", "base", {})).toMatchObject({ selected: "0" });
  expect(library.stream).toHaveBeenCalledTimes(1);
});

it("opens a later complete group when an earlier slot has lost its companion", async () => {
  const { service, game, revision } = fixture();
  revision.manifest.artifacts.pop();
  const second = "saves/MAIN1.DAT";
  const index = "saves/INDEX1.DAT";
  game.saveFiles.push(second, index);
  revision.manifest.artifacts.push({ name: second, size: 3 }, { name: index, size: 2 });
  expect(await service.preview("owner", "base", {})).toMatchObject({
    file: second,
    files: [second],
    syncFiles: [second, index],
  });
  await expect(service.preview("owner", "base", { file: primary })).rejects.toMatchObject({
    code: "no_editable_save",
  });
});

it("rejects corrupted DOS game bindings before opening or editing save bytes", async () => {
  const { service, registration, game, saves } = fixture();
  const bind = vi.fn(() => adapter);
  findEditor.mockReturnValue({ ...registration, gameData: { maxBytes: 2, bind } });
  game.sha256 = "0".repeat(64);
  await expect(service.preview("owner", "base", {})).rejects.toMatchObject({
    code: "unsupported_editor",
  });
  expect(bind).not.toHaveBeenCalled();
  expect(saves.file).not.toHaveBeenCalled();
  expect(saves.replaceFiles).not.toHaveBeenCalled();
});
