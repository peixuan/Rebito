<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { defineAsyncComponent, onMounted, ref } from "vue";
import type { EditorBatch } from "../src/editors/service.ts";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { Profile, Revision } from "../src/storage/revisions.ts";
import { api, errorText } from "./api.ts";
import { formatDate, t, translate } from "./i18n.ts";
import PlayerPanel from "./PlayerPanel.vue";

const EditorPanel = defineAsyncComponent(() => import("./EditorPanel.vue"));

const props = defineProps<{ game: Game; profile: Profile }>();
const emit = defineEmits<{ back: []; recovered: [profile: Profile]; changed: [] }>();
const revisions = ref<Revision[]>([]);
const head = ref(props.profile.headId);
const files = ref<File[]>([]);
const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const editorDirty = ref(false);
const player = ref<InstanceType<typeof PlayerPanel> | null>(null);
async function refresh() {
  revisions.value = await api<Revision[]>(`profiles/${props.profile.id}/revisions`);
  const profiles = await api<Profile[]>("profiles");
  head.value = profiles.find((profile) => profile.id === props.profile.id)?.headId ?? null;
  emit("changed");
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
  if (!files.value.length) return;
  await perform(async () => {
    const body = new FormData();
    body.append(
      "metadata",
      JSON.stringify({ kind: "game-save", releaseId: props.game.id, baseRevision: head.value }),
    );
    for (const file of files.value) body.append("file", file, file.name);
    await api(`profiles/${props.profile.id}/revisions`, body);
    files.value = [];
    if (input.value) input.value.value = "";
    await refresh();
    notice.value = message("saves.uploaded");
  });
}
async function restore(revision: Revision) {
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
  if (busy.value || player.value?.busy) return false;
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
        :disabled="busy || editorDirty"
        @click="back"
      />
      <h2>{{ game.title }} · {{ profile.name }}</h2>
      <Button
        :label="player?.active ? t('saves.synchronize') : t('saves.refresh')"
        :title="player?.active ? t('saves.synchronizeHelp') : undefined"
        variant="text"
        :loading="busy || player?.busy"
        :disabled="
          Boolean(player?.active && (!player.ready || player.pendingSync || player.conflict))
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
      @saved="perform(refresh)"
      @dirty="editorDirty = $event"
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
          :disabled="busy"
          @change="selectFiles"
        >
        <Button
          type="submit"
          :label="t('saves.upload')"
          size="small"
          :loading="busy"
          :disabled="!files.length"
        />
      </form>
    </section>
    <section class="profile-panel" :aria-label="t('saves.history')">
      <h3>{{ t("saves.history") }}</h3>
      <p v-if="revisions.length === 100" class="muted">{{ t("saves.historyLimit") }}</p>
      <p v-if="!revisions.length" class="muted">{{ t("saves.empty") }}</p>
      <article v-for="revision in revisions" :key="revision.id" class="revision-row">
        <div>
          <strong>{{ revision.id === head ? t("saves.current") : t("saves.history") }}</strong>
          <span>
            ·
            {{
              {
                snapshot: t("saves.snapshot"),
                "game-save": t("saves.native"),
                filesystem: t("library.gameFile"),
              }[revision.manifest.kind]
            }}</span
          >
          <span class="muted"> · {{ formatDate(revision.createdAt) }}</span>
          <div class="toolbar">
            <a
              v-for="file in revision.manifest.artifacts"
              :key="file.name"
              :href="`/api/revisions/${revision.id}/file?name=${encodeURIComponent(file.name)}`"
              :download="file.name"
              >{{
                file.name
              }}</a
            >
          </div>
        </div>
        <Button
          v-if="revision.id !== head"
          :label="t('saves.restore')"
          size="small"
          severity="secondary"
          :disabled="busy"
          @click="restore(revision)"
        />
      </article>
    </section>
  </section>
</template>
