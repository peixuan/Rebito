<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import { computed, ref, useId, watch } from "vue";
import type { EditorView } from "../../src/editors/types.ts";
import { localize, t, translate } from "../i18n.ts";

const props = defineProps<{
  rows: EditorView["records"];
  columns: EditorView["columns"];
  selected?: string;
  viewKey: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ select: [id: string] }>();
const companionId = useId();
interface TableState {
  query: string;
  columns: string[];
  companions: boolean;
  sort: string;
  order: 1 | -1;
}
const states = new Map<string, TableState>();
function stateFor(key: string): TableState {
  let saved = states.get(key);
  if (!saved) {
    saved = { query: "", columns: [], companions: false, sort: "", order: 1 };
    states.set(key, saved);
  }
  return saved;
}
const state = ref(stateFor(props.viewKey));
watch(
  () => props.viewKey,
  (key) => {
    state.value = stateFor(key);
  },
);
const columns = computed(() =>
  props.columns.map((column, index) => ({
    ...column,
    label: translate(column.label),
    field: `sortCells.c${index}`,
  })),
);
const visible = computed(() => {
  const terms = state.value.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return localize(props.rows)
    .filter(
      (row) =>
        (!state.value.companions || row.tags.includes("companion")) &&
        terms.every((term) =>
          [row.label, row.summary, ...Object.values(row.cells)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(term),
        ),
    )
    .map((row) => ({
      ...row,
      sortCells: Object.fromEntries(
        props.columns.map((column, index) => [`c${index}`, row.cells[column.id] ?? ""]),
      ),
    }));
});
</script>

<template>
  <div class="record-table">
    <div class="table-tools">
      <InputText
        v-model="state.query"
        :aria-label="t('records.search')"
        :placeholder="t('records.search')"
        size="small"
        :disabled="disabled"
      />
      <MultiSelect
        v-model="state.columns"
        :options="columns"
        option-label="label"
        option-value="id"
        filter
        :aria-label="t('records.columns')"
        :placeholder="t('records.columns')"
        size="small"
        :max-selected-labels="0"
        :selected-items-label="t('records.selectedColumns', { count: '{0}' })"
        :disabled="disabled"
      />
      <label v-if="rows.some((row) => row.tags.includes('companion'))" :for="companionId"
        ><Checkbox v-model="state.companions" :input-id="companionId" binary :disabled="disabled" />
        {{ t("records.companionsOnly") }}</label
      >
    </div>
    <DataTable
      :value="visible"
      data-key="id"
      size="small"
      striped-rows
      scrollable
      scroll-height="25rem"
      selection-mode="single"
      :meta-key-selection="false"
      :selection="visible.find((row) => row.id === selected)"
      :sort-field="state.sort"
      :sort-order="state.order"
      @row-select="!disabled && emit('select', $event.data.id)"
      @sort="
        state.sort = typeof $event.sortField === 'string' ? $event.sortField : '';
        state.order = $event.sortOrder === -1 ? -1 : 1;
      "
    >
      <Column field="label" :header="t('records.record')" sortable />
      <Column field="summary" :header="t('records.description')" sortable />
      <Column
        v-for="column in columns.filter((item) => state.columns.includes(item.id))"
        :key="column.id"
        :field="column.field"
        :header="column.label"
        sortable
      />
      <template #empty>{{ t("records.empty") }}</template>
    </DataTable>
    <small>{{ t("records.count", { visible: visible.length, total: rows.length }) }}</small>
  </div>
</template>

<style scoped>
.record-table {
  min-width: 0;
}
.table-tools {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  align-items: center;
}
.table-tools > * {
  max-width: 100%;
}
.table-tools input {
  width: 10rem;
}
.table-tools label {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
}
small {
  display: block;
  color: #627386;
  margin-top: 6px;
  font-size: 11px;
}
</style>
