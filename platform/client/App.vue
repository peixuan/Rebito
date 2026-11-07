<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { onMounted, ref } from "vue";
import type { DisplayText } from "../src/shared/messages.ts";
import AccountPanel from "./AccountPanel.vue";
import { api, errorText, type Session } from "./api.ts";
import { t, translate } from "./i18n.ts";
import LanguagePicker from "./LanguagePicker.vue";

const session = ref<Session | null>(null);
const error = ref<DisplayText>("");
async function refresh() {
  try {
    session.value = await api<Session>("session");
    error.value = "";
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function logout() {
  try {
    await api("auth/sign-out", {});
    if (session.value) session.value = { ...session.value, user: null };
    await refresh();
  } catch (cause) {
    error.value = errorText(cause);
  }
}
onMounted(refresh);
</script>

<template>
  <header class="app-header">
    <a class="brand" href="/">{{ t("app.brand") }}<span>{{ t("app.tagline") }}</span></a>
    <LanguagePicker />
    <div v-if="session?.user" class="account-actions">
      <span>{{ session.user.name }}</span>
      <Button :label="t('account.logout')" severity="secondary" size="small" @click="logout" />
    </div>
  </header>
  <main class="workspace">
    <Message v-if="error" severity="error" role="alert"
      >{{ translate(error)
      }}<Button :label="t('common.retry')" variant="text" @click="refresh" /></Message
    >
    <p v-if="!session && !error" role="status">{{ t("app.connecting") }}</p>
    <AccountPanel
      v-else-if="session && !session.user"
      :session="session"
      @authenticated="refresh"
    />
    <section v-else-if="session?.user" :aria-label="t('app.workspace')">
      <h1>{{ t("app.welcome", { name: session.user.name }) }}</h1>
      <p class="muted">{{ t("app.signedInHelp") }}</p>
    </section>
  </main>
</template>
