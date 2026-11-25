<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import { computed } from "vue";
import type { EditorField } from "../../src/editors/types.ts";
import { t, translate } from "../i18n.ts";
import BoundedNumber from "./BoundedNumber.vue";

const props = defineProps<{
  field: EditorField;
  disabled?: boolean;
  description?: string | undefined;
}>();
const emit = defineEmits<{
  change: [key: string, value: number];
  valid: [key: string, value: boolean];
  pending: [key: string, value: boolean];
}>();
const options = computed(() => {
  const field = props.field;
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
});
</script>

<template>
  <label :for="`field-${field.key}`" :title="translate(field.help)">{{
    translate(field.label)
  }}</label>
  <Checkbox
    v-if="field.boolean"
    :input-id="`field-${field.key}`"
    :model-value="Boolean(field.value)"
    binary
    :disabled="disabled || field.readonly"
    :aria-describedby="description"
    @update:model-value="emit('change', field.key, $event ? 1 : 0)"
  />
  <Select
    v-else-if="field.choices"
    :input-id="`field-${field.key}`"
    :aria-label="translate(field.label)"
    :model-value="field.value"
    size="small"
    :options="options"
    option-label="label"
    option-value="value"
    option-disabled="disabled"
    filter
    :disabled="disabled || field.readonly"
    :aria-describedby="description"
    @update:model-value="emit('change', field.key, $event)"
  >
    <template #value>{{ options.find((option) => option.value === field.value)?.label }}</template>
  </Select>
  <BoundedNumber
    v-else
    :id="`field-${field.key}`"
    :model-value="field.value"
    :spec="field"
    :disabled="Boolean(disabled || field.readonly)"
    :description="description"
    @update:model-value="emit('change', field.key, $event)"
    @valid="emit('valid', field.key, $event)"
    @pending="emit('pending', field.key, $event)"
  />
</template>
