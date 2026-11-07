<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { ref } from "vue";
import type { DisplayText } from "../src/shared/messages.ts";
import { api, errorText, type Session } from "./api.ts";
import { t, translate } from "./i18n.ts";

defineProps<{ session: Session }>();
const emit = defineEmits<{ authenticated: [] }>();
const email = ref("");
const password = ref("");
const name = ref("");
const registering = ref(false);
const busy = ref(false);
const error = ref<DisplayText>("");
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await api(registering.value ? "auth/sign-up/email" : "auth/sign-in/email", {
      email: email.value,
      password: password.value,
      ...(registering.value ? { name: name.value } : {}),
    });
    password.value = "";
    emit("authenticated");
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function oidc() {
  busy.value = true;
  try {
    const response = await api<{ url: string }>("auth/sign-in/social", {
      provider: "oidc",
      callbackURL: window.location.origin,
    });
    window.location.assign(response.url);
  } catch (cause) {
    error.value = errorText(cause);
    busy.value = false;
  }
}
</script>

<template>
  <section class="account-panel" aria-labelledby="account-title">
    <p class="eyebrow">REBITO</p>
    <h1 id="account-title">
      {{ registering ? t("account.createTitle") : t("account.loginTitle") }}
    </h1>
    <p class="muted">{{ t("account.description") }}</p>
    <form class="account-form" @submit.prevent="submit">
      <label v-if="registering" for="name"
        >{{ t("account.name")
        }}<InputText id="name" v-model="name" autocomplete="name" required maxlength="80" /></label
      >
      <label for="email"
        >{{ t("account.email")
        }}<InputText
          id="email"
          v-model="email"
          type="email"
          autocomplete="username"
          required
        /></label
      >
      <label for="password"
        >{{ t("account.password")
        }}<InputText
          id="password"
          v-model="password"
          type="password"
          :autocomplete="registering ? 'new-password' : 'current-password'"
          required
          minlength="12"
          maxlength="128"
        /></label
      >
      <Message v-if="error" severity="error" role="alert">{{ translate(error) }}</Message>
      <Button
        type="submit"
        :label="registering ? t('account.register') : t('account.login')"
        :loading="busy"
      />
      <Button
        v-if="session.oidc"
        :label="t('account.oidc')"
        severity="secondary"
        :disabled="busy"
        @click="oidc"
      />
      <Button
        v-if="session.allowRegistration"
        :label="registering ? t('account.backToLogin') : t('account.register')"
        variant="text"
        :disabled="busy"
        @click="
          registering = !registering;
          error = '';
        "
      />
    </form>
  </section>
</template>
