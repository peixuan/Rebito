<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { Game } from "../src/library/catalog.ts";
import { type DisplayText, displayMessage, MessageError, message } from "../src/shared/messages.ts";
import type { Profile, Revision } from "../src/storage/revisions.ts";
import { ApiError, errorText } from "./api.ts";
import { formatDate, i18n, t, translate } from "./i18n.ts";
import PlayerControls from "./PlayerControls.vue";
import { runtimeIdentity } from "./runtime/identity.ts";
import { prepareLiveEdit } from "./runtime/live-edit.ts";
import { assertCompatible, downloadProgress, downloadVerified } from "./runtime/progress.ts";
import { createProgressRecovery } from "./runtime/progress-recovery.ts";
import { nativeProgressChanged, publishProgress } from "./runtime/progress-sync.ts";
import type { RuntimeControls, RuntimeHandle, RuntimeWindow } from "./runtime/types.ts";

const props = defineProps<{
  game: Game;
  profileId: string;
  baseRevision: string | null;
  revision: Revision | null;
  editorDirty: boolean;
}>();
const emit = defineEmits<{ saved: []; recovered: [profile: Profile] }>();
const frame = ref<HTMLIFrameElement | null>(null);
const active = ref(false);
const ready = ref(false);
const controls = shallowRef<RuntimeControls | null>(null);
const busy = ref(false);
const paused = ref(false);
const relativeMouse = ref(false);
const integerPixels = ref(true);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const synchronizedAt = ref<number | null>(null);
const conflict = ref(false);
let recoverProgress: ReturnType<typeof createProgressRecovery> | null = null;
let automaticSync: ReturnType<typeof setInterval> | undefined;
let handle: RuntimeHandle | null = null;
let base: string | null = null;
let runningRevision: Revision | null = null;
let changedHead: string | null | undefined;
const pendingEdit = shallowRef<{
  revision: Revision;
  apply: (revision: Revision) => Promise<void>;
  resume: boolean;
} | null>(null);
const pendingSync = computed(() => pendingEdit.value !== null);
let generation = 0;
function runtimeErrorText(cause: unknown) {
  // Expected runtime errors cross frame boundaries as language-neutral descriptors.
  return cause instanceof ApiError
    ? errorText(cause)
    : (displayMessage(cause) ?? message("player.failed"));
}
function markConflict() {
  handle?.pause();
  paused.value = true;
  conflict.value = true;
  error.value = message("player.conflict");
}
async function perform(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
    return true;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) markConflict();
    else error.value = runtimeErrorText(cause);
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
    runningRevision = props.revision;
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
      controls.value = started.controls ?? null;
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
  controls.value = null;
  recoverProgress = null;
  conflict.value = false;
  pendingEdit.value = null;
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
async function save(automatic = false) {
  const current = handle;
  if (!current || !ready.value || busy.value || pendingSync.value || conflict.value) return false;
  return perform(async () => {
    const resume = !paused.value;
    paused.value = true;
    const progress = await current.capture();
    if (progress && (!automatic || (await nativeProgressChanged(progress, runningRevision)))) {
      const revision = await publishProgress(props.profileId, props.game.id, base, progress);
      base = revision.id;
      runningRevision = revision;
      emit("saved");
      synchronizedAt.value = Date.now();
      notice.value = automatic ? message("player.autosaved") : message("player.saved");
    } else if (!automatic) notice.value = message("player.unchanged");
    if (resume) {
      current.resume();
      paused.value = false;
    }
  });
}
async function stopAndSave() {
  if (busy.value || pendingSync.value || conflict.value) return false;
  if (!active.value) return true;
  if (!ready.value || (await save())) return perform(stop);
  return false;
}
async function applyPendingEdit() {
  const pending = pendingEdit.value;
  const current = handle;
  if (!pending || !current) return;
  await perform(async () => {
    await pending.apply(pending.revision);
    base = pending.revision.id;
    runningRevision = pending.revision;
    pendingEdit.value = null;
    notice.value = message("player.editApplied");
    if (pending.resume) {
      current.resume();
      paused.value = false;
    }
  });
}
async function publishEdit(revisionId: string, files: string[], publish: () => Promise<Revision>) {
  const current = handle;
  if (!current?.files) return publish();
  if (busy.value || pendingSync.value || conflict.value)
    throw new ApiError("runtime_busy", 422, message("player.syncRequired"));
  if (revisionId !== base || !runningRevision) {
    markConflict();
    throw new ApiError("conflict", 409);
  }
  const resume = !paused.value;
  busy.value = true;
  error.value = "";
  notice.value = "";
  current.pause();
  paused.value = true;
  try {
    const apply = await prepareLiveEdit(current.files, runningRevision, files);
    const revision = await publish();
    pendingEdit.value = { revision, apply, resume };
    // Publication has succeeded even if local writeback needs a later retry.
    await applyPendingEdit();
    return revision;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) markConflict();
    else if (resume) {
      current.resume();
      paused.value = false;
    }
    throw cause instanceof ApiError
      ? cause
      : new ApiError("runtime_edit_failed", 422, runtimeErrorText(cause));
  } finally {
    busy.value = false;
  }
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
function reconcileHead() {
  if (changedHead === base) changedHead = undefined;
  if (handle && changedHead !== undefined && !busy.value && !pendingSync.value && !conflict.value)
    markConflict();
}
async function recover() {
  const current = handle;
  if (!current || busy.value || pendingSync.value || props.editorDirty) return;
  await perform(async () => {
    paused.value = true;
    if (!recoverProgress) {
      const progress = await current.capture();
      if (!progress) throw new MessageError(message("player.noRecovery"));
      recoverProgress = createProgressRecovery(
        props.game.id,
        t("player.backupName", {
          game: props.game.title.slice(0, 40),
          date: formatDate(Date.now()),
        }),
        progress,
      );
    }
    const profile = await recoverProgress();
    await stop();
    emit("recovered", profile);
  });
}
async function discardLocal() {
  if (busy.value || !window.confirm(t("player.discardConfirm"))) return;
  await perform(async () => {
    await stop();
    emit("saved");
    notice.value = message("player.cloudRetained");
  });
}
watch(
  () => props.baseRevision,
  (value) => {
    changedHead = value;
    reconcileHead();
  },
);
watch(busy, reconcileHead);
function leaving(event: BeforeUnloadEvent) {
  if (!active.value) return;
  event.preventDefault();
  event.returnValue = "";
}
onMounted(() => {
  window.addEventListener("beforeunload", leaving);
  automaticSync = setInterval(() => {
    if (
      props.game.system === "dos" &&
      ready.value &&
      !busy.value &&
      !pendingSync.value &&
      !conflict.value &&
      !error.value
    )
      void save(true);
  }, 30_000);
});
onBeforeUnmount(() => {
  clearInterval(automaticSync);
  window.removeEventListener("beforeunload", leaving);
  void stop();
});
defineExpose({ save, active, ready, busy, pendingSync, conflict, publishEdit, leave: stopAndSave });
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
          :disabled="!ready || busy || pendingSync || conflict"
          @click="togglePause"
        />
        <Button
          :label="t('player.save')"
          size="small"
          :disabled="!ready || pendingSync || conflict"
          :loading="busy"
          @click="save()"
        />
        <Button
          v-if="conflict"
          :label="t('player.recover')"
          :title="t('player.recoverHelp')"
          size="small"
          :disabled="busy || pendingSync || editorDirty"
          @click="recover"
        />
        <Button
          v-if="conflict || pendingSync"
          :label="t('player.discard')"
          size="small"
          severity="secondary"
          :disabled="busy"
          @click="discardLocal"
        />
        <Button
          v-if="pendingSync"
          :label="t('player.retryEdit')"
          size="small"
          :disabled="busy"
          @click="applyPendingEdit"
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
          :disabled="(busy && ready) || pendingSync || conflict"
          @click="stopAndSave"
        />
      </template>
      <span v-if="relativeMouse" class="muted">{{ t("player.mouseHelp") }}</span>
      <span class="muted">{{
        game.system === "dos" ? t("player.dosSyncHelp") : t("player.consoleSyncHelp")
      }}</span>
      <span v-if="synchronizedAt" class="muted">{{
        t("player.lastSync", { time: formatDate(synchronizedAt, true) })
      }}</span>
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <p v-if="active && !ready && !error" role="status">{{ t("player.starting") }}</p>
    <PlayerControls
      v-if="controls"
      :controls="controls"
      @configure="frame?.scrollIntoView({ block: 'nearest' })"
    />
    <p v-if="ready && game.system === 'dos'" class="muted">{{ t("player.dosControls") }}</p>
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
