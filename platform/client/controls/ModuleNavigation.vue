<script setup lang="ts">
import Button from "primevue/button";
import { computed, useId } from "vue";
import type { EditorView } from "../../src/editors/types.ts";
import { type DisplayText, textIdentity } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";

type Module = EditorView["modules"][number];
const props = defineProps<{ modules: Module[]; current: string; disabled: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const prefix = useId();
const groups = computed(() => {
  const phases = new Map<string, Module[]>();
  for (const module of props.modules) {
    const key = textIdentity(module.phase ?? "");
    const members = phases.get(key) ?? [];
    members.push(module);
    phases.set(key, members);
  }
  return [...phases].map(([key, members]) => {
    const notes = new Map<string, { id: string; reason: DisplayText; labels: DisplayText[] }>();
    const buttons = members.map((module) => {
      const reason = module.unavailableReason;
      if (!reason) return { module, reasonId: undefined };
      const identity = textIdentity(reason);
      const note = notes.get(identity) ?? {
        id: `${prefix}-reason-${module.id}`,
        reason,
        labels: [],
      };
      note.labels.push(module.label);
      notes.set(identity, note);
      return { module, reasonId: note.id };
    });
    return { key, phase: members[0]?.phase, buttons, notes: [...notes.values()] };
  });
});
</script>

<template>
  <nav
    :aria-label="t('editor.modules')"
    class="module-nav"
    :class="{ phased: groups.some((g) => g.phase) }"
  >
    <component
      :is="group.phase ? 'fieldset' : 'div'"
      v-for="group in groups"
      :key="group.key"
      class="module-group"
    >
      <legend v-if="group.phase" class="phase-name">{{ translate(group.phase) }}</legend>
      <div class="buttons">
        <Button
          v-for="{ module, reasonId } in group.buttons"
          :key="module.id"
          size="small"
          :label="translate(module.label)"
          :title="translate(module.description)"
          :aria-description="module.description ? translate(module.description) : undefined"
          :aria-describedby="reasonId"
          :aria-pressed="module.id === current"
          :disabled="disabled || Boolean(module.unavailableReason)"
          :severity="module.id === current ? 'primary' : 'secondary'"
          @click="emit('select', module.id)"
        />
      </div>
      <p v-for="note in group.notes" :key="note.id" :id="note.id" class="phase-note">
        <strong v-if="note.labels.length < group.buttons.length"
          >{{ note.labels.map(translate).join(" · ") }}
          ·
        </strong>
        {{ translate(note.reason) }}
      </p>
    </component>
  </nav>
</template>

<style scoped>
.module-nav {
  margin: 10px 0 14px;
  padding: 6px;
  border-radius: 8px;
  background: var(--p-content-hover-background);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
button[aria-pressed="false"]:not(:disabled) {
  background: transparent;
  border-color: transparent;
}
.phased {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 9px 12px;
}
.module-group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.phase-name {
  padding: 0;
  font-size: 12px;
  font-weight: 650;
  margin-bottom: 4px;
}
.phase-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--p-text-muted-color);
}
.phased .module-group + .module-group {
  border-inline-start: 1px solid var(--p-content-border-color);
  padding-inline-start: 14px;
}
@media (max-width: 850px) {
  .phased .module-group + .module-group {
    border: 0;
    padding-inline-start: 0;
  }
}
@media (max-width: 600px) {
  .phased {
    display: grid;
    gap: 8px;
  }
  .phase-name {
    margin-bottom: 2px;
  }
}
</style>
