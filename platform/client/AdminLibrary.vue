<script setup lang="ts">
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { discUploadLimits, gameUploadLimits } from "../src/domain/game-import.ts";
import { gameSystems, systemOptions as systems } from "../src/domain/systems.ts";
import type { listEditors } from "../src/editors/registry.ts";
import type { Game } from "../src/library/catalog.ts";
import type { describeConfiguration } from "../src/library/configuration.ts";
import type { DeletionPreview } from "../src/library/deletion-records.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import AdminFirmware from "./AdminFirmware.vue";
import AdminSaveQuotas from "./AdminSaveQuotas.vue";
import { api, errorText } from "./api.ts";
import EditCover from "./EditCover.vue";
import { formatBytes as size } from "./format-bytes.ts";
import GameCover from "./GameCover.vue";
import GameDeletion from "./GameDeletion.vue";
import { localize, t, translate } from "./i18n.ts";
import { inspectDosArchive } from "./library-archive.ts";

const emit = defineEmits<{ back: [] }>();
const catalog = ref<{
  games: Game[];
  usedBytes: number;
  maximumBytes: number;
  editors: ReturnType<typeof listEditors>;
} | null>(null);
const title = ref("");
const system = ref<Game["system"]>("dos");
const executable = ref("");
const args = ref("");
const cycles = ref("auto");
const savePaths = ref("");
const editor = ref<Game["editor"] | "">("");
const editorOptions = computed(() =>
  localize([
    { id: "", label: message("admin.noEditor") },
    ...(catalog.value?.editors ?? []).filter((item) => item.system === system.value),
  ]),
);
const selectedEditor = computed(() =>
  catalog.value?.editors.find((item) => item.id === editor.value),
);
const file = ref<File | null>(null);
const useLibraryFirmware = ref(false);
const firmwareRegion = ref("");
const input = ref<HTMLInputElement | null>(null);
const programs = ref<string[]>([]);
const busy = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const query = ref("");
const deleting = ref<string | null>(null);
const pending = ref<DeletionPreview[]>([]);
const editing = ref<{ id: string; token: string } | null>(null);
const coverPanel = ref<InstanceType<typeof EditCover>>();
const selectedCoverGame = computed(() =>
  catalog.value?.games.find((game) => game.id === editing.value?.id),
);
const initialDraft = ref("");
const legacyConfiguration = ref(false);
const draft = () =>
  JSON.stringify([
    title.value,
    executable.value,
    args.value,
    cycles.value,
    savePaths.value,
    editor.value,
    useLibraryFirmware.value,
  ]);
