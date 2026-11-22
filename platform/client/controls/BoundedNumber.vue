<script setup lang="ts">
import InputText from "primevue/inputtext";
import { computed, ref, watch } from "vue";
import { type DisplayText, displayMessage, message } from "../../src/shared/messages.ts";
import { translate } from "../i18n.ts";
import { displayNumber, type NumberSpec, normalizeNumber } from "./numbers.ts";

const props = defineProps<{
  modelValue: number;
  spec: NumberSpec;
  id: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: number];
  valid: [value: boolean];
  pending: [value: boolean];
}>();
const text = ref(displayNumber(props.modelValue, props.spec));
const dirty = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const width = computed(
  () =>
    `${Math.min(
      14,
      Math.max(
        6,
        displayNumber(props.spec.min, props.spec).length + 2,
        displayNumber(props.spec.max, props.spec).length + 2,
      ),
    )}ch`,
);
watch(
  () => props.modelValue,
  (value) => {
    if (!dirty.value) text.value = displayNumber(value, props.spec);
  },
);
function commit() {
  if (!dirty.value) return;
  try {
    const result = normalizeNumber(text.value, props.spec);
    text.value = result.text;
    dirty.value = false;
    error.value = "";
    notice.value = result.adjusted ? message("controls.adjusted") : "";
    emit("update:modelValue", result.raw);
    emit("valid", true);
    emit("pending", false);
  } catch (cause) {
    error.value = displayMessage(cause) ?? message("controls.enterNumber");
    emit("valid", false);
  }
}
</script>

<template>
  <span class="bounded-number">
    <InputText
      :id="id"
      v-model="text"
      size="small"
      inputmode="decimal"
      maxlength="512"
      :style="{ width: `calc(${width} + 1.5rem)` }"
      :disabled="disabled"
      :invalid="Boolean(error)"
      :aria-invalid="Boolean(error)"
      :aria-describedby="`${id}-feedback`"
      @input="
        dirty = true;
        emit('pending', true);
      "
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <small :id="`${id}-feedback`" aria-live="polite" :class="{ 'input-error': error }">{{
      translate(error || notice)
    }}</small>
  </span>
</template>

<style scoped>
.bounded-number {
  display: inline-grid;
  gap: 2px;
}
small {
  max-width: 15rem;
  font-size: 11px;
  color: #627386;
}
small:empty {
  display: none;
}
.input-error {
  color: #b42318;
}
</style>
