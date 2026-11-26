<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { computed, ref, shallowRef } from "vue";
import { type DisplayText, displayMessage, message } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import { maxCheatFileBytes, readNesCheatFile, writeNesCheatFile } from "./cht.ts";
import type { NesRule } from "./rules.ts";

const props = defineProps<{ sha256: string; rules: readonly NesRule[]; disabled: boolean }>();
const emit = defineEmits<{ add: [codes: string[], label: DisplayText] }>();
const imported = shallowRef<ReturnType<typeof readNesCheatFile>>();
const selected = ref("");
const query = ref("");
const error = ref<DisplayText>("");
let ticket = 0;
const matches = computed(() => {
  const entries = imported.value?.entries ?? [];
  const term = query.value.trim().toLowerCase();
  return term
    ? entries.filter((entry) => `${entry.name} ${entry.code}`.toLowerCase().includes(term))
    : entries;
});
async function load(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const request = ++ticket;
  imported.value = undefined;
  selected.value = "";
  query.value = "";
  error.value = "";
  if (!file) return;
  try {
    if (file.size > maxCheatFileBytes) throw Error("file size");
    const data = readNesCheatFile(await file.text(), props.sha256);
    if (request === ticket) imported.value = data;
  } catch (cause) {
    if (request === ticket) error.value = displayMessage(cause) ?? message("nesCheats.invalidFile");
  }
}
function activate() {
  const entry = matches.value.find((item) => item.code === selected.value);
  if (entry && !props.disabled) emit("add", [entry.code], entry.name);
}
function download() {
  const text = writeNesCheatFile(
    props.sha256,
    props.rules.map((rule) => ({ code: rule.code, name: translate(rule.name) })),
  );
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  link.href = url;
  link.download = `nes-${props.sha256.slice(0, 12)}.cht`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>{{ t("nesCheats.files") }}</legend>
    <div class="toolbar">
      <label>{{ t("nesCheats.openFile") }} <input type="file" accept=".cht" @change="load"></label>
      <Button
        size="small"
        severity="secondary"
        :disabled="!rules.length"
        :label="t('nesCheats.export')"
        @click="download"
      />
    </div>
    <p v-if="imported" class="muted" role="status">
      {{
        t("nesCheats.fileStats", { available: imported.entries.length, skipped: imported.skipped })
      }}
    </p>
    <div v-if="imported?.entries.length" class="toolbar">
      <label
        >{{ t("nesCheats.filterCodes") }}
        <input v-model="query" type="search" maxlength="160" @input="selected = ''"></label
      >
      <label
        >{{ t("nesCheats.chooseCode") }}
        <select v-model="selected">
          <option disabled value="">{{ t("nesCheats.chooseCode") }}</option>
          <option v-for="(item, index) in matches" :key="index" :value="item.code">
            {{ item.name || item.code }}
          </option>
        </select>
      </label>
      <Button size="small" :disabled="!selected" :label="t('nesCheats.enable')" @click="activate" />
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
  </fieldset>
</template>
<style scoped>
fieldset {
  min-width: 0;
  margin-block: 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.4rem;
}
legend {
  font-weight: 600;
}
label {
  min-width: 0;
  display: grid;
  gap: 0.2rem;
}
input,
select {
  max-width: 100%;
  font: inherit;
}
select {
  max-width: min(26rem, 100%);
}
</style>
