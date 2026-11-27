<script setup lang="ts">
import Button from "primevue/button";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import { api, errorText } from "./api.ts";
import GameCover from "./GameCover.vue";
import { t, translate } from "./i18n.ts";

const props = defineProps<{ game: Game; disabled: boolean }>();
const emit = defineEmits<{ busy: [value: boolean]; changed: [] }>();
const draft = ref<{ width: number; height: number; rgba: string } | null>();
const preview = ref("");
const expected = ref<string | null>(null);
const error = ref<DisplayText>("");
const notice = ref(false);
const input = ref<HTMLInputElement>();
let generation = 0;
const dirty = computed(() => draft.value !== undefined);
const current = computed(() =>
  props.game.cover ? `/api/games/${props.game.id}/cover/${props.game.cover}` : undefined,
);
function reset() {
  generation++;
  draft.value = undefined;
  preview.value = "";
  error.value = "";
  notice.value = false;
  if (input.value) input.value.value = "";
}
watch(() => props.game.id, reset);
onBeforeUnmount(() => generation++);
defineExpose({ dirty });

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  reset();
  expected.value = props.game.cover ?? null;
  const turn = generation;
  try {
    if (
      file.size > 12 * 1024 ** 2 ||
      !["image/png", "image/webp", "image/jpeg"].includes(file.type)
    )
      throw new Error();
    const image = await createImageBitmap(file);
    try {
      if (turn !== generation) return;
      const ratio = Math.min(1, 256 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let raw = "";
      for (let i = 0; i < bytes.length; i += 4096)
        raw += String.fromCharCode(...bytes.subarray(i, i + 4096));
      draft.value = { width: canvas.width, height: canvas.height, rgba: btoa(raw) };
      preview.value = canvas.toDataURL("image/png");
    } finally {
      image.close();
    }
  } catch {
    if (turn === generation) error.value = message("cover.invalid");
  }
}
function remove() {
  reset();
  expected.value = props.game.cover ?? null;
  draft.value = null;
}
async function save() {
  if (draft.value === undefined || props.disabled) return;
  emit("busy", true);
  error.value = "";
  try {
    await api(`admin/games/${props.game.id}/cover`, {
      image: draft.value,
      expected: expected.value,
    });
    reset();
    notice.value = true;
    emit("changed");
  } catch (cause) {
    error.value = errorText(cause);
    emit("changed");
  } finally {
    emit("busy", false);
  }
}
</script>
<template>
  <fieldset class="edit-cover" :disabled="disabled">
    <legend>{{ t("cover.title") }}</legend>
    <GameCover :system="game.system" :src="dirty ? preview || undefined : current" />
    <div class="cover-fields">
      <label
        >{{ t("cover.choose")
        }}<input
          ref="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          @change="choose"
        ></label
      >
      <small>{{ t("cover.help") }}</small>
      <div class="toolbar">
        <Button
          v-if="game.cover || draft"
          type="button"
          size="small"
          variant="text"
          :label="t('cover.remove')"
          @click="remove"
        />
        <Button v-if="dirty" type="button" size="small" :label="t('cover.save')" @click="save" />
        <Button
          v-if="dirty"
          type="button"
          size="small"
          variant="text"
          :label="t('cover.cancel')"
          @click="reset"
        />
      </div>
      <small v-if="error" role="alert">{{ translate(error) }}</small
      ><small v-if="notice" role="status">{{ t("cover.saved") }}</small>
    </div>
  </fieldset>
</template>
<style scoped>
.edit-cover {
  margin: 0;
  border: 1px solid var(--edge);
  padding: 10px;
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}
.edit-cover legend {
  font-weight: 600;
}
.cover-fields {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.cover-fields label {
  display: grid;
  gap: 4px;
}
.cover-fields small {
  color: var(--muted);
}
</style>
