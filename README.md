# Undercover Club

A browser-based Undercover game for friends playing together in person. Each player uses a phone to read a private word, submit clues and vote. Discussion happens out loud; the app records clues and has no chat.

Built with React, TypeScript and Vite, backed by a Go WebSocket server. The shipped interface and word packs are Thai; project documentation is English.

## Local development

Requires Node.js 22.12 or later and Go 1.26.4 or later.

```sh
npm ci
npm run dev
```

Open [http://localhost:3017](http://localhost:3017). This starts Vite on port 3017 and Go on port 8080; Vite proxies `/ws` and `/healthz` to Go. To play over Wi-Fi, share the network URL printed by Vite and allow incoming connections on port 3017.

## Production

```sh
npm run build
npm run build:server
PORT=8080 WEB_DIR=dist ./bin/undercover
```

Go serves the built frontend and `/ws` from the same origin. `npm start` runs only the Go server and requires an existing frontend build.

Alternatively, build and run the complete app with Docker:

```sh
docker build -t undercover .
docker run --rm -p 8080:8080 undercover
```

| Variable          | Default | Purpose                                                                                            |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `PORT`            | `8080`  | HTTP listening port                                                                                |
| `WEB_DIR`         | `dist`  | Built frontend directory; `/app/dist` in Docker                                                    |
| `ALLOWED_ORIGINS` | Empty   | Additional comma-separated WebSocket origin host patterns; same-origin connections work by default |

Check server health with `GET /healthz`, which returns `{"ok":true}`. This checks the server endpoint, not frontend availability or a complete game flow.

Run a single instance behind an HTTPS reverse proxy that supports WebSocket upgrades. Rooms and history live in process memory, so restarting clears them. Schedule restarts around active games, and ship matching frontend/server builds when changing the protocol; existing clients may need to reload.

## Game rules

- Start with at least three connected players. Choose one to three Undercover players; civilians must outnumber them at the start. There is no per-room player cap, but server connection limits still apply.
- Players see only their own word and do not know their team. Eliminated players' roles become public; both words and all remaining roles are revealed when the game ends.
- Players take turns submitting one clue. History can be filtered by game, round and player, and stays across rematches in the same room.
- Living players vote once, cannot vote for themselves and cannot change a vote. Votes stay private until voting resolves. The host can finish voting once every connected living player has voted.
- The highest vote count eliminates a player. A tie eliminates nobody and leads to a runoff among the tied candidates. The host advances from the result to the next vote or round.
- Civilians win when no Undercover players remain. Undercover wins when its remaining players equal or outnumber the civilians.
- New players join only in the lobby. If the host disconnects, ownership passes to a connected player.

## Rejoining a room

Create and join require a personal PIN of exactly six ASCII digits; leading zeros are valid. Keep it for that room.

- The original tab automatically resumes with a private token stored in `sessionStorage`.
- From another tab or device, use the recovery flow with the room code, original name and PIN. Name matching ignores surrounding whitespace and letter case.
- Recovery restores the same player, private word, vote and eliminated status. It replaces the previous connection and invalidates the old token.
- Five failed PIN attempts block further PIN attempts until the one-minute window expires. The limit belongs to the player across connections; token resume still works.
- Leaving or host removal revokes recovery. A voted-out player can still recover as a spectator. Forgotten PINs cannot be reset.
- Rematches retain disconnected seats with valid credentials. The host must wait for those players or remove them before starting.
- Rooms without connected players expire after six hours of inactivity. Rooms with no recoverable seats are removed immediately. Recovery cannot restore an expired room or one lost to a server restart.

The server stores salted PIN hashes. PINs are excluded from public snapshots, URLs and application browser storage. Malformed, unknown, wrong and revoked recovery credentials share one server credential error. Active PIN throttling returns a separate rate-limit error.

## Development checks

```sh
npm test
npm run lint
npm run format:check
npm run build
npm run build:server
```

`npm test` runs Node protocol/connection tests, Vitest UI tests and Go tests with the race detector. Lint includes ESLint and Go vet; the frontend build includes TypeScript checking.

For UI or gameplay changes, also exercise create/join/recovery, reveal, clues, voting, a tied runoff, rematch and retained history in the built app. Check error recovery and keyboard focus at 320px, 390px and desktop widths.

## Documentation

- [Architecture](docs/architecture.md): ownership, state, protocol and extension points.
- [Interface design](docs/design.md): visual direction, interaction and accessibility constraints.
- [Localization](docs/localization.md): catalogs, adding a locale and server message compatibility.

Update the relevant document when behavior or setup changes. Keep facts in one place and link to their owning code. Temporary audit reports, verification logs and screenshots belong in review artifacts rather than permanent project documentation.
