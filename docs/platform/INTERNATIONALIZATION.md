# Internationalization

Rebito supports English (`en`) and Simplified Chinese (`zh-CN`). On first use, the
first supported browser language selects the interface; unsupported languages fall
back to English. Chinese regional tags select Simplified Chinese. The header
selector stores an exact preference in `localStorage` under `rebito.locale`.
Blocked storage does not prevent switching during the current page session.
This preference belongs to the browser, not the account.

## Boundaries

- Vue I18n renders trusted, precompiled catalogs in `platform/client/locales`.
  The Vite plugin removes the runtime message compiler. No API response supplies
  executable translations, and the content security policy does not allow eval.
- `src/shared/messages.ts` defines plain descriptors: `messageId` plus optional
  named parameters. Expected editor, library and runtime errors carry these
  descriptors. Private server diagnostics are never used as interface text.
- Pure binary editors return language-neutral labels and values without importing
  Vue, browser APIs or locale catalogs. HTTP carries the descriptors unchanged;
  the browser resolves them. Public error codes remain stable.
- Plain strings represent user content or format-defined data. User names, game
  titles, file paths and existing profile names are not translated or rewritten.
  Automatically generated backup names use the language selected when created.
- Column, field, record and group identities do not depend on rendered labels.
  Language changes do not reload server history, discard drafts, recapture saves,
  change numeric sort snapshots or restart emulators.

## Catalogs and game vocabulary

Both interface locales have the same keys and named placeholders. Keep complete
sentences together and use named interpolation rather than concatenating fragments.
Use Vue I18n plural alternatives for English counts. Vue escapes interpolated
values; never render messages or user-provided values with `v-html`.

The account shell loads general interface resources. Game editor vocabularies
under each locale's `editors` directory load with the editor component. Shared
proper-name resources under `shared/editors` retain the analyzed Chinese game
edition's character and port names in both interfaces. English descriptions are
translations of the verified format's labels, not a claim of compatibility with
an English game release or its official vocabulary.

The main document language, title, dates, counts and the PrimeVue controls used by
the application follow the interface locale. Numeric editing continues to use
unambiguous decimal input and preserves the save format's integer precision.

EmulatorJS receives its pinned upstream language resource at startup and falls
back to its English menu if that optional resource cannot be loaded. Its existing
menus keep their startup language while a game is running; the platform's control
guide updates immediately. Restarting a game applies the newly selected language
to upstream menus. Game text and identity-provider pages remain under their own
language settings. Never restart a game merely to refresh menu text.

## Contributor checks

Add English and Chinese messages together. Chinese literals belong only in locale
resources and the opening project introduction in the root README. Code comments,
test descriptions and README instructions use English. Tests that need game-edition
proper names or Chinese interface labels read the corresponding locale resource.

`tests/client/catalogs.test.ts` checks key and placeholder parity, compilation,
literal message references and the source-language boundary. Message-contract and
locale-preference tests cover malformed descriptors, nesting and unavailable
browser storage. Browser tests exercise selection persistence, translated errors,
editor state, real emulator continuity and upstream menu initialization under the
existing content security policy and Chromium sandbox.

When adding a PrimeVue control, review its built-in accessible labels and update
`client/primevue-locale.ts` and the widget catalogs. When adding an editor, keep its
large vocabularies in the editor catalog group and use stable IDs throughout.

References: [Vue I18n composition API](https://vue-i18n.intlify.dev/guide/advanced/composition)
and [build-time message optimization](https://vue-i18n.intlify.dev/guide/advanced/optimization).
