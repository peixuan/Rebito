<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { GameSystem } from "../src/domain/systems.ts";
import type { DisplayText } from "../src/shared/messages.ts";
import DosTouchKeyboard from "./DosTouchKeyboard.vue";
import { t, translate } from "./i18n.ts";
import type { TouchInput } from "./runtime/touch-input.ts";

const props = defineProps<{ input: TouchInput | null; disabled: boolean; system: GameSystem }>();
const mode = ref<"controller" | "keyboard" | null>(null);
const modifiers = ref<number[]>([]);
const pad = ref<HTMLElement>();
const surface = ref<HTMLElement>();
let layoutObserver: ResizeObserver | undefined;
let pendingFit = 0;
const held = shallowRef(new Set<number>());
const arrows = [
  [0, "controls.up", "↑"],
  [1, "controls.down", "↓"],
  [2, "controls.left", "←"],
  [3, "controls.right", "→"],
] as const;
function legend(label: DisplayText) {
  if (typeof label !== "string") {
    switch (label.messageId) {
      case "controls.mode":
        return "MODE";
      case "controls.select":
        return "SELECT";
      case "controls.start":
        return "START";
      case "controls.buttonOneStart":
        return "1 / START";
      case "controls.buttonOne":
        return "1";
      case "controls.buttonTwo":
        return "2";
    }
  }
  return translate(label);
}
let accessibleContact = -1;
function clear() {
  props.input?.clear();
  held.value = new Set();
  modifiers.value = [];
}
watch(
  () => props.input,
  (_, previous) => {
    previous?.clear();
    mode.value = null;
    clear();
  },
);
watch([mode, () => props.disabled], clear, { flush: "sync" });
function update(id: number, keys: number[] | null) {
  props.input?.update(id, keys);
  held.value = props.input?.held() ?? new Set();
}
function chord(code: number) {
  const keys = [...modifiers.value, code];
  modifiers.value = [];
  return keys;
}
function toggleModifier(code: number) {
  modifiers.value = modifiers.value.includes(code)
    ? modifiers.value.filter((key) => key !== code)
    : [...modifiers.value, code];
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
  update(event.pointerId, isPad ? [] : chord(Number(target.dataset.code)));
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
  update(id, chord(Number(button.dataset.code)));
  // Give a screen-reader or keyboard activation one observable emulator frame.
  setTimeout(() => {
    if (input.tracks(id)) update(id, null);
  }, 80);
}
function visibility() {
  if (document.hidden) clear();
}
function fitScreen() {
  if (!surface.value) return;
  // Measure the header, wrapped profile title and any save notices above the game.
  // Document coordinates keep the frame size stable when the player scrolls.
  const top = Math.ceil(surface.value.getBoundingClientRect().top + window.scrollY);
  surface.value.style.setProperty("--screen-top", `${top}px`);
}
onMounted(() => {
  fitScreen();
  layoutObserver = new ResizeObserver(() => {
    cancelAnimationFrame(pendingFit);
    pendingFit = requestAnimationFrame(fitScreen);
  });
  layoutObserver.observe(document.body);
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  layoutObserver?.disconnect();
  cancelAnimationFrame(pendingFit);
  clear();
  window.removeEventListener("blur", clear);
  window.removeEventListener("pagehide", clear);
  document.removeEventListener("visibilitychange", visibility);
});
</script>

