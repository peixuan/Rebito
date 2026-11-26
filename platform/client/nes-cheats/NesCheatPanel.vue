<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { ref } from "vue";
import { normalizeNesCode } from "../../src/editors/nes/codes.ts";
import { type NesPreset, nesPresetsFor } from "../../src/editors/nes/presets.ts";
import { type DisplayText, displayMessage, message } from "../../src/shared/messages.ts";
import { t, translate } from "../i18n.ts";
import NesPresetControls from "./NesPresetControls.vue";
import NesRamSearch from "./NesRamSearch.vue";
import { activeNesCodes, type NesRule } from "./rules.ts";
import type { NesCheats } from "./runtime.ts";

const props = defineProps<{ port: NesCheats; disabled: boolean }>();
const rules = ref<NesRule[]>([]);
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
  const next = new Map(rules.value.map((rule) => [rule.code, rule]));
  for (const code of codes) {
    const normalized = normalizeNesCode(code);
    if (!normalized) {
      error.value = message("nesCheats.invalidCode");
      return false;
    }
    next.set(normalized, {
      name: next.get(normalized)?.name || label,
      code: normalized,
      enabled: true,
    });
  }
  return apply([...next.values()]);
}
function applyPreset(preset: NesPreset, code: string) {
  const next = rules.value.filter(
    (rule) =>
      rule.code !== code && (typeof rule.name === "string" || rule.name.messageId !== preset.label),
  );
  apply([...next, { name: message(preset.label), code, enabled: true }]);
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
  <details class="nes-cheats">
    <summary>{{ t("nesCheats.title") }}</summary>
    <p class="muted">{{ t("nesCheats.scope") }}</p>
    <NesPresetControls
      :presets="nesPresetsFor(port.romSha256)"
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
    <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
    <NesRamSearch :port="port" :disabled="disabled" @add="addCodes" />
  </details>
</template>

<style scoped>
.nes-cheats {
  margin-block: 0.65rem;
}
summary {
  cursor: pointer;
  font-weight: 600;
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
li {
  justify-content: space-between;
  border-top: 1px solid var(--p-content-border-color);
}
</style>
