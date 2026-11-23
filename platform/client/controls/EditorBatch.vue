<script setup lang="ts">
import Button from "primevue/button";
import MultiSelect from "primevue/multiselect";
import { computed, ref, watch } from "vue";
import type { EditorView } from "../../src/editors/types.ts";
import { t, translate } from "../i18n.ts";

const props = defineProps<{
  view: EditorView;
  keys: string[];
  changes: Record<string, number>;
  disabled: boolean;
}>();
const emit = defineEmits<{ apply: [targets: string[]] }>();
const targets = ref<string[]>([]);
const options = computed(() =>
  props.view.records
    .filter(({ id }) => id !== props.view.selected)
    .map(({ id, label }) => ({ id, label: translate(label) })),
);
const changed = computed(() => props.keys.some((key) => Object.hasOwn(props.changes, key)));
watch(
  () => props.view.selected,
  () => {
    targets.value = [];
  },
);
</script>

<template>
  <div class="batch-controls">
    <MultiSelect
      v-model="targets"
      :options="options"
      option-label="label"
      option-value="id"
      :aria-label="t('editor.batchTargets')"
      :placeholder="t('editor.batchTargets')"
      :selected-items-label="t('editor.batchSelected', { count: targets.length })"
      :max-selected-labels="2"
      filter
      size="small"
      :disabled="disabled"
    />
    <Button
      :label="t('editor.batchApply')"
      size="small"
      severity="secondary"
      :disabled="disabled || !changed || !targets.length"
      @click="emit('apply', targets)"
    />
    <small>{{ t("editor.batchHelp") }}</small>
  </div>
</template>

<style scoped>
.batch-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}
.batch-controls > :first-child {
  max-width: min(100%, 24rem);
}
.batch-controls small {
  flex-basis: 100%;
  font-size: 11px;
  color: #627386;
}
</style>
