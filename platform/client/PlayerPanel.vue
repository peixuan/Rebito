<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
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
import { prepareSnapshotEdit } from "./runtime/snapshot-edit.ts";
import { SnapshotEditSession } from "./runtime/snapshot-edit-session.ts";
import type { RuntimeControls, RuntimeHandle, RuntimeWindow } from "./runtime/types.ts";

const props = defineProps<{
  game: Game;
  profileId: string;
  baseRevision: string | null;
  revision: Revision | null;
  editorDirty: boolean;
  workspaceBusy: boolean;
}>();
const emit = defineEmits<{ saved: []; recovered: [profile: Profile] }>();
const frame = ref<HTMLIFrameElement | null>(null);
const active = ref(false);
const ready = ref(false);
const controls = shallowRef<RuntimeControls | null>(null);
const busy = ref(false);
const stopping = ref(false);
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
const snapshotSession = reactive(new SnapshotEditSession());
const captureRequired = computed(
  () =>
    active.value &&
    props.game.system !== "dos" &&
    (!ready.value ||
      !paused.value ||
      !snapshotSession.matches(base) ||
      !snapshotSession.matches(props.baseRevision)),
);
let generation = 0;
function runtimeErrorText(cause: unknown) {
  // Expected runtime errors cross frame boundaries as language-neutral descriptors.
  return cause instanceof ApiError
    ? errorText(cause)
    : (displayMessage(cause) ?? message("player.failed"));
}
function markConflict() {
  snapshotSession.invalidate();
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
  snapshotSession.invalidate();
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
  snapshotSession.invalidate();
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
async function save(automatic = false, keepPaused = false) {
  const current = handle;
  if (!current || !ready.value || busy.value || pendingSync.value || conflict.value) return false;
  return perform(async () => {
    const resume = !paused.value && !keepPaused;
    const captureTicket = current.snapshot ? snapshotSession.beginCapture() : null;
    function resumeCapturedGame() {
      if (resume && (changedHead === undefined || changedHead === base)) {
        snapshotSession.invalidate();
        current?.resume();
        paused.value = false;
      }
    }
    try {
      if (automatic && current.readNativeFiles) {
        const observed = { kind: "filesystem" as const, files: await current.readNativeFiles() };
        if (!(await nativeProgressChanged(observed, runningRevision))) return;
      }
      // The running observation can span game writes. Only this paused, owned
      // collection may be published, and its complete native group is rechecked.
      paused.value = true;
      const progress = await current.capture();
      if (automatic) resumeCapturedGame();
      if (progress && (!automatic || (await nativeProgressChanged(progress, runningRevision)))) {
        const revision = await publishProgress(props.profileId, props.game.id, base, progress);
        base = revision.id;
        runningRevision = revision;
        if (
          captureTicket !== null &&
          progress.kind === "snapshot" &&
          !resume &&
          (changedHead === undefined || changedHead === base)
        )
          snapshotSession.acceptCapture(captureTicket, revision.id);
        emit("saved");
        synchronizedAt.value = Date.now();
        notice.value = automatic ? message("player.autosaved") : message("player.saved");
      } else if (!automatic) notice.value = message("player.unchanged");
      if (!automatic) resumeCapturedGame();
    } catch (cause) {
      // Background upload/retries never recapture or rebase. Preserve even the
      // newer local play made during upload if publication fails or is uncertain.
      current.pause();
      paused.value = true;
      throw cause;
    }
  });
}
async function stopAndSave() {
  if (
    busy.value ||
    stopping.value ||
    pendingSync.value ||
    conflict.value ||
    (props.game.system !== "dos" && props.editorDirty)
  )
    return false;
  if (!active.value) return true;
  // Keep cloud mutations locked across capture, publication and runtime shutdown.
  stopping.value = true;
  try {
    if (!ready.value || (await save())) return await perform(stop);
    return false;
  } finally {
    stopping.value = false;
  }
}
async function applyPendingEdit() {
  const pending = pendingEdit.value;
  const current = handle;
  if (!pending || !current) return;
  await perform(async () => {
    if (current.snapshot) snapshotSession.invalidate();
    await pending.apply(pending.revision);
    base = pending.revision.id;
    runningRevision = pending.revision;
    pendingEdit.value = null;
    notice.value = message(current.snapshot ? "player.snapshotEditApplied" : "player.editApplied");
    if (pending.resume && (changedHead === undefined || changedHead === base)) {
      current.resume();
      paused.value = false;
    }
  });
}
async function publishEdit(revisionId: string, files: string[], publish: () => Promise<Revision>) {
  const current = handle;
  if (!current && captureRequired.value)
    throw new ApiError("runtime_capture_required", 422, message("player.captureRequired"));
  if (!current || (!current.files && !current.snapshot)) return publish();
  if (busy.value || pendingSync.value || conflict.value)
    throw new ApiError("runtime_busy", 422, message("player.syncRequired"));
  if (revisionId !== base || !runningRevision) {
    markConflict();
    throw new ApiError("conflict", 409);
  }
  if (current.snapshot && captureRequired.value)
    throw new ApiError("runtime_capture_required", 422, message("player.captureRequired"));
  const resume = !paused.value;
  let prepared = false;
  busy.value = true;
  error.value = "";
  notice.value = "";
  current.pause();
  paused.value = true;
  try {
    const apply = current.snapshot
      ? await prepareSnapshotEdit(current.snapshot, runningRevision)
      : current.files
        ? await prepareLiveEdit(current.files, runningRevision, files)
        : undefined;
    if (!apply) throw new MessageError(message("player.syncRequired"));
    prepared = true;
    const revision = await publish();
    pendingEdit.value = { revision, apply, resume };
    // Publication has succeeded even if local writeback needs a later retry.
    await applyPendingEdit();
    return revision;
  } catch (cause) {
    if (current.snapshot && !prepared) snapshotSession.invalidate();
    if (cause instanceof ApiError && cause.status === 409) markConflict();
    else if (resume && !current.snapshot) {
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
  else {
    snapshotSession.invalidate();
    handle.resume();
  }
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
  if (handle && changedHead !== undefined) {
    snapshotSession.invalidate();
    handle.pause();
    paused.value = true;
    if (!busy.value && !pendingSync.value && !conflict.value) markConflict();
  }
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
defineExpose({
  save,
  active,
  ready,
  busy,
  stopping,
  pendingSync,
  conflict,
  captureRequired,
  publishEdit,
  leave: stopAndSave,
});
</script>

<template>
  <section class="profile-panel" :aria-label="t('player.window')">
    <div class="toolbar">
      <Button
        v-if="!active"
        :label="t('player.start')"
        size="small"
        :disabled="workspaceBusy || baseRevision !== (revision?.id ?? null)"
        @click="active = true"
      />
      <template v-else>
        <Button
          :label="paused ? t('player.resume') : t('player.pause')"
          size="small"
          severity="secondary"
          :disabled="
            !ready || busy || pendingSync || conflict || (game.system !== 'dos' && editorDirty)
          "
          @click="togglePause"
        />
        <Button
          v-if="game.editor && game.system !== 'dos'"
          :label="t('player.captureEdit')"
          :title="t('player.captureEditHelp')"
          size="small"
          :disabled="!ready || busy || pendingSync || conflict || editorDirty"
          @click="save(false, true)"
        />
        <Button
          :label="t('player.save')"
          size="small"
          :disabled="!ready || pendingSync || conflict || (game.system !== 'dos' && editorDirty)"
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
          :disabled="
            (busy && ready) || pendingSync || conflict || (game.system !== 'dos' && editorDirty)
          "
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
