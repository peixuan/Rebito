<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, ref } from "vue";
import { nesSettingsFor } from "../../src/editors/nes/catalog.ts";
import { type NesPreset, nesPresetsFor } from "../../src/editors/nes/presets.ts";
import { type DisplayText, displayMessage, message } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import NesCheatFiles from "./NesCheatFiles.vue";
import NesPresetControls from "./NesPresetControls.vue";
import NesRamSearch from "./NesRamSearch.vue";
import { activeNesCodes, type NesRule, nesCodeGroup, selectNesPreset } from "./rules.ts";
import type { NesCheats } from "./runtime.ts";

const props = defineProps<{ port: NesCheats; disabled: boolean }>();
const rules = ref<NesRule[]>([]);
const settings = computed(() => nesSettingsFor(props.port.romSha256));
const adjustable = computed(() => nesPresetsFor(props.port.romSha256));
const input = ref("");
const name = ref("");
const error = ref<DisplayText>("");

function apply(next: NesRule[]) {
  if (props.disabled) return false;
  try {
    props.port.setCodes(activeNesCodes(next));
    rules.value = next;
    error.value = "";
    return true;
  } catch (cause) {
    error.value = displayMessage(cause) ?? message("nesCheats.applyFailed");
    return false;
  }
}
function addCodes(codes: string[], label: DisplayText) {
  const group = nesCodeGroup(codes.join("+"));
  if (!group) {
    error.value = message("nesCheats.invalidCode");
    return false;
  }
  const code = group.join("+");
  const preset = settings.value.find((setting) =>
    setting.choices.some((item) => item.code === code),
  );
  if (preset) return apply(selectNesPreset(rules.value, preset.label, code));
  const existing = rules.value.find((rule) => rule.code === code);
  const rule = { ...existing, name: existing?.name || label, code, enabled: true };
  return apply(
    existing
      ? rules.value.map((item) => (item === existing ? rule : item))
      : [...rules.value, rule],
  );
}
function applyPreset(preset: NesPreset, code: string) {
  apply(selectNesPreset(rules.value, preset.label, code));
}
function activeChoice(label: string) {
  return rules.value.find((rule) => rule.preset === label && rule.enabled)?.code ?? "";
}
function choose(label: string, event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  if (!apply(selectNesPreset(rules.value, label, select.value))) select.value = activeChoice(label);
}
function toggle(rule: NesRule, event: Event) {
  const checkbox = event.currentTarget as HTMLInputElement;
  const next = rules.value.map((item) =>
    item.code === rule.code ? { ...item, enabled: checkbox.checked } : item,
  );
  if (!apply(next)) checkbox.checked = rule.enabled;
}
function submit() {
  if (addCodes([input.value], name.value.trim())) {
    input.value = "";
    name.value = "";
  }
}
</script>

<template>
  <section class="nes-cheats" :aria-label="t('nesCheats.title')">
    <h3>{{ t("nesCheats.title") }}</h3>
    <fieldset v-if="settings.length" :disabled="disabled">
      <legend>{{ t("nesCheats.verified") }}</legend>
      <div v-for="setting in settings" :key="setting.label" class="preset-row">
        <label>
          {{ t(setting.label) }}
          <select :value="activeChoice(setting.label)" @change="choose(setting.label, $event)">
            <option value="">{{ t("nesCheats.off") }}</option>
            <option
              v-if="
                activeChoice(setting.label) &&
                !setting.choices.some((c) => c.code === activeChoice(setting.label))
              "
              :value="activeChoice(setting.label)"
            >
              {{ t("nesCheats.customValue") }}
            </option>
            <option v-for="option in setting.choices" :key="option.code" :value="option.code">
              {{ translate(option.label) }}
            </option>
          </select>
        </label>
        <small v-if="setting.atTitle">{{ t("nesCheats.atTitle") }}</small>
      </div>
    </fieldset>
    <NesPresetControls v-else :presets="adjustable" :disabled="disabled" @apply="applyPreset" />
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <details>
      <summary>{{ t("nesCheats.manualTools") }}</summary>
      <p class="muted">{{ t("nesCheats.scope") }}</p>
      <NesPresetControls
        v-if="settings.length && adjustable.length"
        :presets="adjustable"
        :disabled="disabled"
        @apply="applyPreset"
      />
      <fieldset :disabled="disabled">
        <legend>{{ t("nesCheats.codes") }}</legend>
        <form class="toolbar" @submit.prevent="submit">
          <label for="nes-rule-code"
            >{{ t("nesCheats.code") }}
            <InputText
              id="nes-rule-code"
              v-model="input"
              maxlength="32"
              size="small"
              placeholder="00FE:09"
              autocapitalize="characters"
              :spellcheck="false"
              required
            />
          </label>
          <label for="nes-rule-name"
            >{{ t("nesCheats.name") }}
            <InputText id="nes-rule-name" v-model="name" maxlength="64" size="small" />
          </label>
          <Button type="submit" size="small" :label="t('nesCheats.enable')" />
        </form>
        <p class="muted">{{ t("nesCheats.formats") }}</p>
        <ul v-if="rules.length">
          <li v-for="rule in rules" :key="rule.code">
            <label class="rule-toggle">
              <input type="checkbox" :checked="rule.enabled" @change="toggle(rule, $event)">
              <code>{{ rule.code }}</code> {{ translate(rule.name) }}
            </label>
            <Button
              size="small"
              text
              severity="secondary"
              :label="t('nesCheats.remove')"
              :aria-label="t('nesCheats.removeCode', { code: rule.code })"
              @click="apply(rules.filter((r) => r.code !== rule.code))"
            />
          </li>
        </ul>
      </fieldset>
      <NesRamSearch :port="port" :disabled="disabled" @add="addCodes" />
      <NesCheatFiles :sha256="port.romSha256" :rules="rules" :disabled="disabled" @add="addCodes" />
    </details>
  </section>
</template>

<style scoped>
.nes-cheats {
  margin-block: 0.65rem;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
.nes-cheats h3 {
  margin: 0 0 0.35rem;
}
.preset-row select {
  max-width: 100%;
  font: inherit;
}
.preset-row small {
  display: block;
  color: var(--muted);
}
fieldset {
  margin: 0.55rem 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.4rem;
  min-width: 0;
}
legend {
  padding-inline: 0.3rem;
  font-weight: 600;
}
form {
  align-items: end;
}
form label {
  display: grid;
  gap: 0.2rem;
}
.preset-row label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
input.p-inputtext {
  width: min(12rem, 100%);
}
ul {
  padding: 0;
  margin: 0.3rem 0;
  list-style: none;
}
li,
.rule-toggle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.rule-toggle {
  min-width: 0;
  overflow-wrap: anywhere;
}
li {
  justify-content: space-between;
  border-top: 1px solid var(--p-content-border-color);
}
</style>
