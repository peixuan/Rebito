# Internationalization

Rebito uses English (`en`) and Simplified Chinese (`zh-CN`). The first supported
browser language selects the interface, with English as the fallback. Chinese
regional tags map to Simplified Chinese. A manual selection persists under
`rebito.locale`; unavailable browser storage must not prevent in-memory switching.

Vue I18n renders trusted catalogs from `platform/client/locales`. The Vite plugin
precompiles messages without adding eval to the Content Security Policy. Keep
English and Chinese keys and named interpolation values in parity.

`src/shared/messages.ts` carries plain message IDs and named parameters across
service and browser boundaries. Never render arbitrary server diagnostics. Plain
strings represent user content; names, paths and save values remain unchanged.

Use stable IDs for records, fields and controls. Future editor and runtime
adapters must preserve drafts and running games when the interface language changes.
Keep Chinese text in locale packs, including any verified game-edition names.
Code, comments and README instructions are English, apart from the opening
bilingual project introduction. Catalog tests check this boundary and compile
messages with untrusted interpolation values kept as text.
