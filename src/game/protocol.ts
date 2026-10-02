import type {
  ActionReply,
  HistoryEntry,
  PublicPlayer,
  RoomView,
  Session,
  Settings,
  VoteResult,
} from '../../shared/game';
import { categories } from '../../shared/game.ts';
import type { MessageMetadata } from '../../shared/messages';

export type ServerMessage =
  | { type: 'state'; room: RoomView }
  | { type: 'reply'; id: string; reply: ActionReply }
  | ({ type: 'removed'; reason: string } & MessageMetadata);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isMessageMetadata(value: Record<string, unknown>): boolean {
  return (
    (value.messageId === undefined || typeof value.messageId === 'string') &&
    (value.messageParams === undefined ||
      (isRecord(value.messageParams) &&
        Object.values(value.messageParams).every(
          (parameter) =>
            typeof parameter === 'string' ||
            (typeof parameter === 'number' && Number.isFinite(parameter)),
        )))
  );
}

function isRole(value: unknown) {
  return value === 'civilian' || value === 'undercover' || value === 'whiteGuy';
}

export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.token === 'string'
  );
}

function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    categories.some((category) => category.value === value.category) &&
    Number.isInteger(value.undercovers) &&
    (value.whiteGuys === 0 || value.whiteGuys === 1)
  );
}

function isPlayer(value: unknown): value is PublicPlayer {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Number.isInteger(value.avatar) &&
    typeof value.connected === 'boolean' &&
    typeof value.alive === 'boolean' &&
    typeof value.ready === 'boolean' &&
    (value.role === undefined || isRole(value.role))
  );
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Number.isInteger(value.game) &&
    Number.isInteger(value.round) &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    Number.isInteger(value.avatar) &&
    typeof value.text === 'string' &&
    Number.isInteger(value.time) &&
    isMessageMetadata(value)
  );
}

function isVoteResult(value: unknown): value is VoteResult {
  return (
    isRecord(value) &&
    isNullableString(value.eliminatedId) &&
    (value.role === null || isRole(value.role)) &&
    isRecord(value.counts) &&
    Object.values(value.counts).every(Number.isInteger) &&
    Array.isArray(value.tiedIds) &&
    value.tiedIds.every((id) => typeof id === 'string') &&
    (value.guess === undefined ||
      (isRecord(value.guess) &&
        typeof value.guess.text === 'string' &&
        typeof value.guess.correct === 'boolean'))
  );
}

function isRoomView(value: unknown): value is RoomView {
  if (!isRecord(value) || !isRecord(value.self)) return false;
  const self = value.self;
  return (
    typeof value.code === 'string' &&
    typeof value.hostId === 'string' &&
    typeof value.stageId === 'string' &&
    typeof value.phase === 'string' &&
    ['lobby', 'reveal', 'clue', 'vote', 'guess', 'result', 'finished'].includes(
      value.phase,
    ) &&
    Number.isInteger(value.game) &&
    Number.isInteger(value.round) &&
    isSettings(value.settings) &&
    Array.isArray(value.players) &&
    value.players.every(isPlayer) &&
    typeof value.self.id === 'string' &&
    value.players.some((player: PublicPlayer) => player.id === self.id) &&
    isNullableString(value.self.word) &&
    typeof value.self.hasVoted === 'boolean' &&
    (value.self.role === undefined || isRole(value.self.role)) &&
    isNullableString(value.speakerId) &&
    Number.isInteger(value.voteCount) &&
    Array.isArray(value.voteCandidates) &&
    value.voteCandidates.every((id) => typeof id === 'string') &&
    (value.result === null || isVoteResult(value.result)) &&
    (value.winner === null ||
      isRole(value.winner) ||
      value.winner === 'infiltrators') &&
    (value.words === null ||
      (isRecord(value.words) &&
        typeof value.words.civilian === 'string' &&
        typeof value.words.undercover === 'string')) &&
    Array.isArray(value.history) &&
    value.history.every(isHistoryEntry)
  );
}

function isActionReply(value: unknown): value is ActionReply {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    if (value.session !== undefined && !isSession(value.session)) return false;
    return (
      value.room === undefined ||
      (isRoomView(value.room) &&
        isSession(value.session) &&
        value.room.code === value.session.code &&
        value.room.self.id === value.session.playerId)
    );
  }
  return (
    value.ok === false &&
    typeof value.error === 'string' &&
    typeof value.code === 'string' &&
    ['INVALID', 'SESSION', 'GAME', 'LIMIT'].includes(value.code) &&
    isMessageMetadata(value)
  );
}

export function decodeServerMessage(data: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'state':
      return isRoomView(value.room)
        ? { type: 'state', room: value.room }
        : null;
    case 'reply':
      return typeof value.id === 'string' && isActionReply(value.reply)
        ? { type: 'reply', id: value.id, reply: value.reply }
        : null;
    case 'removed':
      return typeof value.reason === 'string' && isMessageMetadata(value)
        ? {
            type: 'removed',
            reason: value.reason,
            ...(value.messageId === undefined
              ? {}
              : { messageId: value.messageId as string }),
            ...(value.messageParams === undefined
              ? {}
              : {
                  messageParams:
                    value.messageParams as MessageMetadata['messageParams'],
                }),
          }
        : null;
    default:
      return null;
  }
}
