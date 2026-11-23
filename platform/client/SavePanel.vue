<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import type { EditorBatch } from "../src/editors/service.ts";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { Profile, Revision } from "../src/storage/revisions.ts";
import { api, errorText } from "./api.ts";
import HistoryPanel from "./HistoryPanel.vue";
import { t, translate } from "./i18n.ts";
import PlayerPanel from "./PlayerPanel.vue";
import { uploadProgress } from "./runtime/progress-sync.ts";

const EditorPanel = defineAsyncComponent(() => import("./EditorPanel.vue"));

const props = defineProps<{ game: Game; profile: Profile }>();
const emit = defineEmits<{ back: []; recovered: [profile: Profile]; changed: [] }>();
const revisions = ref<Revision[]>([]);
const head = ref(props.profile.headId);
const files = ref<File[]>([]);
const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const historyBusy = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const editorDirty = ref(false);
const player = ref<InstanceType<typeof PlayerPanel> | null>(null);
const consoleEditLocked = computed(
  () =>
    props.game.system !== "dos" &&
    Boolean(editorDirty.value || player.value?.pendingSync || player.value?.busy),
);
async function refresh() {
  revisions.value = await api<Revision[]>(`profiles/${props.profile.id}/revisions`);
  const profiles = await api<Profile[]>("profiles");
  head.value = profiles.find((profile) => profile.id === props.profile.id)?.headId ?? null;
  emit("changed");
}
function edited(revision: Revision) {
  head.value = revision.id;
  revisions.value = [revision, ...revisions.value.filter((entry) => entry.id !== revision.id)];
  void perform(refresh);
}
async function perform(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function refreshWorkspace() {
  // Capture first: reading server history alone cannot see a game's local writes.
  if (player.value?.active) await player.value.save();
  else await perform(refresh);
}
async function publishEdit(revisionId: string, batch: EditorBatch) {
  const publish = () => api<Revision>(`revisions/${revisionId}/editor`, batch);
  return player.value
    ? player.value.publishEdit(
        revisionId,
        batch.files.map((entry) => entry.file),
        publish,
      )
    : publish();
}
async function upload() {
  if (!files.value.length || busy.value || consoleEditLocked.value) return;
  await perform(async () => {
    const body = new FormData();
    body.append(
      "metadata",
      JSON.stringify({ kind: "game-save", releaseId: props.game.id, baseRevision: head.value }),
    );
    for (const file of files.value) body.append("file", file, file.name);
    await uploadProgress(props.profile.id, body);
    files.value = [];
    if (input.value) input.value.value = "";
    await refresh();
    notice.value = message("saves.uploaded");
  });
}
async function restore(revision: Revision) {
  if (busy.value || consoleEditLocked.value) return;
  await perform(async () => {
    await api(`profiles/${props.profile.id}/restore`, {
      baseRevision: head.value,
      revisionId: revision.id,
    });
    await refresh();
    notice.value = message("saves.restored");
  });
}
function selectFiles(event: Event) {
  files.value = [...((event.target as HTMLInputElement).files ?? [])];
}
async function leave() {
  if (busy.value || historyBusy.value || player.value?.busy) return false;
  if (editorDirty.value) {
    error.value = message("saves.dirty");
    return false;
  }
  return player.value ? player.value.leave() : true;
}
async function back() {
  if (await leave()) emit("back");
}
defineExpose({ leave });
onMounted(() => perform(refresh));
</script>

<template>
  <section :aria-label="t('saves.workspace')">
    <div class="toolbar">
      <Button
        :label="t('library.back')"
        variant="text"
        :disabled="busy || historyBusy || editorDirty"
        @click="back"
      />
      <h2>{{ game.title }} · {{ profile.name }}</h2>
      <Button
        :label="player?.active ? t('saves.synchronize') : t('saves.refresh')"
        :title="player?.active ? t('saves.synchronizeHelp') : undefined"
        variant="text"
        :loading="busy || player?.busy"
        :disabled="
          Boolean(
            player?.active &&
              (!player.ready ||
                player.pendingSync ||
                player.conflict ||
                (game.system !== 'dos' && editorDirty)),
          )
        "
        @click="refreshWorkspace"
      />
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <PlayerPanel
      ref="player"
      :game="game"
      :profile-id="profile.id"
      :editor-dirty="editorDirty"
      :base-revision="head"
      :revision="revisions.find((revision) => revision.id === head) ?? null"
      @saved="perform(refresh)"
      @recovered="emit('recovered', $event)"
    />
    <EditorPanel
      v-if="game.editor && head"
      :revision-id="head"
      :publish="publishEdit"
      @dirty="editorDirty = $event"
      @saved="edited"
    />
    <section class="profile-panel">
      <h3>{{ t("saves.import") }}</h3>
      <p class="muted">{{ t("saves.importHelp") }}</p>
      <p v-if="game.system !== 'dos'" class="muted">{{ t("saves.consoleImportHelp") }}</p>
      <form class="toolbar" @submit.prevent="upload">
        <input
          ref="input"
          type="file"
          :multiple="game.system === 'dos'"
          :aria-label="t('saves.files')"
          :disabled="busy || consoleEditLocked"
          @change="selectFiles"
        >
        <Button
          type="submit"
          :label="t('saves.upload')"
          size="small"
          :loading="busy"
          :disabled="busy || !files.length || consoleEditLocked"
        />
      </form>
    </section>
    <HistoryPanel
      :profile-id="profile.id"
      :revisions="revisions"
      :head="head"
      :disabled="busy || consoleEditLocked"
      @restore="restore"
      @changed="perform(refresh)"
      @busy="historyBusy = $event"
    />
  </section>
</template>
