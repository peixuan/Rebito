<script setup lang="ts">
import "./editor-messages.ts";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { EditorBatch, EditorQuery, EditorResponse } from "../src/editors/service.ts";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { Revision } from "../src/storage/revisions.ts";
import { api, errorText } from "./api.ts";
import EditorBatchControls from "./controls/EditorBatch.vue";
import {
  changeEditorField,
  previewedEditorChanges,
  resolveEditorFields,
} from "./controls/editor-fields.ts";
import FieldGrid from "./controls/FieldGrid.vue";
import RecordTable from "./controls/RecordTable.vue";
import TextFields from "./controls/TextFields.vue";
import { localize, t, translate } from "./i18n.ts";

const props = defineProps<{
  revisionId: string;
  workspaceBusy: boolean;
  captureRequired?: boolean;
  publish?: (revisionId: string, batch: EditorBatch) => Promise<Revision>;
}>();
const emit = defineEmits<{ saved: [revision: Revision]; dirty: [value: boolean] }>();
const view = ref<EditorResponse | null>(null);
const base = ref(props.revisionId);
const running = ref(0);
const busy = computed(() => running.value > 0 || props.workspaceBusy);
let requestId = 0;
const stale = ref(false);
const error = ref<DisplayText>("");
const notice = ref<DisplayText>("");
const showPreview = ref(false);
const invalid = reactive(new Set<string>());
const pendingInput = reactive(new Set<string>());
type Changes = Record<string, number>;
const drafts = reactive(new Map<string, Map<number, Changes>>());
const textDrafts = reactive(new Map<string, Map<number, Record<string, string>>>());
const previews = reactive(new Map<string, Map<number, EditorResponse["preview"]>>());
const selections = new Map<string, string>();
function draft(file: string, slot: number): Changes {
  if (!drafts.has(file)) drafts.set(file, new Map());
  const slots = drafts.get(file);
  if (!slots) throw new Error("Missing draft collection");
  if (!slots.has(slot)) slots.set(slot, {});
  return slots.get(slot) ?? {};
}
function textDraft(file: string, slot: number) {
  if (!textDrafts.has(file)) textDrafts.set(file, new Map());
  const slots = textDrafts.get(file);
  if (!slots) throw new Error("Missing text draft collection");
  if (!slots.has(slot)) slots.set(slot, {});
  return slots.get(slot) ?? {};
}
const allDrafts = computed(() => [...drafts.values(), ...textDrafts.values()]);
const dirty = computed(
  () =>
    Boolean(invalid.size || pendingInput.size) ||
    allDrafts.value.some((slots) =>
      [...slots.values()].some((values) => Object.keys(values).length),
    ),
);
const count = computed(() =>
  allDrafts.value
    .flatMap((slots) => [...slots.values()])
    .reduce((sum, values) => sum + Object.keys(values).length, 0),
);
const fields = computed(() =>
  resolveEditorFields(
    view.value?.fields ?? [],
    drafts.get(view.value?.file ?? "")?.get(view.value?.slot ?? 0) ?? {},
  ),
);
const previewRows = computed(() =>
  [...(previews.get(view.value?.file ?? "") ?? [])].flatMap(([slot, values]) =>
    values.map((value) => ({ ...localize(value), slot: slot + 1 })),
  ),
);
watch(dirty, (value) => emit("dirty", value));
async function perform(action: () => Promise<void>) {
  running.value++;
  error.value = "";
  notice.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    running.value--;
  }
}
async function refresh(selection: EditorQuery = {}) {
  const ticket = ++requestId;
  const revision = base.value;
  const current = view.value;
  const file = selection.file ?? current?.file;
  const slot =
    selection.slot ??
    (selection.file ? drafts.get(selection.file)?.keys().next().value : current?.slot);
  const module = selection.module ?? current?.module;
  const remembered =
    file && slot !== undefined && module ? selections.get(`${file}:${slot}:${module}`) : undefined;
  const response = await api<EditorResponse>(`revisions/${revision}/editor/preview`, {
    file,
    slot,
    module,
    record: selection.record ?? remembered,
    changes: file && slot !== undefined ? draft(file, slot) : {},
    textChanges: file && slot !== undefined ? textDraft(file, slot) : {},
    ...selection,
  });
  if (ticket !== requestId || revision !== base.value) return;
  // Drop semantic no-ops while retaining the server-expanded linked actions.
  draft(response.file, response.slot);
  drafts.get(response.file)?.set(response.slot, previewedEditorChanges(response));
  textDraft(response.file, response.slot);
  textDrafts.get(response.file)?.set(response.slot, response.textChanges ?? {});
  if (!previews.has(response.file)) previews.set(response.file, new Map());
  previews.get(response.file)?.set(response.slot, response.preview);
  view.value = response;
  selections.set(`${response.file}:${response.slot}:${response.module}`, response.selected);
}
function change(key: string, value: number) {
  if (!view.value) return;
  const next = changeEditorField(
    view.value.fields,
    draft(view.value.file, view.value.slot),
    key,
    value,
  );
  drafts.get(view.value.file)?.set(view.value.slot, next);
  const row = view.value.records.find((item) => item.id === view.value?.selected);
  if (row)
    for (const field of resolveEditorFields(view.value.fields, next)) {
      const value = field.value;
      row.cells[field.columnId] = field.choices
        ? (field.choices.find((choice) => choice.value === value)?.label ??
          message("editor.unknownValue", { value }))
        : field.boolean
          ? value
            ? message("common.yes")
            : message("common.no")
          : (value * (field.multiplier ?? 1)) / (field.divisor ?? 1);
    }
}
function changeText(key: string, value: string) {
  const current = view.value;
  const field = current?.textFields?.find((field) => field.key === key);
  if (current && field && !field.readonly) textDraft(current.file, current.slot)[key] = value;
}
async function navigate(selection: EditorQuery) {
  await refresh(); // Preserve and validate the previous slot before switching.
  await refresh(selection);
}
async function runAction(action: EditorResponse["actions"][number]) {
  const current = view.value;
  if (!current) return;
  if (action.textDefaults) {
    Object.assign(
      textDraft(current.file, current.slot),
      Object.fromEntries(
        Object.entries(action.textDefaults).map(([key, value]) => [key, translate(value)]),
      ),
    );
    await refresh();
    showPreview.value = true;
  } else await refresh({ action: { id: action.id, record: current.selected } });
}
async function save() {
  await refresh();
  if (!view.value) return;
  const files = [...drafts]
    .map(([file, slots]) => ({
      file,
      edits: [...slots]
        .map(([slot, changes]) => ({ slot, changes, textChanges: textDraft(file, slot) }))
        .filter(
          ({ changes, textChanges }) =>
            Object.keys(changes).length || Object.keys(textChanges).length,
        ),
    }))
    .filter((entry) => entry.edits.length);
  if (!files.length) {
    notice.value = message("editor.noChanges");
    return;
  }
  const revision = props.publish
    ? await props.publish(base.value, { files })
    : await api<Revision>(`revisions/${base.value}/editor`, { files });
  base.value = revision.id;
  drafts.clear();
  textDrafts.clear();
  previews.clear();
  emit("saved", revision);
  await refresh();
  notice.value = message("editor.saved");
}
async function discard() {
  drafts.clear();
  textDrafts.clear();
  previews.clear();
  selections.clear();
  invalid.clear();
  pendingInput.clear();
  view.value = null;
  base.value = props.revisionId;
  stale.value = false;
  await refresh();
}
watch(
  () => props.revisionId,
  (value) => {
    if (value === base.value) return;
    if (dirty.value) stale.value = true;
    else {
      base.value = value;
      void perform(() => refresh());
    }
  },
);
function leaving(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", leaving);
  void perform(() => refresh());
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", leaving);
  emit("dirty", false);
});
</script>

