import type { TFunction, TOptions } from 'i18next';
import type { GameMessage } from '../game/messages';
import { thMessages } from './locales/th-messages';

type MessageTranslator = (
  key: `messages.${keyof typeof thMessages}`,
  options: TOptions,
) => string;

export function translateMessage(t: TFunction, message: GameMessage): string {
  if (message.messageId && Object.hasOwn(thMessages, message.messageId)) {
    const id = message.messageId as keyof typeof thMessages;
    const params = message.messageParams ?? {};
    const requiredParams = [
      ...thMessages[id].matchAll(/\{\{\s*-?\s*([^},]+)(?:,[^}]*)?\}\}/g),
    ].map((match) => match[1].trim());
    if (requiredParams.some((name) => !Object.hasOwn(params, name)))
      return message.fallback ?? '';
    const translate = t as MessageTranslator;
    return translate(`messages.${id}`, {
      replace: params,
      count: typeof params.count === 'number' ? params.count : undefined,
      defaultValue: message.fallback,
    });
  }
  return message.fallback ?? '';
}
