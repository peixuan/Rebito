<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { t, translate } from "./i18n.ts";
import type { TouchInput } from "./runtime/touch-input.ts";

const props = defineProps<{ input: TouchInput | null; disabled: boolean }>();
const open = ref(false);
const pad = ref<HTMLElement>();
const held = shallowRef(new Set<number>());
const arrows = [
  [0, "controls.up", "↑"],
  [1, "controls.down", "↓"],
  [2, "controls.left", "←"],
  [3, "controls.right", "→"],
] as const;
let accessibleContact = -1;
function clear() {
  props.input?.clear();
  held.value = new Set();
}
watch(
  () => props.input,
  (_, previous) => {
    previous?.clear();
    open.value = false;
    clear();
  },
);
watch([open, () => props.disabled], clear, { flush: "sync" });
function update(id: number, keys: number[] | null) {
  props.input?.update(id, keys);
  held.value = props.input?.held() ?? new Set();
}
function slide(event: PointerEvent) {
  const el = pad.value;
  const input = props.input;
  if (!el || !input || !el.hasPointerCapture(event.pointerId) || !input.tracks(event.pointerId))
    return;
  const box = el.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  const keys: number[] = [];
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    if (y < 0.34) keys.push(input.directions[0]);
    if (y > 0.66) keys.push(input.directions[1]);
    if (x < 0.34) keys.push(input.directions[2]);
    if (x > 0.66) keys.push(input.directions[3]);
  }
  update(event.pointerId, keys);
}
function press(event: PointerEvent) {
  if (!props.input || props.disabled || event.button !== 0 || !(event.target instanceof Element))
    return;
  const button = event.target.closest<HTMLElement>("[data-code]");
  const isPad = pad.value?.contains(event.target);
  const target = isPad ? pad.value : button;
  if (!target) return;
  event.preventDefault();
  target.setPointerCapture(event.pointerId);
  update(event.pointerId, isPad ? [] : [Number(target.dataset.code)]);
  if (isPad) slide(event);
}
function release(event: PointerEvent) {
  if (props.input?.tracks(event.pointerId)) update(event.pointerId, null);
}
function activate(event: MouseEvent) {
  if (event.detail !== 0 || props.disabled || !(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLElement>("[data-code]");
  if (!button || !props.input) return;
  const id = accessibleContact--;
  const input = props.input;
  update(id, [Number(button.dataset.code)]);
  // Give a screen-reader or keyboard activation one observable emulator frame.
  setTimeout(() => {
    if (input.tracks(id)) update(id, null);
  }, 80);
}
function visibility() {
  if (document.hidden) clear();
}
onMounted(() => {
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  clear();
  window.removeEventListener("blur", clear);
  window.removeEventListener("pagehide", clear);
  document.removeEventListener("visibilitychange", visibility);
});
</script>

<template>
  <div class="play-surface" :class="{ expanded: open }">
    <slot />
    <div v-if="input" class="deck">
      <button class="deck-toggle" type="button" :aria-expanded="open" @click="open = !open">
        {{ t("touch.controller") }}
        <span aria-hidden="true">{{ open ? "▴" : "▾" }}</span>
      </button>
      <fieldset
        v-if="open"
        class="keys"
        :aria-label="t('touch.controller')"
        @pointerdown="press"
        @pointermove="slide"
        @pointerup="release"
        @pointercancel="release"
        @lostpointercapture="release"
        @contextmenu.prevent
      >
        <div ref="pad" class="dpad" :class="{ disabled }">
          <button
            v-for="[ i, label, arrow ] in arrows"
            :key="label"
            type="button"
            :disabled="disabled"
            @click="activate"
            :data-code="input.directions[i]"
            :data-held="held.has(input.directions[i])"
            :aria-label="t(label)"
          >
            {{ arrow }}
          </button>
        </div>
        <div class="actions">
          <button
            v-for="key in input.buttons"
            :key="key.code"
            type="button"
            :disabled="disabled"
            :data-held="held.has(key.code)"
            @click="activate"
            :data-code="key.code"
          >
            {{ translate(key.label) }}
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.play-surface {
  max-width: 960px;
  margin: 16px auto 0;
}
.play-surface :deep(.player-frame) {
  margin: 0 auto;
}
.deck {
  padding: 4px 0;
  color: var(--p-text-color);
}
button {
  font: inherit;
  color: inherit;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 8px;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}
.deck-toggle {
  padding: 0 12px;
  min-height: 44px;
  font-weight: 600;
}
.deck-toggle span {
  margin-inline-start: 6px;
}
.deck-toggle[aria-expanded="true"],
button[data-held="true"] {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}
.keys {
  border: 0;
  min-width: 0;
  margin-inline: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  margin-top: 4px;
  background: var(--p-content-hover-background);
  border-radius: 12px;
  user-select: none;
  -webkit-user-select: none;
}
.dpad,
.actions {
  touch-action: none;
}
.dpad {
  flex: none;
  display: grid;
  width: 132px;
  height: 132px;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  border-radius: 35%;
  background: var(--p-content-border-color);
}
.dpad button {
  font-size: 20px;
  font-weight: 600;
}
.dpad button:nth-child(1) {
  grid-area: 1 / 2;
}
.dpad button:nth-child(2) {
  grid-area: 3 / 2;
}
.dpad button:nth-child(3) {
  grid-area: 2 / 1;
}
.dpad button:nth-child(4) {
  grid-area: 2 / 3;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  max-width: 19rem;
}
.actions button {
  min-width: 44px;
  min-height: 44px;
  padding: 4px 8px;
  font-weight: 600;
}
button:disabled,
.dpad.disabled {
  opacity: 0.55;
}
@media (orientation: landscape) and (max-height: 540px) and (min-width: 620px) {
  .expanded {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 36%);
    align-items: center;
    gap: 8px;
  }
  .expanded :deep(.player-frame) {
    max-width: calc((100svh - 16px) * 4 / 3);
  }
}
</style>
