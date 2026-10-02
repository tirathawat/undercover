# Architecture

The Go server owns game state. React renders a private snapshot for the current player and sends actions over one WebSocket connection. Rooms are process-local; deployment and recovery limits are described in the [README](../README.md).

## Backend ownership

The dependency direction is `cmd/undercover → internal/server → internal/game`.

| Location                                                | Responsibility                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`cmd/undercover/main.go`](../cmd/undercover/main.go)   | Environment configuration, startup and shutdown                                   |
| [`internal/server`](../internal/server)                 | HTTP/static serving, WebSocket peers, room orchestration and connection lifecycle |
| [`internal/game/room.go`](../internal/game/room.go)     | Game phases, permissions, clues, votes, results and history                       |
| [`internal/game/player.go`](../internal/game/player.go) | Seats, credentials, PIN recovery and player removal                               |
| [`internal/game/words.go`](../internal/game/words.go)   | Secret word pairs and categories                                                  |

`Room` contains the game rules without network I/O. `Server` serializes room access with its mutex and handles transport. Domain snapshots copy internal state and expose only information the receiving player may see. Keep mutations behind the domain methods and preserve snapshot isolation.

Connection, room, payload, rate and timeout limits live in [`internal/server/server.go`](../internal/server/server.go). There is no persistent database or shared room store.

Publishing builds a full private snapshot for each peer in the room, including the player list and history. Work and payloads grow with player counts and retained history; load-test intended room sizes before relying on them.

## Frontend ownership

| Location            | Responsibility                                                      |
| ------------------- | ------------------------------------------------------------------- |
| `src/app`           | App shell, branding and app-level dialogs                           |
| `src/features/home` | Create, join and PIN recovery                                       |
| `src/features/room` | Room navigation, history, players, settings and stage components    |
| `src/game`          | Connection, protocol decoding, `useGame` and player avatar          |
| `src/hooks`         | UI interaction logic shared across features                         |
| `src/design-system` | Native button/dialog primitives and design tokens                   |
| `src/i18n`          | Typed catalogs and translation; see [Localization](localization.md) |
| `src/styles`        | Feature styles and responsive/accessibility overrides               |

Keep interaction state and tests with the feature that owns them. Extract a component or Hook for a coherent responsibility or shared interaction policy. Shared UI hooks stay independent of application, feature and game modules.

[`eslint.config.js`](../eslint.config.js) enforces selected dependency boundaries: features cannot import the app shell, game modules cannot import screens or design primitives, and shared contracts cannot import frontend modules. TypeScript checks strict types and unused declarations.

## State and lifecycle

[`GameConnection`](../src/game/connection.ts) owns the socket, session persistence, acknowledgements, pending actions and reconnect lifecycle. [`useGame`](../src/game/use-game.ts) subscribes through `useSyncExternalStore`. Keep the server snapshot in this store; derive counts, permissions and filtered history during render.

Forms, clue drafts, vote selections, history filters and dialog state belong to their components. Effects synchronize external state such as focus, dialog lifecycle and window visibility. Confirmation actions run in event handlers.

[`Room`](../src/features/room/Room.tsx) keys stage and secret-word components by `stageId`, resetting stage-local state and concealing the word when the stage changes. Preserve these keys, room/player identity checks around destructive dialogs, and focus handling in [`useRoomPanelFocus`](../src/features/room/use-room-panel-focus.ts). [`useAsyncConfirmation`](../src/hooks/use-async-confirmation.ts) shares only the busy/error lifecycle; the owning flow controls success and focus restoration.

## Wire contract

Go request, view and reply types live in [`internal/game/types.go`](../internal/game/types.go), with actions and phases in [`enums.go`](../internal/game/enums.go). [`shared/game.ts`](../shared/game.ts) mirrors that contract for the client. These definitions are handwritten; update both sides together. [`src/game/protocol.ts`](../src/game/protocol.ts) validates incoming messages before they reach React.

Messages use `state`, `reply` and `removed` envelopes. Entry replies include the private session and room snapshot. Ordinary successful actions broadcast state before acknowledgement. Game actions carry the current `stageId` so stale actions cannot affect a later stage; leaving is exempt.

Keep tokens and PIN verification material private. Message identifiers and optional translation parameters are a separate vocabulary described in [Localization](localization.md).

## UI primitives and styles

[`Button`](../src/design-system/Button.tsx) and [`IconButton`](../src/design-system/IconButton.tsx) default to `type="button"`; form submission requires `type="submit"`. Icon buttons require an accessible label. [`Modal`](../src/design-system/Modal.tsx) owns native dialog semantics, busy handling, Escape behavior and focus restoration; callers provide the title and localized close label.

[`tokens.css`](../src/design-system/tokens.css) owns semantic colors, typography, spacing, shapes and control sizes. Keep one-off geometry in its feature stylesheet. [`src/styles.css`](../src/styles.css) controls import order; responsive, reduced-motion and forced-colors overrides come last. Moving rules can change the cascade even when declarations stay the same.

## Changing the app

Change game rules in `internal/game`, transport in `internal/server` or `src/game`, and interaction in the owning feature. Update handwritten contracts and protocol tests when the wire format changes. Use the [development checks](../README.md#development-checks) and verify the affected flow in the built app.
