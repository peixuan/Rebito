<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { ref } from "vue";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { QuotaSettings } from "../src/storage/quota-settings.ts";
import { ApiError, api, errorText } from "./api.ts";
import { formatBytes } from "./format-bytes.ts";
import { t, translate } from "./i18n.ts";

defineProps<{ disabled: boolean }>();
type Overview = {
  settings: QuotaSettings;
  used: { bytes: number; revisions: number };
  reserveBytes: number;
};
const visible = ref(false);
const busy = ref(false);
const error = ref<DisplayText>("");
const overview = ref<Overview>();
const draft = ref({
  siteMiB: 0,
  siteRevisions: 0,
  accountMiB: 0,
  accountRevisions: 0,
  profiles: 0,
});
const mib = 1024 ** 2;
async function load() {
  visible.value = true;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<Overview>("admin/save-quotas");
    overview.value = result;
    const { site, account } = result.settings;
    draft.value = {
      siteMiB: site.bytes / mib,
      siteRevisions: site.revisions,
      accountMiB: account.bytes / mib,
      accountRevisions: account.revisions,
      profiles: account.profiles,
    };
  } catch (cause) {
    overview.value = undefined;
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!overview.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const d = draft.value;
    await api("admin/save-quotas", {
      version: overview.value.settings.version,
      site: { bytes: d.siteMiB * mib, revisions: d.siteRevisions },
      account: { bytes: d.accountMiB * mib, revisions: d.accountRevisions, profiles: d.profiles },
    });
    visible.value = false;
  } catch (cause) {
    error.value =
      cause instanceof ApiError && cause.status === 409
        ? message("quota.changed")
        : errorText(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Button :label="t('quota.title')" severity="secondary" :disabled="disabled" @click="load" />
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('quota.title')"
    :closable="!busy"
    :close-on-escape="!busy"
    :style="{ width: 'min(95vw, 35rem)' }"
  >
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <form v-if="overview" id="save-quota-form" @submit.prevent="save">
      <p>
        {{
          t("quota.used", {
            bytes: formatBytes(overview.used.bytes),
            count: overview.used.revisions,
            reserve: formatBytes(overview.reserveBytes),
          })
        }}
      </p>
      <fieldset :disabled="busy">
        <legend>{{ t("quota.site") }}</legend>
        <label
          >{{ t("quota.capacity")
          }}<input
            v-model.number="draft.siteMiB"
            required
            type="number"
            :min="1 / mib"
            :max="mib"
            step="any"
          ></label
        >
        <label
          >{{ t("quota.revisions")
          }}<input
            v-model.number="draft.siteRevisions"
            required
            type="number"
            min="1"
            max="10000000"
          ></label
        >
      </fieldset>
      <fieldset :disabled="busy">
        <legend>{{ t("quota.account") }}</legend>
        <label
          >{{ t("quota.capacity")
          }}<input
            v-model.number="draft.accountMiB"
            required
            type="number"
            :min="1 / mib"
            :max="mib"
            step="any"
          ></label
        >
        <label
          >{{ t("quota.revisions")
          }}<input
            v-model.number="draft.accountRevisions"
            required
            type="number"
            min="1"
            max="1000000"
          ></label
        >
        <label
          >{{ t("library.profiles")
          }}<input
            v-model.number="draft.profiles"
            required
            type="number"
            min="1"
            max="10000"
          ></label
        >
      </fieldset>
      <p class="muted">{{ t("quota.help") }}</p>
    </form>
    <template #footer>
      <Button :label="t('quota.reload')" severity="secondary" :disabled="busy" @click="load" />
      <Button
        type="submit"
        form="save-quota-form"
        :label="t('admin.save')"
        :loading="busy"
        :disabled="!overview || busy"
      />
    </template>
  </Dialog>
</template>

<style scoped>
fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  border: 1px solid var(--p-content-border-color);
  margin: 0.8rem 0;
  padding: 0.65rem;
}
label {
  display: grid;
  gap: 0.3rem;
  flex: 1 1 8rem;
  min-width: 0;
}
input {
  width: 100%;
}
</style>
