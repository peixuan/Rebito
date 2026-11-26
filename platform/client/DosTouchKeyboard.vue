<script setup lang="ts">
import { computed, ref } from "vue";
import { t } from "./i18n.ts";

const props = defineProps<{ held: Set<number>; disabled: boolean; modifiers: number[] }>();
const emit = defineEmits<{ modifier: [code: number]; activate: [event: MouseEvent]; clear: [] }>();
const page = ref<"letters" | "symbols" | "function">("letters");
const pages = ["letters", "symbols", "function"] as const;
const modifierKeys = [
  [340, "Shift"],
  [341, "Ctrl"],
  [342, "Alt"],
] as const;
const shifted = computed(() => props.modifiers.includes(340));
interface Key {
  code: number;
  label: string;
}
function characters(plain: string, upper: string): Key[] {
  return Array.from(plain, (c, i) => ({
    code: c.toUpperCase().charCodeAt(0),
    label: shifted.value ? upper.charAt(i) : c,
  }));
}
const rows = computed<Key[][]>(() => {
  switch (page.value) {
    case "letters":
      return ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) =>
        characters(row, row.toUpperCase()),
      );
    case "symbols":
      return [
        characters("1234567890", "!@#$%^&*()"),
        characters("-=[]\\", "_+{}|"),
        characters(";`',./", ':~"<>?'),
      ];
    case "function":
      return [
        Array.from({ length: 6 }, (_, i) => ({ code: 290 + i, label: `F${i + 1}` })),
        Array.from({ length: 6 }, (_, i) => ({ code: 296 + i, label: `F${i + 7}` })),
        [
          { code: 260, label: "Ins" },
          { code: 261, label: "Del" },
          { code: 268, label: "Home" },
          { code: 269, label: "End" },
          { code: 266, label: "PgUp" },
          { code: 267, label: "PgDn" },
        ],
        [
          { code: 263, label: "←" },
          { code: 265, label: "↑" },
          { code: 264, label: "↓" },
          { code: 262, label: "→" },
        ],
      ];
  }
});
const editingKeys = computed<Key[]>(() => [
  { code: 256, label: "Esc" },
  { code: 258, label: "Tab" },
  { code: 32, label: t("touch.space") },
  { code: 259, label: "⌫" },
  { code: 257, label: "Enter" },
]);
function select(next: typeof page.value) {
  emit("clear");
  page.value = next;
}
</script>

<template>
  <div class="keyboard">
    <div class="pages">
      <button
        v-for="name in pages"
        :key="name"
        type="button"
        :aria-pressed="page === name"
        @click="select(name)"
      >
        {{ t(`touch.${name}`) }}
      </button>
    </div>
    <div class="key-grid">
      <div v-for="(row, i) in rows" :key="i" class="row">
        <button
          v-for="key in row"
          :key="key.code"
          type="button"
          :data-code="key.code"
          :data-held="held.has(key.code)"
          :disabled="disabled"
          @click="emit('activate', $event)"
        >
          {{ key.label }}
        </button>
      </div>
    </div>
    <div class="row editing">
      <button
        v-for="key in editingKeys"
        :key="key.code"
        type="button"
        :data-code="key.code"
        :data-held="held.has(key.code)"
        :disabled="disabled"
        :aria-label="key.code === 259 ? t('touch.backspace') : undefined"
        @click="emit('activate', $event)"
      >
        {{ key.label }}
      </button>
    </div>
    <div class="row modifiers">
      <button
        v-for="[ code, label ] in modifierKeys"
        :key="code"
        type="button"
        :disabled="disabled"
        :aria-pressed="props.modifiers.includes(code)"
        @click="emit('modifier', code)"
      >
        {{ label }}
      </button>
      <small>{{ t("touch.nextKey") }}</small>
    </div>
  </div>
</template>

<style scoped>
.keyboard {
  flex: 1;
  min-width: 0;
  container-type: inline-size;
}
.pages,
.row {
  display: flex;
  justify-content: center;
  gap: 3px;
}
.row {
  margin-top: 4px;
}
button {
  min-width: 0;
  min-height: 44px;
  padding: 0 3px;
  border-radius: 6px;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  color: var(--p-text-color);
  font-weight: 600;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--p-primary-color);
}
button:disabled {
  opacity: 0.55;
}
button[aria-pressed="true"],
button[data-held="true"] {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}
.pages {
  justify-content: start;
  margin-bottom: 8px;
}
.pages button,
.modifiers button {
  padding-inline: 8px;
}
.key-grid button {
  flex: 1;
  max-width: 58px;
}
.key-grid,
.editing {
  touch-action: none;
}
.editing button {
  flex: 1;
}
.editing [data-code="32"] {
  flex: 2.4;
}
.modifiers {
  align-items: center;
  justify-content: start;
}
small {
  color: var(--p-text-muted-color);
}
@container (max-width: 300px) {
  .key-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));
    gap: 3px;
  }
  .key-grid .row {
    display: contents;
  }
}
</style>
