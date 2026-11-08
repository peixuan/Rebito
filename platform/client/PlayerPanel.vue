<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { onBeforeUnmount, ref, watch } from "vue";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, MessageError, message } from "../src/shared/messages.ts";
import type { Revision } from "../src/storage/revisions.ts";
import { ApiError, api, errorText } from "./api.ts";
import { i18n, t, translate } from "./i18n.ts";
import { runtimeIdentity } from "./runtime/identity.ts";
import { assertCompatible, downloadProgress, downloadVerified } from "./runtime/progress.ts";
import type { RuntimeHandle, RuntimeWindow } from "./runtime/types.ts";

const props = defineProps<{
  game: Game;
  profileId: string;
  baseRevision: string | null;
  revision: Revision | null;
}>();
const emit = defineEmits<{ saved: [] }>();
const frame = ref<HTMLIFrameElement | null>(null);
const active = ref(false);
const ready = ref(false);
const busy = ref(false);
const paused = ref(false);
const relativeMouse = ref(false);
const integerPixels = ref(true);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
let handle: RuntimeHandle | null = null;
let base: string | null = null;
let generation = 0;
function runtimeErrorText(cause: unknown) {
  return cause instanceof ApiError
    ? errorText(cause)
    : cause instanceof Error
      ? cause.message
      : message("player.failed");
}
async function perform(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
    return true;
  } catch (cause) {
    error.value = runtimeErrorText(cause);
    return false;
  } finally {
    busy.value = false;
  }
}
async function boot() {
  const ticket = ++generation;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    base = props.baseRevision;
    if (base !== (props.revision?.id ?? null))
      throw new MessageError(message("player.refreshRequired"));
    if (props.revision)
      assertCompatible(props.game, props.revision, runtimeIdentity(props.game.system));
    const gameBytes = await downloadVerified(`/api/games/${props.game.id}/asset`, props.game);
    const progress = props.revision ? await downloadProgress(props.revision) : null;
    if (ticket !== generation) return;
    const host = frame.value?.contentWindow as RuntimeWindow | null;
    if (!host?.retroRuntime) throw new MessageError(message("player.notReady"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const started = await Promise.race([
        host.retroRuntime.start({
          locale: i18n.global.locale.value,
          game: props.game,
          profileId: props.profileId,
          gameBytes,
          progress,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new MessageError(message("player.startTimeout"))),
            60_000,
          );
        }),
      ]);
      if (ticket !== generation) {
        await started.stop();
        return;
      }
      handle = started;
      ready.value = true;
    } finally {
      clearTimeout(timer);
    }
  } catch (cause) {
    if (ticket === generation) error.value = runtimeErrorText(cause);
  } finally {
    if (ticket === generation) busy.value = false;
  }
}
async function stop() {
  generation++;
  const current = handle;
  handle = null;
  ready.value = false;
  try {
    if (current) await current.stop();
  } finally {
    active.value = false;
    paused.value = false;
    relativeMouse.value = false;
    integerPixels.value = true;
  }
}
async function save() {
  const current = handle;
  if (!current || !ready.value || busy.value) return false;
  return perform(async () => {
    const resume = !paused.value;
    paused.value = true;
    const progress = await current.capture();
    if (progress) {
      const body = new FormData();
      body.append(
        "metadata",
        JSON.stringify({
          kind: progress.kind,
          runtime: progress.runtime,
          releaseId: props.game.id,
          baseRevision: base,
        }),
      );
      for (const file of progress.files) body.append("file", new Blob([file.bytes]), file.name);
      const revision = await api<Revision>(`profiles/${props.profileId}/revisions`, body);
      base = revision.id;
      emit("saved");
      notice.value = message("player.saved");
    } else notice.value = message("player.unchanged");
    if (resume) {
      current.resume();
      paused.value = false;
    }
  });
}
async function stopAndSave() {
  if (!ready.value || (await save())) await perform(stop);
}
function togglePause() {
  if (!handle) return;
  paused.value = !paused.value;
  if (paused.value) handle.pause();
  else handle.resume();
}
function toggleMouse() {
  if (!handle?.setMouseCapture) return;
  relativeMouse.value = !relativeMouse.value;
  handle.setMouseCapture(relativeMouse.value);
}
function togglePixels() {
  if (!handle?.setIntegerScaling) return;
  integerPixels.value = !integerPixels.value;
  handle.setIntegerScaling(integerPixels.value);
}
watch(
  () => props.baseRevision,
  (value) => {
    if (handle && value !== base) void perform(stop);
  },
);
onBeforeUnmount(() => {
  void stop();
});
defineExpose({ save, active, ready, busy });
</script>

<template>
  <section class="profile-panel" :aria-label="t('player.window')">
    <div class="toolbar">
      <Button
        v-if="!active"
        :label="t('player.start')"
        size="small"
        :disabled="baseRevision !== (revision?.id ?? null)"
        @click="active = true"
      />
      <template v-else>
        <Button
          :label="paused ? t('player.resume') : t('player.pause')"
          size="small"
          severity="secondary"
          :disabled="!ready || busy"
          @click="togglePause"
        />
        <Button
          :label="t('player.save')"
          size="small"
          :disabled="!ready"
          :loading="busy"
          @click="save"
        />
        <Button
          v-if="game.system === 'dos'"
          :label="t('player.integerPixels')"
          :title="t('player.integerPixelsHelp')"
          size="small"
          severity="secondary"
          :aria-pressed="integerPixels"
          :disabled="!ready || busy"
          @click="togglePixels"
        />
        <Button
          v-if="game.system === 'dos'"
          :label="t('player.relativeMouse')"
          size="small"
          severity="secondary"
          :aria-pressed="relativeMouse"
          :disabled="!ready || busy"
          @click="toggleMouse"
        />
        <Button
          :label="t('player.stop')"
          :title="t('player.stopHelp')"
          size="small"
          severity="secondary"
          :disabled="busy && ready"
          @click="stopAndSave"
        />
      </template>
      <span v-if="relativeMouse" class="muted">{{ t("player.mouseHelp") }}</span>
      <span class="muted">{{
        game.system === "dos" ? t("player.manualSyncHelp") : t("player.keyboardHelp")
      }}</span>
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <p v-if="active && !ready && !error" role="status">{{ t("player.starting") }}</p>
    <iframe
      v-if="active"
      ref="frame"
      class="player-frame"
      src="/runtime.html"
      :title="t('player.frame')"
      allow="autoplay; gamepad; fullscreen"
      @load="boot"
    />
  </section>
</template>
