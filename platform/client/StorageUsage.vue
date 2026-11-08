<script setup lang="ts">
import Button from "primevue/button";
import { computed, ref, watch } from "vue";
import { message } from "../src/shared/messages.ts";
import type { StorageUsage } from "../src/storage/limits.ts";
import { api } from "./api.ts";
import { formatNumber, t, translate } from "./i18n.ts";

const props = defineProps<{ refreshKey: number }>();
const usage = ref<{ used: StorageUsage; limits: StorageUsage } | null>(null);
const failed = ref(false);
const busy = ref(false);
let request = 0;
const items = computed(() => {
  if (!usage.value) return [];
  const { used, limits } = usage.value;
  return (
    [
      ["bytes", message("storage.bytes")],
      ["revisions", message("saves.history")],
      ["profiles", message("library.profiles")],
    ] as const
  ).map(([key, label]) => {
    const format = key === "bytes" ? formatBytes : formatNumber;
    return {
      key,
      label: translate(label),
      used: used[key],
      limit: limits[key],
      text: `${format(used[key])} / ${format(limits[key])}`,
    };
  });
});
const nearingLimit = computed(() => items.value.some((item) => item.used >= item.limit * 0.8));
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
async function refresh() {
  const current = ++request;
  busy.value = true;
  try {
    const result = await api<NonNullable<typeof usage.value>>("storage");
    if (current !== request) return;
    usage.value = result;
    failed.value = false;
  } catch {
    if (current === request) failed.value = true;
  } finally {
    if (current === request) busy.value = false;
  }
}
watch(() => props.refreshKey, refresh, { immediate: true });
</script>

<template>
  <aside class="storage-summary" :aria-label="t('storage.title')">
    <div v-for="item in items" :key="item.key" class="storage-item">
      <div><span>{{ item.label }}</span><strong>{{ item.text }}</strong></div>
      <meter
        :aria-label="item.label"
        :value="item.used"
        :max="item.limit"
        :high="item.limit * 0.8"
        :optimum="0"
      />
    </div>
    <Button
      :label="t('storage.refresh')"
      variant="text"
      size="small"
      :loading="busy"
      @click="refresh"
    />
    <p v-if="failed" class="storage-note" role="alert">{{ t("storage.failed") }}</p>
    <p v-else-if="nearingLimit" class="storage-note storage-warning" role="alert">
      {{ t("storage.warning") }}
    </p>
    <p v-else class="storage-note">{{ t("storage.help") }}</p>
  </aside>
</template>
