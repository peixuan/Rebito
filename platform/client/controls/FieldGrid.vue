<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import Select from "primevue/select";
import { computed, useId } from "vue";
import type { EditorField, EditorUnavailableField } from "../../src/editors/types.ts";
import { type DisplayText, textIdentity } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import BoundedNumber from "./BoundedNumber.vue";

const props = defineProps<{
  fields: EditorField[];
  unavailable?: EditorUnavailableField[];
  groupOrder?: DisplayText[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  change: [key: string, value: number];
  valid: [key: string, value: boolean];
  pending: [key: string, value: boolean];
}>();
const prefix = useId();
const groups = computed(() => {
  const all = [...props.fields, ...(props.unavailable ?? [])];
  const labels = [...(props.groupOrder ?? []), ...all.map((field) => field.group)];
  return [...new Map(labels.map((label) => [textIdentity(label), label]))]
    .filter(([id]) => all.some((field) => textIdentity(field.group) === id))
    .map(([id, label], index) => {
      const fields = props.fields.filter((field) => textIdentity(field.group) === id);
      const unavailable = (props.unavailable ?? []).filter(
        (field) => textIdentity(field.group) === id,
      );
      const help = [
        ...fields.map((field) => field.help),
        ...unavailable.map((field) => field.reason),
      ].filter((value): value is DisplayText => value !== undefined);
      return {
        id: `${prefix}-${index}`,
        label,
        fields,
        unavailable,
        notes: [...new Map(help.map((text) => [textIdentity(text), text])).values()],
      };
    });
});
function noteId(group: (typeof groups.value)[number], help: DisplayText | undefined) {
  return help === undefined
    ? undefined
    : `${group.id}-note-${group.notes.findIndex((note) => textIdentity(note) === textIdentity(help))}`;
}
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
  <nav
    v-if="groupOrder?.length && groups.length > 1"
    class="field-index"
    :aria-label="t('editor.sections')"
  >
    <a v-for="group in groups" :key="group.id" :href="`#${group.id}`">{{
      translate(group.label)
    }}</a>
  </nav>
  <div class="field-grid" :class="{ organized: groupOrder?.length }">
    <fieldset v-for="group in groups" :id="group.id" :key="group.id" tabindex="-1">
      <legend>{{ translate(group.label) }}</legend>
      <div v-for="field in group.fields" :key="field.key" class="field-row">
        <label :for="`field-${field.key}`" :title="translate(field.help)">{{
          translate(field.label)
        }}</label>
        <Checkbox
          v-if="field.boolean"
          :input-id="`field-${field.key}`"
          :model-value="Boolean(field.value)"
          binary
          :disabled="disabled || field.readonly"
          :aria-describedby="noteId(group, field.help)"
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
          :aria-describedby="noteId(group, field.help)"
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
          :description="noteId(group, field.help)"
          @update:model-value="emit('change', field.key, $event)"
          @valid="emit('valid', field.key, $event)"
          @pending="emit('pending', field.key, $event)"
        />
      </div>
      <div v-for="field in group.unavailable" :key="field.id" class="field-row unavailable-field">
        <label :for="`unavailable-${field.id}`">{{ translate(field.label) }}</label>
        <input
          :id="`unavailable-${field.id}`"
          value="—"
          disabled
          :aria-describedby="noteId(group, field.reason)"
        >
      </div>
      <div v-if="group.notes.length" class="field-notes">
        <p
          v-for="(note, index) in group.notes"
          :id="`${group.id}-note-${index}`"
          :key="textIdentity(note)"
          class="field-help"
        >
          {{ translate(note) }}
        </p>
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
  border: 1px solid var(--p-content-border-color);
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
  margin: 4px 0;
  color: var(--p-text-muted-color);
  font-size: 11px;
  line-height: 1.4;
}
.organized {
  display: block;
  columns: 2 18rem;
}
.organized fieldset {
  break-inside: avoid;
  margin-bottom: 12px;
  scroll-margin-top: 12px;
}
.field-index {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin-bottom: 12px;
  font-size: 12px;
}
.field-index a {
  color: var(--p-primary-color);
  text-underline-offset: 3px;
}
.field-notes {
  border-top: 1px solid var(--p-content-border-color);
  margin-top: 8px;
  padding-top: 4px;
}
.unavailable-field input {
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-form-field-border-radius);
  background: var(--p-form-field-disabled-background);
  color: var(--p-form-field-disabled-color);
}
</style>
