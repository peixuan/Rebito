<script setup lang="ts">
import { computed, ref } from "vue";
import { type GameSystem, gameSystems } from "../src/domain/systems.ts";

const props = defineProps<{ system: GameSystem; src?: string | undefined }>();
const failed = ref<string>();
const loaded = ref<string>();
const kind = computed(() =>
  props.system === "dos"
    ? "disk"
    : props.system === "segacd"
      ? "disc"
      : ["gb", "gba", "gg"].includes(props.system)
        ? "handheld"
        : "cartridge",
);
</script>

<template>
  <span class="game-cover" :data-medium="kind" aria-hidden="true">
    <img
      v-if="src && src !== failed"
      :key="src"
      @error="failed = src"
      @load="loaded = src"
      :src="src"
      alt=""
      decoding="async"
      loading="lazy"
    >
    <svg
      v-if="!src || src !== loaded || src === failed"
      viewBox="0 0 192 132"
      focusable="false"
      aria-hidden="true"
    >
      <g transform="rotate(-8 96 66)" stroke="currentColor" stroke-width="2">
        <g v-if="kind === 'disk'">
          <path class="plastic" d="M51 15h82l8 9v92H51z" />
          <path class="label" d="M68 15h56v37H68z" />
          <path class="plastic" d="M102 19h12v27h-12z" />
          <path class="label" d="M61 71h68v43H61z" />
          <path d="M66 81h58m-58 7h58M55 105h3m74 3h4" />
        </g>
        <g v-else-if="kind === 'disc'">
          <circle cx="96" cy="65" r="49" class="label" />
          <circle cx="96" cy="65" r="16" class="plastic" />
          <circle cx="96" cy="65" r="7" class="label" />
          <path
            d="M57 44a45 45 0 0 1 20-17m-16 20a38 38 0 0 1 16-13m59 47a42 42 0 0 1-18 20"
            fill="none"
          />
        </g>
        <g v-else-if="kind === 'handheld'">
          <path class="plastic" d="M58 17h68v10h8v86H58z" />
          <path class="label" d="M66 47h59v52H66z" />
          <path d="M62 25h56m-56 5h56m-55 6h59m-47 69h39" />
        </g>
        <g v-else>
          <path class="plastic" d="M38 35h112l5 6v64H37V40z" />
          <path class="label" d="M51 40h80v42H51z" />
          <path d="M41 91h108m-104 7h100m-6-51h10m-10 7h10m-10 7h10" />
        </g>
      </g>
      <text
        v-if="kind !== 'disc'"
        x="96"
        :y="kind === 'disk' ? 99 : kind === 'handheld' ? 77 : 66"
        text-anchor="middle"
        fill="currentColor"
        :transform="'rotate(-8 96 66)'"
      >
        {{ gameSystems[system].shortLabel }}
      </text>
    </svg>
  </span>
</template>

<style scoped>
.game-cover {
  display: grid;
  place-items: center;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 7 / 5;
  background: var(--mat);
  border: 1px solid var(--edge);
}
.game-cover img,
.game-cover svg {
  display: block;
  grid-area: 1 / 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  min-height: 0;
}
.game-cover svg {
  color: #48586c;
  background: #e1e5e4;
}
.game-cover[data-medium="disk"] svg {
  color: #324f70;
  background: #dce7eb;
}
.game-cover[data-medium="cartridge"] svg {
  color: #514e57;
  background: #e8e4dd;
}
.game-cover[data-medium="disc"] svg {
  color: #555975;
  background: #e2e2eb;
}
.plastic {
  fill: currentColor;
  fill-opacity: 0.32;
}
.label {
  fill: #faf7ee;
}
text {
  font: 600 10px / 1 monospace;
  letter-spacing: 0.08em;
}
:global(.dark .game-cover[data-medium] svg) {
  background: #28394a;
  color: #afc5d5;
}
:global(.dark .game-cover .label) {
  fill: #394b5b;
}
</style>
