<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import { computed } from "vue";
import type { EditorField } from "../../src/editors/types.ts";
import { textIdentity } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import BoundedNumber from "./BoundedNumber.vue";

const props = defineProps<{ fields: EditorField[]; disabled?: boolean }>();
const emit = defineEmits<{
  change: [key: string, value: number];
  valid: [key: string, value: boolean];
}>();
const groups = computed(() => [
  ...new Map(props.fields.map((field) => [textIdentity(field.group), field.group])),
]);
function options(field: EditorField) {
  const known =
    field.choices?.map((choice) => ({ ...choice, label: translate(choice.label) })) ?? [];
  return known.some((choice) => choice.value === field.value)
    ? known
    : [
        {
          value: field.value,
          label: t("controls.unknownOriginal", { value: field.value }),
          disabled: true,
        },
        ...known,
      ];
}
</script>

<template>
  <div class="field-grid">
    <fieldset v-for="[ id, group ] in groups" :key="id">
      <legend>{{ translate(group) }}</legend>
      <div
        v-for="field in fields.filter((item) => textIdentity(item.group) === id)"
        :key="field.key"
        class="field-row"
      >
        <label :for="`field-${field.key}`" :title="translate(field.help)">{{
          translate(field.label)
        }}</label>
        <Checkbox
          v-if="field.boolean"
          :input-id="`field-${field.key}`"
          :model-value="Boolean(field.value)"
          binary
          :disabled="disabled || field.readonly"
          @update:model-value="emit('change', field.key, $event ? 1 : 0)"
        />
        <Select
          v-else-if="field.choices"
          :input-id="`field-${field.key}`"
          :aria-label="translate(field.label)"
          :model-value="field.value"
          size="small"
          :options="options(field)"
          option-label="label"
          option-value="value"
          option-disabled="disabled"
          filter
          :disabled="disabled || field.readonly"
          @update:model-value="emit('change', field.key, $event)"
        >
          <template #value>{{
            translate(field.choices.find((choice) => choice.value === field.value)?.label) ||
            t("controls.unknownOriginal", { value: field.value })
          }}</template>
        </Select>
        <BoundedNumber
          v-else
          :id="`field-${field.key}`"
          :model-value="field.value"
          :spec="field"
          :disabled="Boolean(disabled || field.readonly)"
          @update:model-value="emit('change', field.key, $event)"
          @valid="emit('valid', field.key, $event)"
        />
        <small v-if="field.help" class="field-help">{{ translate(field.help) }}</small>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 235px), 1fr));
  gap: 10px;
  align-items: start;
}
fieldset {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #dfe5eb;
  border-radius: 6px;
  min-width: 0;
}
legend {
  padding: 0 5px;
  font-weight: 600;
  font-size: 13px;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, 1fr) minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  margin: 5px 0;
  font-size: 13px;
}
.field-help {
  grid-column: 1 / -1;
  color: #627386;
  font-size: 11px;
  line-height: 1.4;
}
</style>
