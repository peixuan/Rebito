<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Session } from "./api.ts";
import CreekMark from "./CreekMark.vue";
import { t } from "./i18n.ts";
import LanguagePicker from "./LanguagePicker.vue";

defineProps<{ user?: Session["user"]; administration: boolean; leaving: boolean }>();
const emit = defineEmits<{ home: []; manage: []; logout: [] }>();
const account = ref<HTMLDetailsElement>();
const toggle = ref<HTMLElement>();
const media = window.matchMedia("(prefers-color-scheme: dark)");
let choice: string | null = null;
try {
  choice = localStorage.getItem("rebito.theme");
} catch {
  /* Storage is optional. */
}
const night = ref(choice === "night" || (choice !== "day" && media.matches));
function applyTheme() {
  document.documentElement.classList.toggle("dark", night.value);
}
function switchTheme() {
  night.value = !night.value;
  choice = night.value ? "night" : "day";
  try {
    localStorage.setItem("rebito.theme", choice);
  } catch {
    /* Keep the in-session choice. */
  }
  applyTheme();
}
function systemTheme() {
  if (choice === "night" || choice === "day") return;
  night.value = media.matches;
  applyTheme();
}
function close() {
  if (account.value) account.value.open = false;
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !account.value?.contains(event.target)) close();
}
function closeFromKeyboard() {
  if (account.value?.open) {
    close();
    toggle.value?.focus();
  }
}
applyTheme();
onMounted(() => {
  media.addEventListener("change", systemTheme);
  document.addEventListener("pointerdown", outside);
});
onBeforeUnmount(() => {
  media.removeEventListener("change", systemTheme);
  document.removeEventListener("pointerdown", outside);
});
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <a
        class="brand"
        href="/"
        @click.prevent="
          close();
          emit('home');
        "
      >
        <span lang="en">Rebito</span>
        <span lang="zh-CN">{{ t("app.chineseName") }}</span>
      </a>
      <div class="river-strip"><CreekMark /></div>
      <div class="header-tools account-actions">
        <button
          v-if="user?.admin && !administration"
          type="button"
          class="desktop-admin"
          @click="emit('manage')"
        >
          {{ t("admin.title") }}
        </button>
        <LanguagePicker />
        <button
          type="button"
          class="theme-control"
          :aria-label="t(night ? 'app.day' : 'app.night')"
          @click="switchTheme"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <g v-if="night">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2" />
            </g>
            <path v-else d="M20 15A8.6 8.6 0 0 1 9 4a8.8 8.8 0 1 0 11 11Z" />
          </svg>
          <span>{{ t(night ? "app.day" : "app.night") }}</span>
        </button>
        <details v-if="user" ref="account" class="user-menu" @keydown.esc="closeFromKeyboard">
          <summary ref="toggle" :aria-label="t('app.accountMenu', { name: user.name })">
            <span class="signed-in">{{ t("app.signedIn") }}</span>
            <span class="user-name">{{ user.name }}</span>
          </summary>
          <div class="account-popover">
            <strong class="account-name">{{ user.name }}</strong>
            <button
              v-if="user.admin && !administration"
              class="mobile-admin"
              type="button"
              @click="
                close();
                emit('manage');
              "
            >
              {{ t("admin.title") }}
            </button>
            <button
              type="button"
              :disabled="leaving"
              @click="
                close();
                emit('logout');
              "
            >
              {{ t("account.logout") }}
            </button>
          </div>
        </details>
        <a v-else class="login-link" href="#email">{{ t("account.login") }}</a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: var(--paper);
  border-bottom: 1px solid var(--edge);
}
.header-inner {
  max-width: 1440px;
  margin: auto;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 clamp(12px, 3vw, 48px);
  height: 72px;
}
.brand {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--ink);
  white-space: nowrap;
  text-decoration: none;
  font-size: 25px;
  font-weight: 600;
  line-height: 1.08;
}
.river-strip {
  height: 100%;
  width: min(23vw, 290px);
  mask-image: linear-gradient(90deg, transparent, #000 10%, #000 89%, transparent);
}
.header-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-inline-start: auto;
  min-width: 0;
}
.header-tools button,
.user-menu summary,
.login-link {
  color: var(--accent);
  background: transparent;
  border: 0;
  padding: 7px 4px;
  cursor: pointer;
  text-decoration: none;
  font: inherit;
}
.theme-control {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.theme-control svg {
  width: 17px;
  height: 17px;
}
.user-menu {
  position: relative;
  min-width: 0;
}
.user-menu summary {
  display: flex;
  gap: 4px;
  align-items: center;
  list-style: none;
}
.user-menu summary::-webkit-details-marker {
  display: none;
}
.user-menu summary::after {
  content: "";
  border: solid currentColor;
  border-width: 0 1px 1px 0;
  width: 6px;
  height: 6px;
  transform: rotate(45deg);
  margin: -3px 3px 0;
}
.user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 24ch;
}
.signed-in {
  white-space: nowrap;
  color: var(--muted);
  font-size: 12px;
}
.account-popover {
  background: var(--paper);
  border: 1px solid var(--edge);
  padding: 4px;
  min-width: 135px;
  width: max-content;
  max-width: min(260px, calc(100vw - 24px));
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 5;
}
.account-name {
  display: block;
  padding: 7px 10px;
  border-bottom: 1px solid var(--edge);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.account-popover button {
  display: block;
  width: 100%;
  text-align: start;
  padding: 10px;
}
.account-popover button:hover {
  background: var(--selected);
}
.account-popover .mobile-admin {
  display: none;
}
@media (max-width: 700px) {
  .header-inner {
    height: 54px;
    gap: 6px;
  }
  .brand {
    font-size: 19px;
  }
  .river-strip {
    width: min(10vw, 60px);
    flex-shrink: 2;
  }
  .header-tools {
    gap: 4px;
  }
  .theme-control span,
  .desktop-admin {
    display: none;
  }
  .account-popover .mobile-admin {
    display: block;
  }
  .user-name {
    max-width: 8ch;
  }
  .signed-in {
    font-size: 10px;
  }
  .header-tools :is(button, summary, .login-link) {
    min-height: 36px;
  }
  .theme-control {
    min-width: 28px;
    justify-content: center;
  }
}
@media (max-width: 380px) {
  .river-strip {
    display: none;
  }
  .user-name {
    max-width: 6ch;
  }
}
</style>
