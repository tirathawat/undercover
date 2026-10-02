import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeServerMessage } from '../src/game/protocol.ts';
import { room, session } from './fixtures.mjs';

const result = {
  eliminatedId: session.playerId,
  role: 'civilian',
  counts: { [session.playerId]: 2 },
  tiedIds: [],
};
const history = {
  id: 'clue-1',
  game: 1,
  round: 1,
  playerId: session.playerId,
  name: 'Player',
  avatar: 0,
  text: 'อร่อย',
  time: 1720000000000,
};

test('decodes localized and unknown message identifiers without changing fallback fields', () => {
  const messages = [
    {
      type: 'reply',
      id: 'validation',
      reply: {
        ok: false,
        code: 'GAME',
        error: 'ข้อความต้องมี 1–80 ตัวอักษร',
        messageId: 'TEXT_LENGTH_OUT_OF_RANGE',
        messageParams: { min: 1, max: 80 },
      },
    },
    {
      type: 'reply',
      id: 'future',
      reply: {
        ok: false,
        code: 'GAME',
        error: 'Future message',
        messageId: 'FUTURE_MESSAGE',
      },
    },
    {
      type: 'removed',
      reason: 'Removed by host',
      messageId: 'REMOVED_BY_HOST',
    },
    {
      type: 'removed',
      reason: 'Future reason',
      messageId: 'FUTURE_REMOVAL',
      messageParams: { detail: 'unknown' },
    },
    {
      type: 'state',
      room: {
        ...room,
        history: [
          { ...history, text: 'ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ' },
          {
            ...history,
            id: 'system-clue',
            text: 'ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ',
            messageId: 'TURN_SKIPPED_DISCONNECTED_PLAYER',
          },
        ],
      },
    },
  ];
  for (const message of messages)
    assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
});

test('rejects malformed localization metadata at every message boundary', () => {
  const invalid = [
    { messageId: 1 },
    { messageId: null },
    { messageParams: null },
    { messageParams: [] },
    { messageParams: { max: true } },
    { messageParams: { max: {} } },
  ];
  for (const metadata of invalid) {
    const messages = [
      {
        type: 'reply',
        id: 'error',
        reply: { ok: false, code: 'GAME', error: 'Fallback', ...metadata },
      },
      { type: 'removed', reason: 'Fallback', ...metadata },
      {
        type: 'state',
        room: { ...room, history: [{ ...history, ...metadata }] },
      },
    ];
    for (const message of messages)
      assert.equal(decodeServerMessage(JSON.stringify(message)), null);
  }
});

for (const phase of ['lobby', 'reveal', 'clue', 'vote', 'result', 'finished']) {
  test(`decodes the ${phase} snapshot with its Go JSON nulls and arrays`, () => {
    const view = structuredClone(room);
    view.phase = phase;
    if (phase !== 'lobby') {
      view.game = 1;
      view.self.word = 'กาแฟ';
    }
    if (!['lobby', 'reveal'].includes(phase)) {
      view.round = 1;
      view.history = [history];
    }
    if (phase === 'clue') view.speakerId = session.playerId;
    if (phase === 'vote') {
      view.voteCandidates = [session.playerId];
      view.self.hasVoted = true;
      view.voteCount = 1;
    }
    if (['result', 'finished'].includes(phase)) view.result = result;
    if (phase === 'finished') {
      view.winner = 'undercover';
      view.words = { civilian: 'กาแฟ', undercover: 'ชา' };
      view.players[0].role = 'civilian';
    }
    const message = { type: 'state', room: view };
    assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
  });
}

test('decodes session, action acknowledgements, errors and removal messages', () => {
  const messages = [
    { type: 'reply', id: 'create-1', reply: { ok: true, session } },
    { type: 'reply', id: 'ready-1', reply: { ok: true } },
    ...['INVALID', 'SESSION', 'GAME', 'LIMIT'].map((code) => ({
      type: 'reply',
      id: 'error-1',
      reply: { ok: false, code, error: 'Try again' },
    })),
    { type: 'removed', reason: 'Seat replaced' },
    { type: 'removed', reason: '' },
  ];
  for (const message of messages)
    assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
});

test('decodes a tied vote without an eliminated player or revealed role', () => {
  const message = {
    type: 'state',
    room: {
      ...room,
      phase: 'result',
      result: {
        eliminatedId: null,
        role: null,
        counts: { [session.playerId]: 1, 'player-2': 1 },
        tiedIds: [session.playerId, 'player-2'],
      },
    },
  };
  assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
});