<template>
  <div
    ref="surface"
    class="play-surface"
    :class="{ expanded: mode, 'dos-screen': system === 'dos' }"
  >
    <div class="screen-mat"><slot /></div>
    <div v-if="input" class="deck">
      <button
        class="deck-toggle"
        type="button"
        :aria-expanded="mode === 'controller'"
        @click="mode = mode === 'controller' ? null : 'controller'"
      >
        {{ t("touch.controller") }}
        <span aria-hidden="true">{{ mode === "controller" ? "▴" : "▾" }}</span>
      </button>
      <button
        v-if="system === 'dos'"
        class="deck-toggle"
        type="button"
        :aria-expanded="mode === 'keyboard'"
        @click="mode = mode === 'keyboard' ? null : 'keyboard'"
      >
        {{ t("touch.keyboard") }}
        <span aria-hidden="true">{{ mode === "keyboard" ? "▴" : "▾" }}</span>
      </button>
      <fieldset
        v-if="mode"
        class="keys"
        :aria-label="t(mode === 'keyboard' ? 'touch.keyboard' : 'touch.controller')"
        @pointerdown="press"
        @pointermove="slide"
        @pointerup="release"
        @pointercancel="release"
        @lostpointercapture="release"
        @contextmenu.prevent
      >
        <DosTouchKeyboard
          v-if="mode === 'keyboard'"
          :held="held"
          :disabled="disabled"
          :modifiers="modifiers"
          @activate="activate"
          @modifier="toggleModifier"
          @clear="clear"
        />
        <template v-else>
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
          <div class="actions" :data-system="system">
            <button
              v-for="key in input.buttons"
              :key="key.code"
              type="button"
              :disabled="disabled"
              :data-held="held.has(key.code)"
              @click="activate"
              :data-code="key.code"
              :aria-label="translate(key.label)"
              :style="{ gridArea: `k${key.code}` }"
            >
              {{ legend(key.label) }}
            </button>
          </div>
        </template>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.play-surface {
  min-width: 0;
}
.screen-mat {
  display: grid;
  place-items: center;
  background: #111;
}
.play-surface :deep(.player-frame) {
  width: min(100%, 960px);
  margin: 0 auto;
}
@media (min-width: 760px) and (min-height: 500px) {
  .play-surface :deep(.player-frame) {
    width: min(100%, 960px, max(320px, calc((100svh - var(--screen-top) - 12px) * 4 / 3)));
  }
  /* DOS video modes can be wider than 4:3. Its renderer fits the native canvas. */
  .dos-screen :deep(.player-frame) {
    width: min(100%, 960px);
    max-height: max(240px, calc(100svh - var(--screen-top) - 12px));
  }
}
.deck {
  container-type: inline-size;
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
.deck-toggle + .deck-toggle {
  margin-inline-start: 4px;
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
  display: grid;
  gap: 4px;
  justify-items: stretch;
  grid-auto-columns: minmax(44px, auto);
}
.actions button {
  min-width: 44px;
  min-height: 44px;
  padding: 4px 8px;
  font-weight: 600;
}
/* Area numbers are the native pad indices (DOS uses its key codes). */
.actions[data-system="dos"] {
  grid-template-areas: "k256 k257" "k341 k32";
}
.actions:is([data-system="nes"], [data-system="gb"]) {
  grid-template-areas: "k0 k8" "k2 k3";
}
.actions[data-system="gba"] {
  grid-template-areas: "k10 k11" "k0 k8" "k2 k3";
}
.actions[data-system="snes"] {
  grid-template-areas: "k10 . k11" ". k9 ." "k1 . k8" ". k0 ." "k2 k2 k3";
}
.actions:is([data-system="md"], [data-system="segacd"]) {
  grid-template-areas: "k10 k9 k11" "k1 k0 k8" "k2 k3 k3";
}
.actions[data-system="sms"] {
  grid-template-areas: "k0 k8";
}
.actions[data-system="gg"] {
  grid-template-areas: "k0 k8" "k3 k3";
}
.actions:not([data-system="dos"]) button {
  border-radius: 24px;
}
.actions button:is([data-code="2"], [data-code="3"]) {
  font-size: 11px;
  letter-spacing: 0.025em;
  border-radius: 8px;
}
.dpad::before {
  content: "";
  grid-area: 2 / 2;
  place-self: center;
  width: 9px;
  aspect-ratio: 1;
  background: var(--p-text-muted-color);
  border-radius: 50%;
  pointer-events: none;
}
@container (max-width: 310px) {
  .keys:has(.actions) {
    padding-inline: 2px;
    gap: 4px;
  }
  .keys .actions button {
    padding-inline: 3px;
  }
}
@container (max-width: 281px) {
  .keys:has(.actions:is([data-system="md"], [data-system="segacd"], [data-system="snes"])) {
    flex-wrap: wrap;
    justify-content: center;
  }
}
button:disabled,
.dpad.disabled {
  opacity: 0.55;
}
@media (max-width: 380px) {
  .play-surface {
    margin-inline: -14px;
  }
}
@media (orientation: landscape) and (max-height: 540px) and (min-width: 620px) {
  .expanded {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(290px, 38%);
    align-items: center;
    gap: 8px;
  }
  .expanded :deep(.player-frame) {
    max-width: calc((100svh - 16px) * 4 / 3);
  }
}
</style>
