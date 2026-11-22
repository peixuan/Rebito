<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { onMounted, ref, watch } from "vue";
import type { describeFirmware } from "../src/library/firmware.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import { api, errorText } from "./api.ts";
import BiosFile from "./BiosFile.vue";
import { t, translate } from "./i18n.ts";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const library = ref<Awaited<ReturnType<typeof describeFirmware>> | null>(null);
const firmware = ref("");
const allowUnrecognized = ref(false);
const generation = ref(0);
const busy = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
watch(firmware, () => {
  allowUnrecognized.value = false;
  error.value = "";
});
async function refresh() {
  error.value = notice.value = "";
  try {
    library.value = await api("admin/firmware");
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function upload() {
  if (!library.value || !firmware.value || busy.value) return;
  busy.value = true;
  emit("busy", true);
  error.value = notice.value = "";
  try {
    library.value = await api("admin/firmware", {
      token: library.value.token,
      firmware: firmware.value,
      allowUnrecognized: allowUnrecognized.value,
    });
    firmware.value = "";
    generation.value++;
    notice.value = message("bios.saved");
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
onMounted(refresh);
</script>

<template>
  <section class="profile-panel" :aria-label="t('bios.title')">
    <div class="toolbar">
      <h2>{{ t("bios.title") }}</h2>
      <Button
        :label="t('bios.refresh')"
        variant="text"
        size="small"
        :disabled="disabled"
        @click="refresh"
      />
      <span v-for="entry in library?.entries" :key="entry.region">
        {{ t(`bios.region${entry.region}`) }}:
        {{ t(entry.sha256 ? "bios.available" : "bios.missing") }}
        <small v-if="entry.sha256" :title="entry.md5 ?? ''"
          >({{ t(entry.recognized ? "bios.recognized" : "bios.unrecognized") }})</small
        >
      </span>
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <form class="firmware-upload" @submit.prevent="upload">
      <BiosFile :key="generation" v-model="firmware" :disabled="disabled" required />
      <label
        v-if="
          allowUnrecognized ||
          (typeof error !== 'string' && error.messageId === 'library.biosUnrecognized')
        "
      >
        <span
          ><input v-model="allowUnrecognized" type="checkbox" :disabled="disabled">
          {{ t("bios.allowUnrecognized") }}</span
        >
      </label>
      <Button
        type="submit"
        :label="t('bios.upload')"
        :loading="busy"
        :disabled="disabled || !library || !firmware"
      />
    </form>
  </section>
</template>

<style scoped>
.firmware-upload {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.firmware-upload :deep(label) {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.firmware-upload :deep(input) {
  max-width: 100%;
}
.firmware-upload :deep(p) {
  flex-basis: 100%;
  order: 1;
  margin: 0;
  font-size: 12px;
}
</style>
