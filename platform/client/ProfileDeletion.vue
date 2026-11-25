<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { onMounted, ref } from "vue";
import { type DisplayText, message } from "../src/shared/messages.ts";
import type { ProfileDeletionImpact } from "../src/storage/profile-deletion.ts";
import type { Profile } from "../src/storage/revisions.ts";
import { ApiError, api, errorText } from "./api.ts";
import { t, translate } from "./i18n.ts";

const props = defineProps<{ profile: Profile }>();
const emit = defineEmits<{ close: []; deleted: [id: string] }>();
const impact = ref<ProfileDeletionImpact>();
const busy = ref(false);
const error = ref<DisplayText>("");
const endpoint = `profiles/${props.profile.id}/deletion`;
function requestFailed(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 404) emit("deleted", props.profile.id);
  else
    error.value =
      cause instanceof ApiError && cause.status === 409
        ? message("library.profileDeletionChanged")
        : errorText(cause);
}
async function review() {
  busy.value = true;
  error.value = "";
  try {
    impact.value = await api<ProfileDeletionImpact>(endpoint);
  } catch (cause) {
    requestFailed(cause);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!impact.value || busy.value) return;
  busy.value = true;
  try {
    await api(endpoint, { token: impact.value.token });
    emit("deleted", props.profile.id);
  } catch (cause) {
    impact.value = undefined;
    requestFailed(cause);
  } finally {
    busy.value = false;
  }
}
onMounted(review);
</script>

<template>
  <Dialog
    visible
    modal
    :header="t('library.deleteProfile')"
    :closable="!busy"
    :close-on-escape="!busy"
    :style="{ width: 'min(28rem, 94vw)' }"
    @update:visible="!$event && emit('close')"
  >
    <p>{{ t("library.deleteProfilePrompt", { name: profile.name }) }}</p>
    <p v-if="impact">
      {{
        t("library.deleteProfileImpact", {
          count: impact.revisions,
          protected: impact.protectedRevisions,
        })
      }}
    </p>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <template #footer>
      <Button
        :label="t('deletion.cancel')"
        severity="secondary"
        :disabled="busy"
        @click="emit('close')"
      />
      <Button v-if="error" :label="t('common.refresh')" :loading="busy" @click="review" />
      <Button
        v-else
        :label="t('library.deleteProfile')"
        severity="danger"
        :disabled="!impact || busy"
        @click="remove"
      />
    </template>
  </Dialog>
</template>
