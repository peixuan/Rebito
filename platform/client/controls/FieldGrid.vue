<script setup lang="ts">
import { computed, useId } from "vue";
import type { EditorField, EditorUnavailableField } from "../../src/editors/types.ts";
import { type DisplayText, textIdentity } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import EditorFieldControl from "./EditorFieldControl.vue";
import { fieldSections } from "./field-sections.ts";

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
const groups = computed(() =>
  fieldSections(props.fields, props.unavailable ?? [], props.groupOrder ?? []).map(
    (group, index) => {
      const id = `${prefix}-section-${index}`;
      const notes = [...group.notes].map(
        ([key, text], i) => [key, { text, id: `${id}-note-${i}` }] as const,
      );
      const blocks = [...group.blocks.values()];
      return {
        ...group,
        id,
        blocks,
        repeated: blocks.some((block) => block.label),
        notes: new Map(notes),
      };
    },
  ),
);
</script>

<template>
  <nav v-if="groups.length > 1" class="field-index" :aria-label="t('editor.sections')">
    <a v-for="group in groups" :key="group.id" :href="`#${group.id}`">{{
      translate(group.label)
    }}</a>
  </nav>
  <div class="field-grid" :class="{ organized: groupOrder?.length && groups.length > 3 }">
    <fieldset v-for="group in groups" :id="group.id" :key="group.id" tabindex="-1">
      <legend>{{ translate(group.label) }}</legend>
      <div :class="{ 'slot-grid': group.repeated }">
        <div
          v-for="block in group.blocks"
          :key="textIdentity(block.label ?? group.label)"
          class="field-block"
          :class="{ slot: block.label }"
          :role="block.label ? 'group' : undefined"
          :aria-label="block.label ? translate(block.label) : undefined"
        >
          <strong v-if="block.label" class="slot-label">{{ translate(block.label) }}</strong>
          <div
            v-for="field in block.fields"
            :key="field.key"
            class="field-row"
            :class="{ choice: field.choices }"
          >
            <EditorFieldControl
              :field="field"
              :description="field.help ? group.notes.get(textIdentity(field.help))?.id : undefined"
              :disabled="Boolean(disabled)"
              @change="(key, value) => emit('change', key, value)"
              @valid="(key, value) => emit('valid', key, value)"
              @pending="(key, value) => emit('pending', key, value)"
            />
          </div>
        </div>
      </div>
      <div v-for="field in group.unavailable" :key="field.id" class="field-row unavailable-field">
        <label :for="`unavailable-${field.id}`">{{ translate(field.label) }}</label>
        <input
          :id="`unavailable-${field.id}`"
          value="—"
          disabled
          :aria-describedby="group.notes.get(textIdentity(field.reason))?.id"
        >
      </div>
      <div v-if="group.notes.size" class="field-notes">
        <p v-for="note in group.notes.values()" :id="note.id" :key="note.id" class="field-help">
          {{ translate(note.text) }}
        </p>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.field-grid {
  display: grid;
  gap: 12px;
}
fieldset {
  margin: 0;
  padding: 8px 12px 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  min-width: 0;
  scroll-margin-top: 12px;
}
legend {
  padding: 0 5px;
  font-weight: 650;
  font-size: 14px;
}
.field-block {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 14px;
}
.field-row {
  display: grid;
  align-content: end;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  flex: 0 1 8.5rem;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.field-row.choice {
  flex-basis: 12rem;
}
.slot,
.field-row :deep(.p-select) {
  min-width: 0;
  max-width: 100%;
}
.field-row :deep(input) {
  max-width: 100%;
}
@media (max-width: 600px) {
  .field-block:not(.slot) > .choice {
    flex-basis: calc(50% - 7px);
  }
}
.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
  gap: 8px;
}
.slot {
  align-content: start;
  padding: 8px;
  gap: 6px;
  background: var(--p-content-hover-background);
  border-radius: 6px;
}
.slot-label,
.slot .choice {
  flex-basis: 100%;
}
.slot .field-row:not(.choice) {
  flex: 1 1 5rem;
}
.slot-label {
  font-size: 12px;
}
.organized .field-block {
  display: block;
}
.organized .field-row {
  grid-template-columns: minmax(5.5rem, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 5px 0;
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
