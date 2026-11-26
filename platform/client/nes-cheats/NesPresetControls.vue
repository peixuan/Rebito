<script setup lang="ts">
import Button from "primevue/button";
import { ref } from "vue";
import { type NesPreset, nesPresetCode } from "../../src/editors/nes/presets.ts";
import { t } from "../i18n.ts";

const props = defineProps<{ presets: readonly NesPreset[]; disabled: boolean }>();
const emit = defineEmits<{ apply: [preset: NesPreset, code: string] }>();
const values = ref<Record<string, number | "">>(
  Object.fromEntries(
    props.presets.map((preset) => [preset.label, preset.choices?.[0]?.value ?? preset.max]),
  ),
);
function submit(preset: NesPreset) {
  const value = values.value[preset.label];
  if (
    props.disabled ||
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < preset.min ||
    value > preset.max
  )
    return;
  emit("apply", preset, nesPresetCode(preset, value));
}
</script>
<template>
  <fieldset v-if="presets.length" :disabled="disabled">
    <legend>{{ t("nesCheats.verified") }}</legend>
    <form
      v-for="preset in presets"
      :key="preset.label"
      class="toolbar"
      @submit.prevent="submit(preset)"
    >
      <label
        >{{ t(preset.label) }}
        <select v-if="preset.choices" v-model.number="values[preset.label]">
          <option v-for="choice in preset.choices" :key="choice.value" :value="choice.value">
            {{ t(choice.label) }}
          </option>
        </select>
        <input
          v-else
          v-model.number="values[preset.label]"
          type="number"
          step="1"
          :min="preset.min"
          :max="preset.max"
          required
        >
      </label>
      <span v-if="!preset.choices" class="muted">{{ preset.min }}–{{ preset.max }}</span>
      <Button type="submit" size="small" :label="t('nesCheats.hold')" />
    </form>
  </fieldset>
  <p v-else class="muted">{{ t("nesCheats.noPresets") }}</p>
</template>
<style scoped>
fieldset {
  margin-block: 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.4rem;
}
legend {
  font-weight: 600;
}
select,
input {
  width: 5rem;
  margin-inline: 0.45rem;
  padding: 0.3rem;
  color: var(--p-text-color);
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.3rem;
}
</style>
