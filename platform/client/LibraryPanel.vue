<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import { computed, onMounted, ref } from "vue";
import { gameSystems, systemIds } from "../src/domain/systems.ts";
import type { Game } from "../src/library/catalog.ts";
import type { DisplayText } from "../src/shared/messages.ts";
import type { Profile } from "../src/storage/revisions.ts";
import { api, errorText } from "./api.ts";
import GameCover from "./GameCover.vue";
import GameProfiles from "./GameProfiles.vue";
import { t, translate } from "./i18n.ts";
import ProfileDeletion from "./ProfileDeletion.vue";

const deletion = ref<Profile>();
const emit = defineEmits<{ open: [game: Game, profile: Profile]; changed: [] }>();
const games = ref<Game[]>([]);
const profiles = ref<Profile[]>([]);
const selected = ref<Game | null>(null);
const query = ref("");
const system = ref<string | null>(null);
const profileName = ref("");
const busy = ref(true);
const error = ref<DisplayText>("");
const systems = systemIds.map((value) => ({ value, label: gameSystems[value].shortLabel }));
const visibleGames = computed(() =>
  games.value.filter(
    (game) =>
      (!system.value || game.system === system.value) &&
      game.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const gameProfiles = computed(() =>
  profiles.value.filter((profile) => profile.releaseId === selected.value?.id),
);
async function refresh() {
  busy.value = true;
  error.value = "";
  try {
    [games.value, profiles.value] = await Promise.all([
      api<Game[]>("games"),
      api<Profile[]>("profiles"),
    ]);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function createProfile() {
  if (!selected.value || !profileName.value.trim()) return;
  busy.value = true;
  error.value = "";
  try {
    const profile = await api<Profile>("profiles", {
      releaseId: selected.value.id,
      name: profileName.value.trim(),
    });
    profiles.value.push(profile);
    profileName.value = "";
    emit("changed");
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
function deleted(id: string) {
  profiles.value = profiles.value.filter((profile) => profile.id !== id);
  deletion.value = undefined;
  emit("changed");
}
function choose(game: Game) {
  selected.value = game;
  profileName.value = "";
}
onMounted(refresh);
</script>

<template>
  <section class="library" :aria-label="t('library.title')">
    <div class="toolbar">
      <h1>{{ t("library.title") }}<span class="library-count">{{ visibleGames.length }}</span></h1>
      <InputText
        v-model="query"
        :aria-label="t('library.search')"
        :placeholder="t('library.search')"
        size="small"
      />
      <Select
        v-model="system"
        :options="systems"
        option-label="label"
        option-value="value"
        show-clear
        :placeholder="t('library.allPlatforms')"
        :aria-label="t('library.platform')"
        size="small"
      />
      <Button :label="t('common.refresh')" variant="text" :loading="busy" @click="refresh" />
    </div>
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <p v-if="!busy && !games.length" class="muted">{{ t("library.empty") }}</p>
    <p v-else-if="!busy && !visibleGames.length" class="muted">{{ t("library.noMatches") }}</p>
    <div class="game-grid">
      <button
        v-for="game in visibleGames"
        :key="game.id"
        type="button"
        class="game-card"
        :aria-pressed="selected?.id === game.id"
        @click="choose(game)"
      >
        <GameCover
          :system="game.system"
          :src="game.cover ? `/api/games/${game.id}/cover/${game.cover}` : undefined"
        />
        <span class="platform-tag">{{
          systems.find((entry) => entry.value === game.system)?.label
        }}</span>
        <strong>{{ game.title }}</strong>
        <span class="muted">{{
          t("library.profileCount", {
            count: profiles.filter((profile) => profile.releaseId === game.id).length,
          })
        }}</span>
      </button>
    </div>
    <ProfileDeletion
      v-if="deletion"
      :key="deletion.id"
      :profile="deletion"
      @close="deletion = undefined"
      @deleted="deleted"
    />
    <GameProfiles
      v-if="selected"
      :game="selected"
      v-model:name="profileName"
      :profiles="gameProfiles"
      :busy="busy"
      @open="(game, profile) => emit('open', game, profile)"
      @remove="deletion = $event"
      @create="createProfile"
    />
  </section>
</template>
