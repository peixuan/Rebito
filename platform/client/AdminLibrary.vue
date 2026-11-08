<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { gameUploadLimits } from "../src/domain/game-import.ts";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import { api, errorText } from "./api.ts";
import { t, translate } from "./i18n.ts";
import { inspectDosArchive } from "./library-archive.ts";

const emit = defineEmits<{ back: [] }>();
const systems = [
  { label: "DOS", value: "dos" },
  { label: "FC / NES", value: "nes" },
  { label: "SFC / SNES", value: "snes" },
  { label: "GB", value: "gb" },
  { label: "GBA", value: "gba" },
];
const title = ref("");
const system = ref("dos");
const executable = ref("");
const args = ref("");
const cycles = ref("auto");
const savePaths = ref("");
const file = ref<File | null>(null);
const input = ref<HTMLInputElement | null>(null);
const programs = ref<string[]>([]);
const busy = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const dirty = computed(() =>
  Boolean(
    file.value ||
      title.value ||
      executable.value ||
      args.value ||
      savePaths.value ||
      cycles.value !== "auto",
  ),
);
const accept = computed(
  () =>
    ({ dos: ".zip,.jsdos", nes: ".nes", snes: ".sfc,.smc", gb: ".gb", gba: ".gba" })[system.value],
);
async function selectFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0] ?? null;
  file.value = selected;
  programs.value = [];
  executable.value = "";
  error.value = "";
  if (!selected) return;
  if (selected.size > gameUploadLimits.bytes) {
    error.value = message("library.previewSize");
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
  file.value = null;
  programs.value = [];
  executable.value = "";
  if (input.value) input.value.value = "";
}
async function publish() {
  if (!file.value || busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const form = new FormData();
    form.append(
      "metadata",
      JSON.stringify({
        title: title.value,
        system: system.value,
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
      }),
    );
    form.append("file", file.value);
    const result = await api<{ game: Game; removed: string[] }>("admin/games", form);
    notice.value = message("admin.published", {
      title: result.game.title,
      removed: result.removed.length
        ? message("admin.removedSaves", { files: result.removed.join(", ") })
        : "",
    });
    title.value = args.value = savePaths.value = "";
    cycles.value = "auto";
    resetFile();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
function leave() {
  if (busy.value) {
    error.value = message("admin.processingUpload");
    return false;
  }
  return !dirty.value || window.confirm(t("admin.discardConfiguration"));
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value || dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
defineExpose({ leave });
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
</script>

<template>
  <section class="admin-manager" :aria-label="t('admin.title')">
    <div class="toolbar">
      <Button :label="t('library.back')" variant="text" @click="emit('back')" />
      <h1>{{ t("admin.title") }}</h1>
    </div>
    <p class="muted">{{ t("admin.uploadIntroduction") }}</p>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <div class="admin-layout">
      <form class="profile-panel admin-form" @submit.prevent="publish">
        <h2>{{ t("admin.uploadTitle") }}</h2>
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
            :disabled="busy"
            @change="resetFile"
          /></label
        >
        <label
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
        <p class="muted">{{ t("admin.fileHelp") }}</p>
        <template v-if="system === 'dos'">
          <label for="admin-executable"
            >{{ t("admin.executable")
            }}<InputText
              v-model="executable"
              id="admin-executable"
              list="dos-programs"
              :aria-label="t('admin.executable')"
              :placeholder="t('admin.executableExample')"
              required
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
                :disabled="busy"
              /></label
            >
            <label for="admin-cycles"
              >{{ t("admin.cycles")
              }}<InputText
                v-model="cycles"
                id="admin-cycles"
                :aria-label="t('admin.cycles')"
                placeholder="auto"
                :disabled="busy"
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
              :disabled="busy"
            /></label
          >
          <p class="muted">{{ t("admin.savePathsHelp") }}</p>
        </template>
        <p v-else class="muted">{{ t("admin.consoleSaveHelp") }}</p>
        <Button
          type="submit"
          :label="busy ? t('admin.uploading') : t('admin.publish')"
          :loading="busy"
          :disabled="!file || !title.trim() || (system === 'dos' && !executable)"
        />
      </form>
    </div>
  </section>
</template>

<style scoped>
.admin-manager {
  overflow-wrap: anywhere;
}
.admin-layout {
  display: grid;
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
    grid-template-columns: 1fr;
  }
}
</style>
