import {
  act,
  cleanup,
  fireEvent,
  within,
  render,
  screen,
} from '@testing-library/react';
import { createRef } from 'react';
import { createInstance, type ParseKeys } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, expectTypeOf, test } from 'vitest';
import { DocumentLocale } from './DocumentLocale';
import { translateMessage } from './messages';
import { resources } from './resources';
import { useTranslation } from './index';
import type { RoomView } from '../../shared/game';
import { Home } from '../features/home/Home';
import { History } from '../features/room/History';
import { PlayerList } from '../features/room/PlayerList';

afterEach(cleanup);

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    hostId: 'a',
    stageId: 'lobby-1',
    phase: 'lobby',
    game: 1,
    round: 2,
    settings: { category: 'food', undercovers: 1 },
    players: ['a', 'b', 'c'].map((id) => ({
      id,
      name: id,
      avatar: 0,
      connected: true,
      alive: true,
      ready: false,
    })),
    self: { id: 'a', word: null, hasVoted: false },
    speakerId: null,
    voteCount: 0,
    voteCandidates: [],
    result: null,
    winner: null,
    words: null,
    history: [],
    ...overrides,
  };
}

async function localization(language = 'th') {
  const instance = createInstance();
  await instance.init({
    lng: language,
    fallbackLng: 'th',
    resources: {
      ...resources,
      en: {
        translation: {
          app: {
            documentTitle: 'Undercover Club',
            description: 'A game to play with friends',
          },
          messages: {
            TEXT_LENGTH_OUT_OF_RANGE: 'Use {{min}}–{{max}} characters',
            REMOVED_BY_HOST: 'The host removed you from the room',
            TURN_SKIPPED_DISCONNECTED_PLAYER:
              'Turn skipped — player disconnected',
            CONNECTION_DROPPED:
              'Connection lost; check the game before retrying',
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
}

test('Thai messages preserve dynamic validation and English can reorder parameters', async () => {
  const instance = await localization();
  const message = {
    messageId: 'TEXT_LENGTH_OUT_OF_RANGE',
    messageParams: { min: 1, max: 80 },
    fallback: 'ข้อความต้องมี 1–80 ตัวอักษร',
  };
  expect(translateMessage(instance.t, message)).toBe(message.fallback);
  await instance.changeLanguage('en');
  expect(translateMessage(instance.t, message)).toBe('Use 1–80 characters');
});

test('known messages localize while legacy and future messages keep their fallback', async () => {
  const instance = await localization('en');
  expect(
    translateMessage(instance.t, {
      messageId: 'REMOVED_BY_HOST',
      fallback: 'Thai fallback',
    }),
  ).toBe('The host removed you from the room');
  expect(
    translateMessage(instance.t, { fallback: 'Legacy server message' }),
  ).toBe('Legacy server message');
  expect(
    translateMessage(instance.t, {
      messageId: 'FUTURE_SERVER_MESSAGE',
      fallback: 'Future server message',
    }),
  ).toBe('Future server message');
  expect(
    translateMessage(instance.t, {
      messageId: 'toString',
      fallback: 'Unrecognized message',
    }),
  ).toBe('Unrecognized message');
});

test('client messages and partial locales use the Thai fallback catalog', async () => {
  const instance = await localization('en');
  expect(
    translateMessage(instance.t, { messageId: 'CONNECTION_DROPPED' }),
  ).toBe('Connection lost; check the game before retrying');
  expect(
    translateMessage(instance.t, { messageId: 'SERVER_MESSAGE_INVALID' }),
  ).toBe('ข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง');
});

test('a dynamic message without its required parameters preserves the server fallback', async () => {
  const instance = await localization('en');
  expect(
    translateMessage(instance.t, {
      messageId: 'TEXT_LENGTH_OUT_OF_RANGE',
      messageParams: { max: 80 },
      fallback: 'Server validation failed',
    }),
  ).toBe('Server validation failed');
});

test('message parameters interpolate without overriding translation options', async () => {
  const instance = await localization('en');
  instance.addResourceBundle(
    'en',
    'translation',
    {
      messages: { REMOVED_BY_HOST: 'Removed {{name}} from {{room}}' },
    },
    true,
    true,
  );
  expect(
    translateMessage(instance.t, {
      messageId: 'REMOVED_BY_HOST',
      messageParams: {
        name: '<b>Alice</b>',
        room: 'ABC234',
        lng: 'th',
        ns: 'other',
        defaultValue: 'Unexpected fallback',
      },
      fallback: 'Server fallback',
    }),
  ).toBe('Removed <b>Alice</b> from ABC234');
});

test('changing locale updates an existing message and document metadata', async () => {
  const instance = await localization();
  function Message() {
    const { t } = useTranslation();
    return (
      <output>{translateMessage(t, { messageId: 'REMOVED_BY_HOST' })}</output>
    );
  }
  render(
    <I18nextProvider i18n={instance}>
      <DocumentLocale />
      <Message />
    </I18nextProvider>,
  );
  expect(document.documentElement.lang).toBe('th');
  await act(() => instance.changeLanguage('en'));
  expect(document.documentElement.lang).toBe('en');
  expect(document.title).toBe('Undercover Club');
  expect(screen.getByRole('status').textContent).toBe(
    'The host removed you from the room',
  );
});

test('translation keys are derived from the source catalog', () => {
  expectTypeOf<'messages.REMOVED_BY_HOST'>().toExtend<ParseKeys>();
  expectTypeOf<'messages.UNKNOWN_MESSAGE'>().not.toExtend<ParseKeys>();
});

test('locale changes update an existing inline error and accessible labels without clearing inputs', async () => {
  const instance = await localization();
  instance.addResourceBundle(
    'en',
    'translation',
    {
      home: {
        invalidPin: 'Enter a six-digit PIN',
        nickname: 'Nickname',
        nicknamePlaceholder: 'What friends call you',
      },
      pin: { createLabel: 'Choose a six-digit PIN', show: 'Show PIN' },
    },
    true,
    true,
  );
  render(
    <I18nextProvider i18n={instance}>
      <Home
        send={async () => false}
        disabled={false}
        pending={false}
        showRules={() => {}}
      />
    </I18nextProvider>,
  );
  fireEvent.change(screen.getByLabelText('ชื่อเล่น'), {
    target: { value: '<b>Player</b>' },
  });
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '123' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'สร้างห้อง' }).at(-1)!);
  expect(screen.getByRole('alert').textContent).toBe(
    'กรอก PIN เป็นตัวเลข 6 หลัก',
  );
  await act(() => instance.changeLanguage('en'));
  expect(screen.getByRole('alert').textContent).toBe('Enter a six-digit PIN');
  expect((screen.getByLabelText('Nickname') as HTMLInputElement).value).toBe(
    '<b>Player</b>',
  );
  expect(
    (screen.getByLabelText('Choose a six-digit PIN') as HTMLInputElement).value,
  ).toBe('123');
  expect(screen.getByRole('button', { name: 'Show PIN' })).toBeTruthy();
});

test('history localizes only system entries and lets translations reorder rich text', async () => {
  const instance = await localization('en');
  instance.addResourceBundle(
    'en',
    'translation',
    {
      history: { group: '<round>Round {{round}}</round> in game {{game}}' },
    },
    true,
    true,
  );
  const entry = {
    id: 'user',
    game: 1,
    round: 2,
    playerId: 'b',
    name: '<b>Player</b>',
    avatar: 0,
    text: 'ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ',
    time: 1,
  };
  render(
    <I18nextProvider i18n={instance}>
      <History
        room={room({
          history: [
            entry,
            {
              ...entry,
              id: 'system',
              messageId: 'TURN_SKIPPED_DISCONNECTED_PLAYER',
            },
          ],
        })}
      />
    </I18nextProvider>,
  );
  const heading = screen.getByRole('heading', { name: 'Round 2 in game 1' });
  expect(heading.querySelector('span')?.textContent).toBe('Round 2');
  expect(screen.getByText(entry.text)).toBeTruthy();
  expect(screen.getByText('Turn skipped — player disconnected')).toBeTruthy();
  expect(
    within(screen.getByRole('list')).getAllByText('<b>Player</b>'),
  ).toHaveLength(2);
  expect(document.querySelector('b')).toBeNull();
});

test('count messages use the selected language plural rules', async () => {
  const instance = await localization('en');
  instance.addResourceBundle(
    'en',
    'translation',
    {
      players: {
        count_one: '{{count}} player',
        count_other: '{{count}} players',
      },
    },
    true,
    true,
  );
  const snapshot = room();
  const view = render(
    <I18nextProvider i18n={instance}>
      <PlayerList
        room={{ ...snapshot, players: snapshot.players.slice(0, 1) }}
        disabled={false}
        heading={createRef()}
        onRemove={() => {}}
      />
    </I18nextProvider>,
  );
  expect(screen.getByText('1 player')).toBeTruthy();
  view.rerender(
    <I18nextProvider i18n={instance}>
      <PlayerList
        room={{ ...snapshot, players: snapshot.players.slice(0, 2) }}
        disabled={false}
        heading={createRef()}
        onRemove={() => {}}
      />
    </I18nextProvider>,
  );
  expect(screen.getByText('2 players')).toBeTruthy();
});