<template>
  <section class="profile-panel editor" :aria-label="t('editor.title')">
    <div class="toolbar">
      <h3>{{ t("editor.title") }}</h3>
      <Select
        v-if="view"
        :model-value="view.slot"
        :options="localize(view.slots)"
        option-label="label"
        option-value="index"
        :option-disabled="(slot) => !slot.available"
        :aria-label="t('editor.slot')"
        size="small"
        :disabled="busy || stale || Boolean(invalid.size)"
        @update:model-value="perform(() => navigate({ slot: $event }))"
      />
      <Select
        v-if="view && view.files.length > 1"
        :model-value="view.file"
        :options="view.files"
        :aria-label="t('editor.file')"
        size="small"
        :disabled="busy || stale || Boolean(invalid.size)"
        @update:model-value="perform(() => navigate({ file: $event }))"
      />
      <Button
        :label="t('editor.discard')"
        size="small"
        severity="secondary"
        :disabled="busy"
        @click="perform(discard)"
      />
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <Message v-if="notice" severity="success" role="status">{{ translate(notice) }}</Message>
    <Message v-if="stale" severity="warn" role="alert">{{ t("editor.stale") }}</Message>
    <Message v-if="captureRequired" severity="info" role="note" aria-live="polite">{{
      t("editor.captureRequired")
    }}</Message>
    <template v-if="view">
      <p class="editor-guidance">{{ translate(view.instructions) }}</p>
      <nav class="editor-tabs" :aria-label="t('editor.modules')">
        <Button
          v-for="module in view.modules"
          :key="module.id"
          :label="translate(module.label)"
          size="small"
          :severity="module.id === view.module ? 'primary' : 'secondary'"
          :aria-pressed="module.id === view.module"
          :disabled="busy || stale || Boolean(invalid.size)"
          @click="perform(() => navigate({ module: module.id }))"
        />
      </nav>
      <div class="editor-content" :class="{ 'has-records': view.records.length > 1 }">
        <RecordTable
          v-if="view.records.length > 1"
          :rows="view.records"
          :columns="view.columns"
          :filter="view.filter"
          :selected="view.selected"
          :view-key="view.module"
          :disabled="busy || stale || Boolean(invalid.size)"
          @select="perform(() => navigate({ record: $event }))"
        />
        <div class="record-detail">
          <h4>
            {{ translate(view.records.find((record) => record.id === view?.selected)?.label) }}
          </h4>
          <TextFields
            v-if="view.textFields?.length"
            :fields="view.textFields"
            :changes="textDraft(view.file, view.slot)"
            :disabled="busy || stale || captureRequired"
            @change="changeText"
          />
          <FieldGrid
            :key="`${view.file}:${view.slot}:${view.selected}`"
            :fields="fields"
            :disabled="busy || stale || captureRequired"
            @change="change"
            @valid="(key, valid) => (valid ? invalid.delete(key) : invalid.add(key))"
            @pending="
              (key, pending) => (pending ? pendingInput.add(key) : pendingInput.delete(key))
            "
          />
          <div class="editor-actions">
            <EditorBatchControls
              v-if="view.batchKeys?.length"
              :key="`${view.file}:${view.slot}:${view.module}`"
              :view="view"
              :keys="view.batchKeys"
              :changes="draft(view.file, view.slot)"
              :disabled="busy || stale || captureRequired || Boolean(invalid.size)"
              @apply="
                (targets) =>
                  perform(() =>
                    refresh({
                      action: { id: 'copy-fields', record: view?.selected ?? '', targets },
                    }),
                  )
              "
            />
            <Button
              v-for="action in view.actions"
              :key="action.id"
              :label="translate(action.label)"
              :title="translate(action.help)"
              size="small"
              severity="secondary"
              :disabled="busy || stale || captureRequired || Boolean(invalid.size)"
              @click="perform(() => runAction(action))"
            />
          </div>
        </div>
      </div>
      <div class="editor-footer">
        <span>{{ t("editor.pendingChanges", { count }) }}</span>
        <Button
          :label="t('editor.preview')"
          size="small"
          severity="secondary"
          :disabled="busy || stale || Boolean(invalid.size)"
          @click="
            perform(async () => {
              await refresh();
              showPreview = true;
            })
          "
        />
        <Button
          :label="t('editor.save')"
          size="small"
          :loading="busy"
          :disabled="
            busy ||
            captureRequired ||
            (!count && !pendingInput.size) ||
            stale ||
            Boolean(invalid.size)
          "
          @click="perform(save)"
        />
      </div>
    </template>
    <Dialog
      v-model:visible="showPreview"
      :header="t('editor.previewTitle')"
      modal
      :style="{ width: 'min(95vw, 700px)' }"
    >
      <DataTable :value="previewRows" size="small" scrollable scroll-height="55vh">
        <Column field="slot" :header="t('editor.slotColumn')" sortable />
        <Column field="label" :header="t('editor.fieldColumn')" sortable />
        <Column field="before" :header="t('editor.before')" />
        <Column field="after" :header="t('editor.after')" />
        <template #empty>{{ t("editor.emptyPreview") }}</template>
      </DataTable>
    </Dialog>
  </section>
</template>

<style scoped>
.editor {
  padding: 14px;
}
.editor .toolbar {
  gap: 8px;
}
.editor h3 {
  margin: 0;
}
.editor-guidance {
  margin: 8px 0;
  font-size: 12px;
}
.editor-tabs,
.editor-actions,
.editor-footer {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  align-items: center;
}
.editor-tabs {
  margin: 12px 0;
}
.editor-content {
  display: grid;
  gap: 12px;
}
.editor-content.has-records {
  grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.4fr);
}
.record-detail {
  min-width: 0;
}
.record-detail h4 {
  margin: 0 0 8px;
}
.editor-actions {
  margin-top: 10px;
}
.editor-footer {
  position: sticky;
  bottom: 0;
  padding: 10px 0 0;
  margin-top: 12px;
  background: white;
  font-size: 12px;
}
.editor-footer span {
  margin-right: auto;
}
@media (max-width: 850px) {
  .editor-content.has-records {
    grid-template-columns: 1fr;
  }
}
</style>
