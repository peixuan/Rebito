<script setup lang="ts">
import InputText from "primevue/inputtext";
import type { EditorTextField } from "../../src/editors/types.ts";
import { translate } from "../i18n.ts";

defineProps<{
  fields: EditorTextField[];
  changes: Record<string, string>;
  disabled: boolean;
}>();
const emit = defineEmits<{ change: [key: string, value: string] }>();
</script>

<template>
  <div class="text-fields">
    <div v-for="field in fields" :key="field.key">
      <label :for="`text-${field.key}`">{{ translate(field.label) }}</label>
      <InputText
        :id="`text-${field.key}`"
        :model-value="changes[field.key] ?? field.value"
        :maxlength="field.maxLength"
        :disabled="disabled || field.readonly"
        size="small"
        autocomplete="off"
        @update:model-value="emit('change', field.key, $event ?? '')"
      />
      <small v-if="field.help">{{ translate(field.help) }}</small>
    </div>
  </div>
</template>

<style scoped>
.text-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.text-fields > div {
  display: grid;
  gap: 4px;
  max-width: 24rem;
  font-size: 13px;
}
.text-fields input {
  width: 12rem;
}
.text-fields small {
  color: #627386;
}
</style>
