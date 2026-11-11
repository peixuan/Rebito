<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { type DisplayText, message } from "../src/shared/messages.ts";
import { t, translate } from "./i18n.ts";

const firmware = defineModel<string>({ required: true });
defineProps<{ disabled: boolean; required: boolean }>();
const error = ref<DisplayText>("");
const input = ref<HTMLInputElement | null>(null);
let generation = 0;
onBeforeUnmount(() => generation++);
watch(
  () => translate(error.value),
  (value) => input.value?.setCustomValidity(value),
);
async function select(event: Event) {
  const current = ++generation;
  firmware.value = error.value = "";
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size !== 131072) {
    error.value = message("bios.size");
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (current === generation)
      firmware.value = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  } catch {
    if (current === generation) error.value = message("bios.readFailed");
  }
}
</script>

<template>
  <label
    >{{ t("bios.file")
    }}<input
      ref="input"
      type="file"
      accept=".bin"
      :aria-label="t('bios.file')"
      :disabled="disabled"
      :required="required"
      @change="select"
    ></label
  >
  <p v-if="error" role="alert">{{ translate(error) }}</p>
  <p class="muted">{{ t("bios.help") }}</p>
</template>
