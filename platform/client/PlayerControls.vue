<script setup lang="ts">
import Button from "primevue/button";
import { ref, watch } from "vue";
import { textIdentity } from "../src/shared/messages.ts";
import { t, translate } from "./i18n.ts";
import type { RuntimeControl, RuntimeControls } from "./runtime/types.ts";

const props = defineProps<{ controls: RuntimeControls }>();
const emit = defineEmits<{ configure: [] }>();
const bindings = ref<RuntimeControl[]>([]);
watch(
  () => props.controls,
  (controls, _, onCleanup) => {
    onCleanup(
      controls.watch((value) => {
        bindings.value = value;
      }),
    );
  },
  { immediate: true },
);
</script>

<template>
  <section class="player-controls" :aria-label="t('controls.title')">
    <div class="toolbar">
      <strong>{{ t("controls.playerOne") }}</strong>
      <span class="muted">{{ t("controls.focusHelp") }}</span>
      <Button
        :label="t('controls.configure')"
        size="small"
        severity="secondary"
        @click="
          controls.configure();
          emit('configure');
        "
      />
    </div>
    <ul>
      <li v-for="binding in bindings" :key="textIdentity(binding.button)">
        <kbd>{{ translate(binding.key) }}</kbd><span aria-hidden="true">→</span>
        {{ translate(binding.button) }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.player-controls {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--p-content-border-color);
  font-size: 12px;
}
ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
li {
  display: flex;
  align-items: center;
  gap: 6px;
}
kbd {
  padding: 2px 6px;
  min-width: 26px;
  border: 1px solid var(--p-content-border-color);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--p-content-hover-background);
  font: inherit;
  text-align: center;
}
</style>