test('rejects malformed envelopes and incomplete replies', () => {
  for (const data of [
    '{',
    'null',
    '[]',
    '1',
    '"state"',
    '{"type":"unknown"}',
  ]) {
    assert.equal(decodeServerMessage(data), null, data);
  }
  const messages = [
    { type: 'reply', reply: { ok: true } },
    {
      type: 'reply',
      id: '1',
      reply: { ok: true, session: { code: room.code } },
    },
    {
      type: 'reply',
      id: '1',
      reply: { ok: false, error: 'error', code: 'UNKNOWN' },
    },
    { type: 'reply', id: '1', reply: { ok: false, code: 'GAME' } },
    { type: 'removed', reason: null },
  ];
  for (const message of messages)
    assert.equal(decodeServerMessage(JSON.stringify(message)), null);
});

test('an entry reply requires a valid private room matching its session', () => {
  const reply = { ok: true, session, room };
  assert.deepEqual(
    decodeServerMessage(JSON.stringify({ type: 'reply', id: 'entry', reply })),
    { type: 'reply', id: 'entry', reply },
  );
  for (const invalidRoom of [
    { code: session.code },
    { ...room, code: 'OTHER2' },
    {
      ...room,
      players: [...room.players, { ...room.players[0], id: 'other' }],
      self: { ...room.self, id: 'other' },
    },
  ]) {
    assert.equal(
      decodeServerMessage(
        JSON.stringify({
          type: 'reply',
          id: 'entry',
          reply: { ...reply, room: invalidRoom },
        }),
      ),
      null,
    );
  }
});

test('rejects invalid state before it can crash a view or expose a missing seat', () => {
  const patches = [
    { phase: 'unknown' },
    { players: [] },
    { players: [{ ...room.players[0], role: 'unknown' }] },
    { self: null },
    { self: { ...room.self, id: 'missing-player' } },
    { settings: { category: 'unknown', undercovers: 1 } },
    { voteCandidates: null },
    { result: { ...result, counts: { [session.playerId]: '2' } } },
    { winner: 'unknown' },
    { words: { civilian: 'กาแฟ' } },
    { history: [{ ...history, text: null }] },
  ];
  for (const patch of patches) {
    assert.equal(
      decodeServerMessage(
        JSON.stringify({ type: 'state', room: { ...room, ...patch } }),
      ),
      null,
      JSON.stringify(patch),
    );
  }
});

test('accepts added server fields while preserving the known state contract', () => {
  const view = { ...room, futureField: 'compatible' };
  assert.deepEqual(
    decodeServerMessage(
      JSON.stringify({ type: 'state', room: view, futureEnvelopeField: true }),
    ),
    { type: 'state', room: view },
  );
});

test('decodes White Guy private state, guessing and shared survival winners', () => {
  for (const winner of [null, 'whiteGuy', 'infiltrators']) {
    const view = structuredClone(room);
    view.phase = winner ? 'finished' : 'guess';
    view.settings.whiteGuys = 1;
    view.self.role = 'whiteGuy';
    view.players[0].role = 'whiteGuy';
    view.players[0].alive = false;
    view.result = {
      ...result,
      role: 'whiteGuy',
      ...(winner ? { guess: { text: 'กาแฟ', correct: true } } : {}),
    };
    view.winner = winner;
    const message = { type: 'state', room: view };
    assert.deepEqual(decodeServerMessage(JSON.stringify(message)), message);
  }
});

test('rejects malformed White Guy settings, private roles and guess results', () => {
  const patches = [
    { settings: { ...room.settings, whiteGuys: -1 } },
    { settings: { ...room.settings, whiteGuys: 2 } },
    { settings: { ...room.settings, whiteGuys: '1' } },
    { self: { ...room.self, role: 'unknown' } },
    { result: { ...result, guess: { text: 1, correct: true } } },
    { result: { ...result, guess: { text: 'กาแฟ', correct: 'true' } } },
    { result: { ...result, guess: null } },
    { players: [{ ...room.players[0], role: 'infiltrators' }] },
  ];
  for (const patch of patches) {
    assert.equal(
      decodeServerMessage(
        JSON.stringify({ type: 'state', room: { ...room, ...patch } }),
      ),
      null,
      JSON.stringify(patch),
    );
  }
});