const dirty = computed(() =>
  editing.value
    ? draft() !== initialDraft.value
    : Boolean(
        file.value ||
          title.value ||
          executable.value ||
          args.value ||
          savePaths.value ||
          editor.value ||
          cycles.value !== "auto",
      ),
);
const games = computed(
  () =>
    catalog.value?.games.filter(
      (game) =>
        !pending.value.some((job) => job.id === game.id) &&
        game.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
    ) ?? [],
);
const accept = computed(() => gameSystems[system.value].extensions.join(","));
async function refresh() {
  try {
    [catalog.value, pending.value] = await Promise.all([
      api<NonNullable<typeof catalog.value>>("admin/games"),
      api<DeletionPreview[]>("admin/deletions"),
    ]);
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function selectFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0] ?? null;
  file.value = selected;
  programs.value = [];
  executable.value = "";
  error.value = "";
  if (!selected) return;
  const maximum = system.value === "segacd" ? discUploadLimits.bytes : gameUploadLimits.bytes;
  if (selected.size > maximum) {
    error.value = message("admin.fileSize", { maximum: maximum / 1024 ** 2 });
    file.value = null;
    return;
  }
  if (system.value !== "dos") return;
  try {
    const result = inspectDosArchive(new Uint8Array(await selected.arrayBuffer()));
    if (file.value !== selected) return;
    programs.value = result.executables;
    if (result.executables.length === 1) executable.value = result.executables[0] ?? "";
  } catch {
    if (file.value === selected) {
      file.value = null;
      error.value = message("admin.unreadableArchive");
    }
  }
}
function resetFile() {
  editor.value = "";
  useLibraryFirmware.value = false;
  file.value = null;
  programs.value = [];
  executable.value = "";
  if (input.value) input.value.value = "";
}
async function publish() {
  if ((!file.value && !editing.value) || busy.value || coverPanel.value?.dirty) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const settings = {
      title: title.value,
      system: system.value,
      editor: editor.value || undefined,
      ...(system.value === "dos"
        ? {
            executable: executable.value,
            arguments: args.value,
            cycles: cycles.value,
            saveFiles: savePaths.value
              .split(/\r?\n/)
              .map((path) => path.trim())
              .filter(Boolean),
          }
        : {}),
    };
    if (editing.value) {
      const { title: gameTitle, system: _, editor: chosenEditor, ...launch } = settings;
      const result = await api<{ game: Game; created: boolean }>(
        `admin/games/${editing.value.id}/configuration`,
        {
          token: editing.value.token,
          title: gameTitle,
          editor: chosenEditor ?? null,
          ...(system.value === "segacd" ? { useLibraryFirmware: useLibraryFirmware.value } : {}),
          ...(system.value === "dos" && executable.value ? { launch } : {}),
        },
      );
      notice.value = result.created
        ? message("admin.reconfigured", {
            title: result.game.title,
            association: message(
              result.game.editor ? "admin.editorLinked" : "admin.editorNotLinked",
            ),
          })
        : message("admin.configured", { title: result.game.title });
    } else {
      const form = new FormData();
      form.append("metadata", JSON.stringify(settings));
      if (!file.value) return;
      form.append("file", file.value);
      const result = await api<{ game: Game; removed: string[] }>("admin/games", form);
      notice.value = message("admin.published", {
        title: result.game.title,
        removed: result.removed.length
          ? message("admin.removedSaves", { files: result.removed.join(", ") })
          : "",
      });
    }
    resetDraft();
    await refresh();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
function resetDraft() {
  deleting.value = null;
  editing.value = null;
  legacyConfiguration.value = false;
  firmwareRegion.value = "";
  title.value = args.value = savePaths.value = "";
  cycles.value = "auto";
  resetFile();
}
async function edit(game: Game) {
  if (!leave()) return;
  busy.value = true;
  error.value = notice.value = "";
  try {
    const detail = await api<Awaited<ReturnType<typeof describeConfiguration>>>(
      `admin/games/${game.id}/configuration`,
    );
    const current = detail.game;
    if (!current) throw new Error("Missing game configuration");
    resetDraft();
    editing.value = { id: game.id, token: detail.token };
    title.value = current.title;
    system.value = current.system;
    programs.value = detail.executables;
    executable.value = detail.settings?.executable ?? "";
    args.value = detail.settings?.arguments ?? "";
    cycles.value = detail.settings?.cycles ?? "auto";
    savePaths.value = current.saveFiles.join("\n");
    editor.value = current.editor ?? "";
    legacyConfiguration.value = current.system === "dos" && !detail.settings;
    firmwareRegion.value = detail.firmware?.region ?? "";
    initialDraft.value = draft();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
function cancelEdit() {
  if (leave()) resetDraft();
}
function openDeletion(id: string) {
  if (leave()) {
    resetDraft();
    deleting.value = id;
    error.value = notice.value = "";
  }
}
function deleted(message: DisplayText) {
  deleting.value = null;
  notice.value = message;
  void refresh();
}
function leave() {
  if (busy.value) {
    error.value = message("admin.processingConfiguration");
    return false;
  }
  return (
    !(dirty.value || coverPanel.value?.dirty) || window.confirm(t("admin.discardConfiguration"))
  );
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || dirty.value || coverPanel.value?.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
}
defineExpose({ leave });
onMounted(() => {
  void refresh();
  window.addEventListener("beforeunload", beforeUnload);
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
</script>

<template>
  <section class="admin-manager" :aria-label="t('admin.title')">
    <div class="toolbar">
      <Button :label="t('library.back')" variant="text" @click="emit('back')" />
      <h1>{{ t("admin.title") }}</h1>
      <AdminSaveQuotas :disabled="busy" />
      <Button :label="t('admin.refresh')" variant="text" :disabled="busy" @click="refresh" />
    </div>
    <p class="muted">{{ t("admin.description") }}</p>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <AdminFirmware v-if="system === 'segacd'" :disabled="busy" @busy="busy = $event" />
    <div class="admin-layout">
      <GameDeletion
        v-if="deleting"
        :key="deleting"
        :game-id="deleting"
        @busy="busy = $event"
        @close="deleting = null"
        @changed="refresh"
        @deleted="deleted"
      />
      <form v-else class="profile-panel admin-form" @submit.prevent="publish">
        <div class="toolbar">
          <h2>{{ editing ? t("admin.editTitle") : t("admin.uploadTitle") }}</h2>
          <Button
            v-if="editing"
            :label="t('admin.cancelEdit')"
            size="small"
            variant="text"
            :disabled="busy"
            @click="cancelEdit"
          />
        </div>
        <EditCover
          v-if="selectedCoverGame"
          :key="selectedCoverGame.id"
          ref="coverPanel"
          :game="selectedCoverGame"
          :disabled="busy"
          @busy="busy = $event"
          @changed="refresh"
        />
        <p v-if="editing" class="muted">{{ t("admin.reuseHelp") }}</p>
        <label for="admin-title"
          >{{ t("admin.gameTitle")
          }}<InputText
            v-model="title"
            id="admin-title"
            :aria-label="t('admin.gameTitle')"
            maxlength="120"
            required
            :disabled="busy"
          /></label
        >
        <label for="admin-system"
          >{{ t("library.platform")
          }}<Select
            v-model="system"
            input-id="admin-system"
            :options="systems"
            option-label="label"
            option-value="value"
            :aria-label="t('admin.uploadPlatform')"
            :disabled="busy || !!editing"
            @change="resetFile"
          /></label
        >
        <label v-if="!editing"
          >{{ t("library.gameFile")
          }}<input
            ref="input"
            type="file"
            :accept="accept"
            :aria-label="t('library.gameFile')"
            required
            :disabled="busy"
            @change="selectFile"
          ></label
        >
        <label for="admin-editor"
          >{{ t("editor.title")
          }}<Select
            v-model="editor"
            input-id="admin-editor"
            :aria-label="t('editor.title')"
            :placeholder="t('admin.noEditor')"
            :options="editorOptions"
            option-label="label"
            option-value="id"
            :disabled="busy || editorOptions.length === 1"
          /></label
        >
        <p v-if="selectedEditor" class="muted">{{ translate(selectedEditor.instructions) }}</p>
        <p v-else class="muted">
          {{ editorOptions.length === 1 ? t("admin.editorUnavailable") : t("admin.editorHelp") }}
        </p>
        <template v-if="system === 'segacd'">
          <p v-if="editing" class="muted">
            {{ t("admin.firmwareRegion", { region: firmwareRegion }) }}
          </p>
          <label v-if="editing" class="firmware-choice">
            <input v-model="useLibraryFirmware" type="checkbox" :disabled="busy">
            {{ t("bios.useLatest") }}
          </label>
          <p v-else class="muted">{{ t("bios.automatic") }}</p>
          <p class="muted">{{ t("admin.discHelp") }}</p>
        </template>
        <p v-else-if="!editing" class="muted">{{ t("admin.fileHelp") }}</p>
        <p v-if="legacyConfiguration" class="muted">{{ t("admin.legacyLaunchHelp") }}</p>
        <template v-if="system === 'dos'">
          <label for="admin-executable"
            >{{ t("admin.executable")
            }}<InputText
              v-model="executable"
              id="admin-executable"
              list="dos-programs"
              :aria-label="t('admin.executable')"
              :placeholder="t('admin.executableExample')"
              :required="!editing"
              :disabled="busy"
            /></label
          >
          <datalist id="dos-programs">
            <option v-for="program in programs" :key="program" :value="program" />
          </datalist>
          <div class="admin-inline">
            <label for="admin-arguments"
              >{{ t("admin.arguments")
              }}<InputText
                v-model="args"
                id="admin-arguments"
                :aria-label="t('admin.arguments')"
                maxlength="200"
                :disabled="busy || (!!editing && !executable)"
              /></label
            >
            <label for="admin-cycles"
              >{{ t("admin.cycles")
              }}<InputText
                v-model="cycles"
                id="admin-cycles"
                :aria-label="t('admin.cycles')"
                placeholder="auto"
                :disabled="busy || (!!editing && !executable)"
              /></label
            >
          </div>
          <p class="muted">{{ t("admin.cyclesHelp") }}</p>
          <label for="admin-saves"
            >{{ t("admin.saveFiles")
            }}<Textarea
              v-model="savePaths"
              id="admin-saves"
              :aria-label="t('admin.saveFiles')"
              rows="4"
              :placeholder="t('admin.savePathsExample')"
              :disabled="busy || (!!editing && !executable)"
            /></label
          >
          <p class="muted">{{ t("admin.savePathsHelp") }}</p>
        </template>
        <p v-else class="muted">{{ t("admin.consoleSaveHelp") }}</p>
        <Button
          type="submit"
          :label="busy ? t('common.processing') : editing ? t('admin.save') : t('admin.publish')"
          :loading="busy"
          :disabled="
            coverPanel?.dirty ||
            (!file && !editing) ||
            !title.trim() ||
            (!editing && system === 'dos' && !executable)
          "
        />
      </form>
      <section class="profile-panel admin-catalog" :aria-label="t('admin.publishedGames')">
        <div v-if="pending.length" class="pending-deletions" role="status">
          <p>{{ t("admin.pendingCleanup") }}</p>
          <div v-for="job in pending" :key="job.id" class="toolbar">
            <span>{{ job.title }}</span>
            <Button
              :label="t('deletion.retry')"
              size="small"
              severity="danger"
              variant="text"
              :disabled="busy"
              @click="openDeletion(job.id)"
            />
          </div>
        </div>
        <div class="toolbar">
          <h2>{{ t("admin.publishedGames") }}</h2>
          <InputText
            v-model="query"
            :aria-label="t('admin.search')"
            :placeholder="t('library.search')"
            size="small"
          />
        </div>
        <p v-if="catalog" class="muted">
          {{
            t("admin.usage", {
              count: catalog.games.length,
              used: size(catalog.usedBytes),
              maximum: size(catalog.maximumBytes),
            })
          }}
        </p>
        <DataTable
          :value="games"
          data-key="id"
          size="small"
          paginator
          :rows="8"
          sort-field="title"
          :sort-order="1"
        >
          <template #empty>{{ t("admin.noMatches") }}</template>
          <Column field="title" :header="t('library.game')" sortable>
            <template #body="{ data }">
              <div class="catalog-title">
                <GameCover
                  :system="data.system"
                  :src="data.cover ? `/api/games/${data.id}/cover/${data.cover}` : undefined"
                /><span>{{ data.title }}</span>
              </div>
              <small v-if="data.editor" class="muted">
                {{
                  t("admin.editorLabel", {
                    editor: translate(
                      catalog?.editors.find((item) => item.id === data.editor)?.label ??
                        data.editor,
                    ),
                  })
                }}
              </small>
            </template>
          </Column>
          <Column field="system" :header="t('common.platform')" sortable />
          <Column field="size" :header="t('common.size')" sortable
            ><template #body="{ data }">{{ size(data.size) }}</template></Column
          >
          <Column :header="t('admin.syncFiles')"
            ><template #body="{ data }"
              ><span class="admin-paths">{{
                data.system === "dos"
                  ? data.saveFiles.join("\n") || t("common.unspecified")
                  : t("admin.automatic")
              }}</span></template
            ></Column
          >
          <Column :header="t('common.actions')"
            ><template #body="{ data }"
              ><div class="admin-actions">
                <Button
                  :label="t('admin.edit')"
                  size="small"
                  variant="text"
                  :disabled="busy"
                  @click="edit(data)"
                /><Button
                  :label="t('common.delete')"
                  size="small"
                  severity="danger"
                  variant="text"
                  :disabled="busy"
                  @click="openDeletion(data.id)"
                />
              </div></template
            ></Column
          >
        </DataTable>
        <p class="muted">{{ t("admin.versionHelp") }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.catalog-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.catalog-title .game-cover {
  width: 48px;
  flex: none;
}
.admin-manager {
  overflow-wrap: anywhere;
}
.admin-actions {
  display: flex;
  flex-wrap: wrap;
}
.pending-deletions {
  padding-bottom: 12px;
}
.admin-layout {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.admin-form {
  display: grid;
  gap: 12px;
}
.admin-form h2 {
  margin: 0;
  font-size: 18px;
}
.admin-form label {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.admin-form input,
.admin-form textarea {
  width: 100%;
}
.admin-form p {
  margin: 0;
  font-size: 12px;
}
.admin-inline {
  display: grid;
  grid-template-columns: 1fr 110px;
  gap: 12px;
}
.admin-form .firmware-choice {
  display: flex;
  align-items: center;
}
.firmware-choice input {
  width: auto;
}
.admin-catalog {
  min-width: 0;
}
.admin-catalog h2 {
  font-size: 18px;
}
.admin-paths {
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 12px;
}
@media (max-width: 900px) {
  .admin-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
