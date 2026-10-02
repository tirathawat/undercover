# Localization

Thai is the only shipped locale. Interface and system copy comes from typed i18next catalogs; components render keys instead of embedding text. Player names, clues and secret word pairs remain game data.

## Ownership

| Location                                                                | Responsibility                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`src/i18n/locales/th-ui.ts`](../src/i18n/locales/th-ui.ts)             | Interface copy, accessible names, categories, phases, roles and document metadata |
| [`src/i18n/locales/th-messages.ts`](../src/i18n/locales/th-messages.ts) | Server and connection message translations                                        |
| [`src/i18n/resources.ts`](../src/i18n/resources.ts)                     | Registered locales, default locale and `LocaleCatalog` type                       |
| [`src/i18n/i18next.d.ts`](../src/i18n/i18next.d.ts)                     | Typed keys and interpolation arguments                                            |
| [`src/i18n/messages.ts`](../src/i18n/messages.ts)                       | Message translation and legacy-text fallback                                      |
| [`shared/messages.ts`](../shared/messages.ts)                           | Server message identifiers and optional wire metadata                             |
| [`internal/game/messages.go`](../internal/game/messages.go)             | Go identifiers, parameter validation and legacy Thai text                         |

Store message identifiers and parameters in connection/UI state and translate when rendering. This lets existing feedback follow a language change without clearing inputs or game state. Translate system history entries only when they carry message metadata; a player-authored clue remains unchanged even if it matches system copy.

## Add a locale

1. Add a catalog such as `src/i18n/locales/en.ts` using `satisfies LocaleCatalog`; import that type from `../resources`. Translate all source keys and preserve interpolation names and named markup tags. The type checks key structure, so check placeholders separately.
2. Import the catalog in `resources.ts` and register it as `en: { translation: en }`. Supported languages derive from this registry; missing translations fall back to Thai.
3. Select the locale with `await i18n.changeLanguage('en')`. There is currently no language picker or persisted language preference.
4. Run the [development checks](../README.md#development-checks). Inspect every phase and error state for text expansion, font coverage, wrapping and accessible names.

Use whole sentences with interpolation values rather than concatenating translated fragments. Pass numbers as `count` for plurals, retaining the base key and adding language-specific forms such as `_one` and `_other`. Rich text uses `Trans` with named components so translators can move highlighted content within the sentence.

[`DocumentLocale`](../src/i18n/DocumentLocale.tsx) updates document language, direction, title and description. [`vite.config.ts`](../vite.config.ts) fills initial HTML metadata from the default catalog. Check both when changing the default locale.

Word-pack localization needs a separate decision about the language shared by players in a room; registering an interface locale does not translate the word pairs.

## Server messages

Failed replies, removal notices and generated history entries may include `messageId` and `messageParams`. Existing `error`, `reason` and `text` fields retain legacy Thai fallback text. The broad `INVALID`, `SESSION`, `GAME` and `LIMIT` codes still control behavior; translation does not change cleanup or retry decisions.

Parameters are strings or finite numbers. The translator supplies them as replacement values so names such as `lng` cannot override translation options. Unknown identifiers or missing required parameters use legacy text; malformed metadata is rejected by the protocol parser. An explicit leave keeps its empty removal reason and produces no alert.

To add a message:

1. Add its identifier, fallback text and parameter validation in `internal/game/messages.go`.
2. Add the identifier to `shared/messages.ts` and its translation to every registered catalog.
3. Use `NewMessage` or `NewError` at the owning call site. Both can fail when the identifier or parameters are invalid; handle construction errors before changing player credentials or advancing a turn.
4. Update [`tests/messages.test.mjs`](../tests/messages.test.mjs), [`internal/game/messages_test.go`](../internal/game/messages_test.go) and the affected flow tests. The message tests check identifier parity, catalog coverage, fallback text and parameters.

The transport maps message-construction failures to `UNEXPECTED_GAME_ERROR` and keeps the connection open. Message metadata is optional: older clients use legacy text, and newer clients can read messages without metadata. This compatibility applies to translation metadata; other protocol changes still require matching client/server builds.
