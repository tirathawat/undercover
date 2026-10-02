# Contributing

Thanks for helping improve Undercover Club. Keep changes focused and describe the player or maintainer problem they solve.

## Development setup

Install Node.js 22.22.2 or later on the 22.x release line and Go 1.26.4 or later, then run:

```sh
npm ci
npm run dev
```

The development server prints the local URL. See the README for production and Docker setup.

## Before opening a pull request

Run the checks relevant to your change:

```sh
npm test
npm run lint
npm run format:check
npm run build
npm run build:server
```

For interface or gameplay changes, manually exercise the affected flow. For changes to room recovery or the WebSocket protocol, check reconnection and compatibility with the matching frontend and server builds. Rooms are held in process memory, so a server restart clears active rooms.

## Pull requests

Create a focused branch, then open a pull request against the default branch. Explain the problem, the behavior that changed, and how you checked it. Include screenshots for visible interface changes and call out any behavior change that affects players or operators.

Keep documentation aligned with changes to setup, behavior, or operations. See the README for the project’s architecture and localization documents.
