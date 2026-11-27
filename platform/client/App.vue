<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { defineAsyncComponent, onMounted, ref } from "vue";
import type { Game } from "../src/library/catalog.ts";
import type { DisplayText } from "../src/shared/messages.ts";
import type { Profile } from "../src/storage/revisions.ts";
import AccountPanel from "./AccountPanel.vue";
import { api, errorText, type Session } from "./api.ts";
import { t, translate } from "./i18n.ts";
import SiteHeader from "./SiteHeader.vue";
import StorageUsage from "./StorageUsage.vue";

const AdminLibrary = defineAsyncComponent(() => import("./AdminLibrary.vue"));
const SavePanel = defineAsyncComponent(() => import("./SavePanel.vue"));
const LibraryPanel = defineAsyncComponent(() => import("./LibraryPanel.vue"));
const administration = ref(false);
const adminPanel = ref<InstanceType<typeof AdminLibrary> | null>(null);

const session = ref<Session | null>(null);
const error = ref<DisplayText>("");
const workspace = ref<{ game: Game; profile: Profile } | null>(null);
const savePanel = ref<InstanceType<typeof SavePanel> | null>(null);
const leaving = ref(false);
const storageVersion = ref(0);
async function refresh() {
  try {
    session.value = await api<Session>("session");
    error.value = "";
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function logout() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    if (savePanel.value && !(await savePanel.value.leave())) return;
    if (adminPanel.value && !adminPanel.value.leave()) return;
    await api("auth/sign-out", {});
    workspace.value = null;
    administration.value = false;
    if (session.value) session.value = { ...session.value, user: null };
    await refresh();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    leaving.value = false;
  }
}
async function home() {
  if (savePanel.value && !(await savePanel.value.leave())) return;
  if (adminPanel.value && !adminPanel.value.leave()) return;
  workspace.value = null;
  administration.value = false;
}
async function manageGames() {
  if (savePanel.value && !(await savePanel.value.leave())) return;
  workspace.value = null;
  administration.value = true;
}
onMounted(refresh);
</script>

<template>
  <SiteHeader
    :user="session?.user ?? null"
    :administration="administration"
    :leaving="leaving"
    @home="home"
    @manage="manageGames"
    @logout="logout"
  />
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
      <AdminLibrary v-if="administration && session.user.admin" ref="adminPanel" @back="home" />
      <SavePanel
        ref="savePanel"
        v-else-if="workspace"
        :key="workspace.profile.id"
        :game="workspace.game"
        :profile="workspace.profile"
        @changed="storageVersion++"
        @back="workspace = null"
        @recovered="
          (profile) => {
            if (workspace) workspace = { game: workspace.game, profile };
          }
        "
      />
      <LibraryPanel
        v-else
        @changed="storageVersion++"
        @open="(game, profile) => (workspace = { game, profile })"
      />
      <StorageUsage v-if="!administration" :key="session.user.id" :refresh-key="storageVersion" />
    </section>
  </main>
</template>
