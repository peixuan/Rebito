<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, onMounted, ref } from "vue";
import type { DeletionPreview } from "../src/library/deletion-records.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import { ApiError, api, errorText } from "./api.ts";
import { formatBytes } from "./format-bytes.ts";
import { t, translate } from "./i18n.ts";

const props = defineProps<{ gameId: string }>();
const emit = defineEmits<{
  close: [];
  changed: [];
  busy: [value: boolean];
  deleted: [notice: DisplayText];
}>();
const preview = ref<(DeletionPreview & { pending?: boolean }) | null>(null);
const title = ref("");
const consent = ref(false);
const error = ref<DisplayText>("");
const busy = ref(false);
const ready = computed(
  () =>
    preview.value &&
    (preview.value.pending ||
      (title.value === preview.value.title && (!preview.value.profiles || consent.value))),
);
function setBusy(value: boolean) {
  busy.value = value;
  emit("busy", value);
}
async function refresh() {
  setBusy(true);
  title.value = "";
  consent.value = false;
  try {
    preview.value = await api(`admin/games/${props.gameId}/deletion`);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    setBusy(false);
  }
}
async function remove() {
  if (!preview.value || !ready.value || busy.value) return;
  setBusy(true);
  error.value = "";
  try {
    const result = await api<{ status: string; reclaimedBytes?: number }>(
      `admin/games/${props.gameId}/deletion`,
      {
        token: preview.value.token,
        title: preview.value.title,
        deleteSaves: preview.value.pending || consent.value,
      },
    );
    if (result.status === "pending") {
      preview.value.pending = true;
      error.value = message("deletion.incomplete");
      emit("changed");
    } else {
      emit(
        "deleted",
        message("deletion.completed", {
          title: preview.value.title,
          size: formatBytes(result.reclaimedBytes ?? 0),
        }),
      );
    }
  } catch (cause) {
    error.value = errorText(cause);
    if (cause instanceof ApiError && cause.status === 409) await refresh();
  } finally {
    setBusy(false);
  }
}
onMounted(refresh);
</script>

<template>
  <section class="profile-panel deletion-panel" :aria-label="t('deletion.confirmation')">
    <div class="toolbar">
      <h2>{{ preview?.pending ? t("deletion.pendingTitle") : t("deletion.title") }}</h2>
      <Button
        :label="t('deletion.cancel')"
        variant="text"
        size="small"
        :disabled="busy"
        @click="emit('close')"
      />
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <template v-if="preview">
      <strong>{{ preview.title }}</strong>
      <dl>
        <dt>{{ t("deletion.users") }}</dt>
        <dd>{{ preview.users }}</dd>
        <dt>{{ t("library.profiles") }}</dt>
        <dd>{{ preview.profiles }}</dd>
        <dt>{{ t("deletion.revisions") }}</dt>
        <dd>{{ preview.revisions }}</dd>
        <dt>{{ t("deletion.logicalSize") }}</dt>
        <dd>{{ formatBytes(preview.saveBytes) }}</dd>
        <dt>{{ t("deletion.reclaimableSize") }}</dt>
        <dd>{{ formatBytes(preview.reclaimableBytes) }}</dd>
      </dl>
      <p class="muted">{{ t("deletion.sharedHelp") }}</p>
      <p v-if="preview.pending">{{ t("deletion.cleanupHelp") }}</p>
      <template v-else>
        <p>{{ t("deletion.warning") }}</p>
        <label v-if="preview.profiles" class="delete-consent"
          ><input v-model="consent" type="checkbox" :disabled="busy">
          {{ t("deletion.acknowledge") }}</label
        >
        <label class="delete-title" for="delete-game-title"
          >{{ t("deletion.typeTitle")
          }}<InputText
            v-model="title"
            id="delete-game-title"
            :aria-label="t('deletion.typeTitle')"
            :placeholder="preview.title"
            :disabled="busy"
            autocomplete="off"
          /></label
        >
      </template>
      <Button
        :label="preview.pending ? t('deletion.retry') : t('deletion.submit')"
        severity="danger"
        :disabled="!ready || busy"
        :loading="busy"
        @click="remove"
      />
    </template>
    <Button v-else :label="t('deletion.refresh')" variant="text" :loading="busy" @click="refresh" />
  </section>
</template>

<style scoped>
.deletion-panel {
  display: grid;
  gap: 12px;
}
.deletion-panel h2 {
  margin: 0;
  font-size: 18px;
}
.deletion-panel p,
.deletion-panel dl {
  margin: 0;
}
.deletion-panel dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.deletion-panel dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.delete-title {
  display: grid;
  gap: 6px;
}
.delete-consent {
  display: flex;
  align-items: start;
  gap: 8px;
}
.delete-consent input {
  flex: none;
  margin-top: 4px;
}
</style>
