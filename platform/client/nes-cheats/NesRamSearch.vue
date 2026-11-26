<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { computed, ref, shallowRef } from "vue";
import {
  maxNesValue,
  type NesComparison,
  type NesFormat,
  type NesScan,
  nesAddress,
  nesFormats,
  nesValue,
  nesValueCodes,
  scanNesRam,
} from "../../src/editors/nes/search.ts";
import { type DisplayText, displayMessage, message } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import type { NesCheats } from "./runtime.ts";

const props = defineProps<{ port: NesCheats; disabled: boolean }>();
const emit = defineEmits<{ add: [codes: string[], label: DisplayText] }>();
const format = ref<NesFormat>("byte");
const filter = ref<NesComparison>("exact");
const target = ref<number | "">("");
const sample = shallowRef<NesScan>();
const comparisons = computed(() =>
  sample.value ? ["any", "exact", "changed", "unchanged", "higher", "lower"] : ["any", "exact"],
);
const page = ref(0);
const selection = ref<number | null>(null);
const change = ref<number | "">("");
const error = ref<DisplayText>("");
const size = 8;
const pages = computed(() => Math.ceil((sample.value?.addresses.length ?? 0) / size));
const visible = computed(
  () => sample.value?.addresses.slice(page.value * size, (page.value + 1) * size) ?? [],
);
function scan() {
  if (props.disabled) return;
  try {
    sample.value = scanNesRam(
      props.port.readRam(),
      format.value,
      filter.value,
      target.value === "" ? NaN : target.value,
      sample.value,
    );
    selection.value = null;
    page.value = 0;
    error.value = "";
  } catch (cause) {
    error.value = displayMessage(cause) ?? message("nesCheats.invalidSearch");
  }
}
function reset() {
  sample.value = undefined;
  selection.value = null;
  page.value = 0;
  filter.value = "exact";
  error.value = "";
}
function select(address: number) {
  selection.value = address;
  change.value = sample.value ? (nesValue(sample.value.ram, address, format.value) ?? "") : "";
}
function lock() {
  if (props.disabled || selection.value === null) return;
  try {
    const codes = nesValueCodes(
      selection.value,
      change.value === "" ? NaN : change.value,
      format.value,
    );
    emit("add", codes, message("nesCheats.memoryRule", { address: nesAddress(selection.value) }));
    error.value = "";
  } catch (cause) {
    error.value = displayMessage(cause) ?? message("nesCheats.invalidSearch");
  }
}
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>{{ t("nesCheats.search") }}</legend>
    <p class="muted">{{ t("nesCheats.searchHelp") }}</p>
    <form class="toolbar" @submit.prevent="scan">
      <label
        >{{ t("nesCheats.format") }}
        <select v-model="format" @change="reset">
          <option v-for="kind in nesFormats" :key="kind" :value="kind">
            {{ t(`nesCheats.${kind}`) }}
          </option>
        </select>
      </label>
      <label
        >{{ t("nesCheats.compare") }}
        <select v-model="filter">
          <option v-for="mode in comparisons" :key="mode" :value="mode">
            {{ t(`nesCheats.${mode}`) }}
          </option>
        </select>
      </label>
      <label v-if="filter === 'exact'"
        >{{ t("nesCheats.value") }}
        <input
          v-model.number="target"
          type="number"
          min="0"
          :max="maxNesValue(format)"
          step="1"
          required
        >
      </label>
      <Button
        type="submit"
        size="small"
        :label="t(sample ? 'nesCheats.refine' : 'nesCheats.firstScan')"
      />
      <Button
        v-if="sample"
        type="button"
        size="small"
        severity="secondary"
        :label="t('nesCheats.reset')"
        @click="reset"
      />
    </form>
    <template v-if="sample">
      <p role="status">{{ t("nesCheats.matches", { count: sample.addresses.length }) }}</p>
      <div v-if="pages" class="toolbar">
        <Button
          v-for="address in visible"
          :key="address"
          size="small"
          severity="secondary"
          :outlined="selection !== address"
          :aria-pressed="selection === address"
          :label="`${nesAddress(address)} · ${nesValue(sample.ram, address, format)}`"
          @click="select(address)"
        />
      </div>
      <div v-if="pages > 1" class="toolbar">
        <Button
          size="small"
          text
          :disabled="page === 0"
          :label="t('nesCheats.previous')"
          @click="page--"
        />
        <span>{{ t("nesCheats.page", { page: page + 1, total: pages }) }}</span>
        <Button
          size="small"
          text
          :disabled="page + 1 >= pages"
          :label="t('nesCheats.next')"
          @click="page++"
        />
      </div>
      <form v-if="selection !== null" class="toolbar" @submit.prevent="lock">
        <label
          >{{ t("nesCheats.target", { address: nesAddress(selection) }) }}
          <input
            v-model.number="change"
            type="number"
            step="1"
            min="0"
            :max="maxNesValue(format)"
            required
          >
        </label>
        <Button type="submit" size="small" :label="t('nesCheats.hold')" />
      </form>
    </template>
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
.toolbar {
  align-items: end;
  margin-block: 0.45rem;
}
label {
  display: grid;
  gap: 0.2rem;
}
input,
select {
  font: inherit;
  padding: 0.35rem;
  color: var(--p-text-color);
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.3rem;
}
input {
  width: 6.5rem;
}
</style>
