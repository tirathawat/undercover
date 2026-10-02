# Interface design

Undercover Club is a phone companion for friends playing around a table. Prioritize entering a room, the private word and the current task. Conversation happens in person; history is a notebook of clues.

## Visual direction

Use a bright Material Design 3 light theme: lavender surfaces, a white playing area and geometric eyes as the brand motif. Native HTML controls provide platform semantics.

[`src/design-system/tokens.css`](../src/design-system/tokens.css) is the source of truth for colors, spacing, type, shape and control sizes. Use semantic `--md-sys-color-*` roles instead of component-specific colors. IBM Plex Sans Thai supports interface text; Sora supplies the wordmark and room code. Fonts are self-hosted.

Use filled buttons for the current task, tonal buttons for supporting actions and an active pill for room navigation. Primary controls have at least 48px touch height; compact history filters retain 44px targets. Inputs use 16px text.

## Layout

- Entry: compact introduction, create/join choice, nickname, private PIN, avatar and submit. An invitation opens join directly. Recovery asks for the room code, original name and PIN, without a new avatar.
- Mobile room: room code/status, private word and current task. Bottom navigation exposes game, clue history and players/settings. Account for safe-area insets and keep keyboard focus visible above navigation.
- History: chronological clues with labeled native filters for game, round and player. Filters wrap on narrow screens. Reading position stays under the player's control.
- Desktop: the game can sit beside history while retaining the same task priority.

## Interaction and accessibility

- Conceal the private word by default and when leaving the game view, changing stage or losing window visibility/focus.
- Keep PIN entry in one masked field with a numeric keyboard hint and an accessible reveal control.
- Use visible labels, meaningful headings and visible keyboard focus. Show selected states with a check or label as well as color.
- Sending a clue and confirming a vote require explicit actions. Leaving and host removal require confirmation.
- Prevent duplicate submissions while pending. Retain inputs and drafts after failures, and expose errors where the player can find and correct them.
- Move focus to the destination heading after stage or view changes. Dialogs retain focus while open and restore it to the opener on close.
- Preserve reduced-motion and forced-colors support. Long names, clues and translated copy must wrap without horizontal overflow.

## Motion

[`src/styles/motion.css`](../src/styles/motion.css) owns motion; duration and easing tokens live in the design-system tokens. Use short color and press transitions for controls, brief entrances for pages, stages, panels and feedback, and a single emphasis for selections and results. Animate the newest history row while keeping older clues still. Vote bars grow within their final width. Reconnection dots stop within four seconds; the status text remains visible while waiting.

Enable animation only under `prefers-reduced-motion: no-preference`. Keep content and controls usable immediately, preserve existing component keys and draft ownership, and conceal private words and PINs immediately. Do not delay gameplay, dialog closure or focus changes for an animation, animate scrolling, or retain outgoing private content.

## White Guy

The product hypothesis is that a player with no secret word adds another deduction strategy: listen, improvise, and infer the civilian word before being caught. The request establishes demand for the role; it does not establish whether groups find it more enjoyable. The first learning check is an in-person five-player game: can the host explain the role, can the player identify their current task, and can everyone understand the outcome without extra explanation? The no-word role and last-chance guess follow [Yanstar Studio's rules](https://www.yanstarstudio.com/undercover-how-to-play). This app preserves its existing majority/parity model and includes White Guy in the infiltrator count. The role is opt-in to keep familiar games available.

Deliver the whole flow together: host enables one White Guy, players privately inspect their word or role, everyone gives clues and votes, the eliminated White Guy gets one confirmed guess, and the room reaches a truthful result or continues. Keep the setting across rematches. Validate civilian majority against both hidden roles and explain the minimum players when a selected setup cannot start.

Use the existing settings layout and secret card instead of adding a separate onboarding wizard. Conceal the no-word role behind the same explicit reveal control as a word; surrounding reveal instructions must not announce it. White Guy is never selected to start the first clue round; normal host skips still apply to disconnected speakers.

The guess stage has two views: the guesser sees a labeled answer field, the one-chance rule and confirmation; everyone else sees who is guessing and waits. Keep history available, retain the draft after a failed request or navigation, and disable duplicate submissions while pending. Do not expose either answer until the game finishes. Invalid input must leave the chance unused.

On disconnect, preserve the pending guess and offer PIN recovery. Only a host may confirm skipping a disconnected guesser. Explain that skipping or removing them forfeits the chance. After a wrong guess show the submitted answer and failure; after a correct guess show White Guy's sole victory. Survival can have a joint Undercover/White Guy winner or a lone surviving faction, so result copy must identify the winners and the actual winning condition. Rematch resets all private state and retains clue history.

Acceptance checks cover settings and minimum-player feedback, private-role concealment, clue order, one confirmed answer, waiting and offline states, correct/wrong outcomes, ties, removal, recovery, rematch, keyboard focus and responsive layouts. Automated tests protect rules and UI state; a complete built-app game verifies their integration. Real-phone and screen-reader checks remain separate from desktop browser verification.

## Review checklist

Inspect entry, lobby, reveal, clues, voting/runoff, results, rematch, history, settings, offline feedback and recovery at 320px, 390px and desktop widths. Check keyboard navigation, focus after errors, dialog busy states, word concealment and long content. Use real phones and screen readers when validating device-specific behavior; desktop viewport checks do not establish that coverage.
