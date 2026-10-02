import type { ActionReply } from '../../shared/game.ts';
import type {
  MessageMetadata,
  ServerMessageId,
} from '../../shared/messages.ts';

export const clientMessageIds = [
  'CONNECTION_DROPPED',
  'CONNECTION_RECONNECTING',
  'SESSION_PERSISTENCE_FAILED',
  'SERVER_MESSAGE_INVALID',
  'CONNECTION_UNAVAILABLE',
  'REQUEST_TIMED_OUT',
] as const;

export type ClientMessageId = (typeof clientMessageIds)[number];
export type MessageId = ServerMessageId | ClientMessageId;
export type GameMessage = MessageMetadata &
  ({ messageId: MessageId; fallback?: string } | { fallback: string });

export type RequestReply =
  | ActionReply
  | { ok: false; code: 'GAME'; messageId: ClientMessageId; error?: undefined };

export function replyMessage(
  reply: Extract<RequestReply, { ok: false }>,
): GameMessage {
  if (reply.error === undefined) return { messageId: reply.messageId };
  return {
    messageId: reply.messageId,
    messageParams: reply.messageParams,
    fallback: reply.error,
  };
}
