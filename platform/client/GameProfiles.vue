<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { gameSystems } from "../src/domain/systems.ts";
import type { Game } from "../src/library/catalog.ts";
import type { Profile } from "../src/storage/revisions.ts";
import { t } from "./i18n.ts";

defineProps<{ game: Game; profiles: Profile[]; busy: boolean }>();
const name = defineModel<string>("name", { required: true });
const emit = defineEmits<{
  open: [game: Game, profile: Profile];
  remove: [profile: Profile];
  create: [];
}>();
</script>
<template>
  <section class="profile-panel" :aria-label="t('library.profiles')">
    <h2>{{ game.title }}</h2>
    <div class="profile-heading">
      <strong>{{ t("library.profiles") }}</strong
      ><span>{{ gameSystems[game.system].shortLabel }}</span>
    </div>
    <div v-for="profile in profiles" :key="profile.id" class="profile-row">
      <button
        type="button"
        class="profile-link"
        :aria-label="t('library.openProfile')"
        :aria-description="profile.name"
        @click="emit('open', game, profile)"
      >
        {{ profile.name }}
      </button>
      <Button
        :label="t('library.deleteProfile')"
        variant="text"
        severity="danger"
        size="small"
        @click="emit('remove', profile)"
      />
    </div>
    <form class="toolbar" @submit.prevent="emit('create')">
      <InputText
        v-model="name"
        :aria-label="t('library.profileName')"
        :placeholder="t('library.profileExample')"
        maxlength="80"
        required
      />
      <Button
        type="submit"
        :label="t('library.createProfile')"
        size="small"
        :loading="busy"
        :disabled="!name.trim()"
      />
    </form>
  </section>
</template>
<style scoped>
.profile-panel {
  margin: 0;
  padding: 14px;
  background: var(--mat);
  border: 0;
  border-top: 2px solid var(--accent);
  border-radius: 0;
  grid-column: 1 / -1;
}
.profile-panel h2 {
  font-size: clamp(17px, 1.4vw, 19px);
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
  margin: 0 0 14px;
}
.profile-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-block-start: 1px solid var(--edge);
  padding-block: 8px;
  font-size: 12px;
  color: var(--muted);
}
.profile-row {
  padding: 3px 0;
  gap: 2px;
  flex-wrap: nowrap;
  border: 0;
}
.profile-link {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  align-items: center;
  min-width: 0;
  flex: 1;
  text-align: start;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--edge);
  border-radius: 3px;
  min-height: 38px;
  padding: 6px 8px;
  font-size: 13px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.profile-link::after {
  content: "→";
  margin-inline-start: auto;
}
.profile-link:hover {
  background: var(--selected);
}
.profile-panel form {
  gap: 5px;
}
.profile-panel input {
  min-width: 0;
  max-width: 100%;
  width: 100%;
}
</style>
