<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
const dock = ref<HTMLElement>();
const columns = window.matchMedia("(min-width: 760px)");
const wide = ref(columns.matches);
const syncLayout = () => {
  wide.value = columns.matches;
};
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
const pageSize = 24;
const shown = ref(pageSize);
const shelf = computed(() => visibleGames.value.slice(0, shown.value));
watch([query, system], () => {
  shown.value = pageSize;
});
const counts = computed(() => {
  const values = new Map<string, number>();
  for (const profile of profiles.value)
    values.set(profile.releaseId, (values.get(profile.releaseId) ?? 0) + 1);
  return values;
});
const platformCounts = computed(() => {
  const values = new Map<string, number>();
  for (const game of games.value) values.set(game.system, (values.get(game.system) ?? 0) + 1);
  return values;
});
const gameProfiles = computed(() =>
  profiles.value.filter((profile) => profile.releaseId === selected.value?.id),
);
async function refresh() {
  busy.value = true;
  error.value = "";
  try {
    const [catalog, personal] = await Promise.all([
      api<Game[]>("games"),
      api<Profile[]>("profiles"),
    ]);
    profiles.value = personal;
    const played = new Set(personal.map((profile) => profile.releaseId));
    // The catalog appends releases. Keep playthroughs first and recent additions
    // first within each group, without moving a card while its profile form is open.
    games.value = catalog
      .reverse()
      .sort((a, b) => Number(played.has(b.id)) - Number(played.has(a.id)));
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
  if (selected.value?.id === game.id) return;
  selected.value = game;
  profileName.value = "";
}
watch(shelf, (games) => {
  const next = games.find((game) => game.id === selected.value?.id) ?? games[0] ?? null;
  if (next?.id !== selected.value?.id) profileName.value = "";
  selected.value = next;
});
onMounted(() => {
  columns.addEventListener("change", syncLayout);
  void refresh();
});
onBeforeUnmount(() => columns.removeEventListener("change", syncLayout));
</script>

<template>
  <section class="library" :aria-label="t('library.title')">
    <nav class="system-list" :aria-label="t('library.platform')">
      <h2>{{ t("library.platform") }}</h2>
      <button type="button" :aria-pressed="!system" @click="system = null">
        {{ t("library.allPlatforms") }} <small>{{ games.length }}</small>
      </button>
      <button
        v-for="entry in systems"
        :key="entry.value"
        type="button"
        :aria-pressed="system === entry.value"
        @click="system = entry.value"
      >
        {{ entry.label }} <small>{{ platformCounts.get(entry.value) ?? 0 }}</small>
      </button>
    </nav>
    <div class="shelf-main">
      <div class="toolbar shelf-tools">
        <h1>
          {{ t("library.title") }} <span class="library-count">{{ visibleGames.length }}</span>
        </h1>
        <InputText
          v-model="query"
          :aria-label="t('library.search')"
          :placeholder="t('library.search')"
          size="small"
        />
        <Select
          v-model="system"
          class="mobile-filter"
          :options="systems"
          option-label="label"
          option-value="value"
          show-clear
          :placeholder="t('library.allPlatforms')"
          :aria-label="t('library.platform')"
          size="small"
        />
        <Button
          :label="t('common.refresh')"
          variant="text"
          :loading="busy"
          size="small"
          @click="refresh"
        />
      </div>
      <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
      <p v-if="!busy && !games.length" class="muted">{{ t("library.empty") }}</p>
      <p v-else-if="!busy && !visibleGames.length" class="muted">{{ t("library.noMatches") }}</p>
      <div class="shelf-grid">
        <template v-for="(game, index) in shelf" :key="game.id">
          <button
            type="button"
            class="shelf-game"
            :style="{ order: 2 * Math.floor(index / 2) }"
            :aria-pressed="selected?.id === game.id"
            @click="choose(game)"
          >
            <GameCover
              :system="game.system"
              :src="game.cover ? `/api/games/${game.id}/cover/${game.cover}` : undefined"
            />
            <strong>{{ game.title }}</strong>
            <small
              >{{ gameSystems[game.system].shortLabel }}
              · {{ t("library.profileCount", { count: counts.get(game.id) ?? 0 }) }}</small
            >
          </button>
          <Teleport v-if="selected?.id === game.id" :to="dock ?? 'body'" :disabled="!wide || !dock">
            <GameProfiles
              :game="game"
              :style="{ order: 2 * Math.floor(index / 2) + 1 }"
              v-model:name="profileName"
              :profiles="gameProfiles"
              :busy="busy"
              @open="(game, profile) => emit('open', game, profile)"
              @remove="deletion = $event"
              @create="createProfile"
            />
          </Teleport>
        </template>
      </div>
      <Button
        v-if="shown < visibleGames.length"
        class="more-games"
        variant="text"
        :label="t('library.more', { count: Math.min(pageSize, visibleGames.length - shown) })"
        @click="shown += pageSize"
      />
    </div>
    <div ref="dock" class="profile-dock"></div>
    <ProfileDeletion
      v-if="deletion"
      :key="deletion.id"
      :profile="deletion"
      @close="deletion = undefined"
      @deleted="deleted"
    />
  </section>
</template>

<style scoped src="./library-shelf.css"></style>
