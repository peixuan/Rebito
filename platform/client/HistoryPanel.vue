<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { computed, ref } from "vue";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { HistoryPreview } from "../src/storage/history.ts";
import type { Revision } from "../src/storage/revisions.ts";
import { ApiError, api, errorText } from "./api.ts";
import { formatBytes } from "./format-bytes.ts";
import { formatDate, t, translate } from "./i18n.ts";

const props = defineProps<{
  profileId: string;
  revisions: Revision[];
  head: string | null;
  dos: boolean;
  disabled: boolean;
}>();
const emit = defineEmits<{ restore: [revision: Revision]; changed: []; busy: [value: boolean] }>();
const removeLabel = computed(() => t(props.dos ? "history.removeBackup" : "history.unprotect"));
const busy = ref(false);
const visible = ref(false);
const selected = ref<Revision | null>(null);
const preview = ref<HistoryPreview | null>(null);
const pending = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const older = ref<Revision[] | null>(null);
const entries = computed(() => older.value ?? props.revisions);
type Reclaimed = { reclaimedBytes: number | null; pendingFiles: number };

async function perform(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  notice.value = "";
  try {
    await action();
  } catch (cause) {
    older.value = null;
    error.value =
      cause instanceof ApiError && cause.status === 409
        ? message("history.changed")
        : errorText(cause);
    visible.value = false;
    emit("changed");
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
async function protect(revision: Revision) {
  const updated = await api<Revision>(`revisions/${revision.id}/protection`, {
    expected: revision.protected,
    protected: !revision.protected,
  });
  if (older.value)
    older.value = older.value.map((entry) => (entry.id === updated.id ? updated : entry));
  visible.value = false;
  emit("changed");
}
async function loadOlder() {
  const cursor = entries.value.at(-1)?.id;
  if (!cursor) return;
  await perform(async () => {
    older.value = await api<Revision[]>(`profiles/${props.profileId}/revisions?before=${cursor}`);
  });
}
function toggleProtection(revision: Revision) {
  if (revision.protected) {
    selected.value = revision;
    visible.value = true;
  } else void perform(() => protect(revision));
}
async function review() {
  await perform(async () => {
    selected.value = null;
    const result = await api<HistoryPreview & { pendingFiles: number }>(
      `profiles/${props.profileId}/history/preview`,
    );
    preview.value = result;
    pending.value = result.pendingFiles > 0;
    visible.value = true;
  });
}
async function confirm() {
  await perform(async () => {
    if (selected.value) return protect(selected.value);
    if (!preview.value?.revisions.length) return;
    const result = await api<Reclaimed>(`profiles/${props.profileId}/history/cleanup`, {
      token: preview.value.token,
    });
    pending.value = result.pendingFiles > 0 || result.reclaimedBytes === null;
    notice.value = pending.value
      ? message("history.pending")
      : message("history.cleaned", {
          count: preview.value.revisions.length,
          size: formatBytes(result.reclaimedBytes ?? 0),
        });
    visible.value = false;
    older.value = null;
    emit("changed");
  });
}
async function retry() {
  await perform(async () => {
    const result = await api<Reclaimed>("storage/reclaim", {});
    pending.value = result.pendingFiles > 0 || result.reclaimedBytes === null;
    notice.value = message(pending.value ? "history.pending" : "history.reclaimed");
    emit("changed");
  });
}
</script>

<template>
  <section class="profile-panel" :aria-label="t('saves.history')">
    <div class="toolbar">
      <h3>{{ t("saves.history") }}</h3>
      <Button
        :label="t('history.review')"
        size="small"
        severity="secondary"
        :disabled="disabled || busy"
        :loading="busy"
        @click="review"
      />
      <Button
        v-if="pending"
        :label="t('history.retry')"
        size="small"
        :disabled="disabled || busy"
        @click="retry"
      />
    </div>
    <p class="muted">{{ t(dos ? "history.dosPolicy" : "history.policy") }}</p>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="info" role="status">{{ translate(notice) }}</Message>
    <p v-if="!entries.length" class="muted">{{ t("saves.empty") }}</p>
    <article
      v-for="revision in entries"
      :key="revision.id"
      class="revision-row"
      :data-revision-id="revision.id"
    >
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
        <strong v-if="revision.protected">
          · {{ t(dos ? "history.backup" : "history.protected") }}</strong
        >
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
      <div class="toolbar">
        <Button
          :label="
            revision.protected ? removeLabel : t(dos ? 'history.backupStored' : 'history.protect')
          "
          size="small"
          variant="text"
          :disabled="disabled || busy"
          @click="toggleProtection(revision)"
        />
        <Button
          v-if="revision.id !== head"
          :label="t('saves.restore')"
          size="small"
          severity="secondary"
          :disabled="disabled || busy"
          @click="emit('restore', revision)"
        />
      </div>
    </article>
    <div class="toolbar">
      <Button
        v-if="older"
        :label="t('history.newest')"
        size="small"
        variant="text"
        :disabled="disabled || busy"
        @click="older = null"
      />
      <Button
        v-if="entries.length === 100"
        :label="t('history.older')"
        size="small"
        variant="text"
        :disabled="disabled || busy"
        @click="loadOlder"
      />
    </div>
    <Dialog
      v-model:visible="visible"
      :header="selected ? removeLabel : t('history.review')"
      modal
      :closable="!busy"
      :close-on-escape="!busy"
      :style="{ width: 'min(95vw, 620px)' }"
    >
      <template v-if="selected">
        <p>{{ formatDate(selected.createdAt) }}</p>
        <p>{{ t(dos ? "history.removeBackupHelp" : "history.unprotectHelp") }}</p>
      </template>
      <template v-else-if="preview">
        <p>
          {{
            t("history.preview", {
              count: preview.revisions.length,
              size: formatBytes(preview.logicalBytes),
              disk: formatBytes(preview.reclaimableBytes),
            })
          }}
        </p>
        <p>
          {{
            t(dos ? "history.dosKeep" : "history.keepHelp", { count: preview.protectedRevisions })
          }}
        </p>
        <p class="muted">{{ t("history.sharedHelp") }}</p>
        <div class="history-removals">
          <table v-if="preview.revisions.length">
            <thead>
              <tr>
                <th>{{ t("history.savedAt") }}</th>
                <th>{{ t("common.size") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="revision in preview.revisions" :key="revision.id">
                <td>{{ formatDate(revision.createdAt) }}</td>
                <td>{{ formatBytes(revision.bytes) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>{{ t("history.empty") }}</p>
        </div>
      </template>
      <template #footer>
        <Button
          :label="t('history.cancel')"
          variant="text"
          :disabled="busy"
          @click="visible = false"
        />
        <Button
          :label="selected ? removeLabel : t('history.confirm')"
          severity="danger"
          :loading="busy"
          :disabled="busy || disabled || (!selected && !preview?.revisions.length)"
          @click="confirm"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.history-removals {
  max-height: 35vh;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 6px;
  text-align: left;
}
</style>
