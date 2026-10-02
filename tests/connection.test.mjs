import assert from 'node:assert/strict';
import { test } from 'node:test';
import { room, session } from './fixtures.mjs';

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];
  readyState = 0;
  messages = [];

  constructor(url) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(data) {
    this.messages.push(JSON.parse(data));
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.readyState = 3;
  }

  disconnect() {
    this.close();
    this.onclose?.();
  }
}

function setup(t, saved = null, deniedStorage = false) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  FakeWebSocket.instances = [];
  const values = new Map(
    saved ? [['undercover-session', JSON.stringify(saved)]] : [],
  );
  const storage = {
    getItem(key) {
      if (deniedStorage) throw new Error('Storage is denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (deniedStorage) throw new Error('Storage is denied');
      values.set(key, value);
    },
    removeItem(key) {
      if (deniedStorage) throw new Error('Storage is denied');
      values.delete(key);
    },
  };
  const urls = [];
  const descriptors = new Map();
  for (const [key, value] of Object.entries({
    WebSocket: FakeWebSocket,
    sessionStorage: storage,
    window: {
      location: {
        protocol: 'http:',
        host: 'localhost:8080',
        href: 'http://localhost:8080/',
        pathname: '/',
      },
      history: {
        replaceState: (_state, _unused, url) => urls.push(String(url)),
      },
    },
  })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { values, urls };
}

async function connect(t, saved = null, deniedStorage = false) {
  const fixture = setup(t, saved, deniedStorage);
  const { GameConnection } = await import('../src/game/connection.ts');
  const connection = new GameConnection();
  const unsubscribe = connection.subscribe(() => {});
  const socket = FakeWebSocket.instances.at(-1);
  t.after(async () => {
    unsubscribe();
    await Promise.resolve();
  });
  return { ...fixture, connection, socket, unsubscribe };
}

test('final unsubscribe disconnects and settles the in-flight action', async (t) => {
  const { connection, socket, unsubscribe } = await connect(t);
  socket.open();
  const pending = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  unsubscribe();
  await Promise.resolve();
  assert.equal(connection.getSnapshot().connected, false);
  assert.equal(await pending, false);
  assert.equal(connection.getSnapshot().pending, false);
  t.mock.timers.tick(10_000);
  assert.equal(FakeWebSocket.instances.length, 1);
});

test('a validation failure retains its localization identifier, parameters and legacy text', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const pending = connection.send({
    type: 'create',
    name: '',
    avatar: 0,
    pin: '012345',
  });
  const reply = {
    ok: false,
    code: 'GAME',
    error: 'ข้อความต้องมี 1–20 ตัวอักษร',
    messageId: 'TEXT_LENGTH_OUT_OF_RANGE',
    messageParams: { min: 1, max: 20 },
  };
  socket.receive({ type: 'reply', id: socket.messages[0].id, reply });
  assert.equal(await pending, false);
  assert.deepEqual(connection.getSnapshot().error, {
    messageId: reply.messageId,
    messageParams: reply.messageParams,
    fallback: reply.error,
  });
  connection.clearError();
  assert.equal(connection.getSnapshot().error, null);
});

test('a localized session failure revokes the seat using the existing broad code', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: {
      ok: false,
      code: 'SESSION',
      error: 'Room expired',
      messageId: 'ROOM_NOT_FOUND',
    },
  });
  await Promise.resolve();
  assert.equal(values.has('undercover-session'), false);
  assert.equal(connection.getSnapshot().restoring, false);
  assert.equal(connection.getSnapshot().error?.messageId, 'ROOM_NOT_FOUND');
  assert.equal(connection.getSnapshot().error?.fallback, 'Room expired');
});

test('localized removal revokes the seat and explicit leave produces no alert', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  await Promise.resolve();
  socket.receive({
    type: 'removed',
    reason: 'Removed by host',
    messageId: 'REMOVED_BY_HOST',
  });
  assert.equal(values.has('undercover-session'), false);
  assert.equal(connection.getSnapshot().room, null);
  assert.equal(connection.getSnapshot().error?.messageId, 'REMOVED_BY_HOST');
  socket.receive({ type: 'removed', reason: '' });
  assert.equal(connection.getSnapshot().error, null);
});

test('StrictMode resubscription retains the same socket', async (t) => {
  const { connection, socket, unsubscribe } = await connect(t);
  socket.open();
  unsubscribe();
  const nextUnsubscribe = connection.subscribe(() => {});
  await Promise.resolve();
  assert.equal(connection.getSnapshot().connected, true);
  assert.equal(FakeWebSocket.instances.length, 1);
  nextUnsubscribe();
});

test('disconnect settles an action and reconnect resumes the same seat', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const joining = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session },
  });
  assert.equal(await joining, true);
  socket.receive({ type: 'state', room });
  const pending = connection.send({ type: 'start', stageId: room.stageId });
  socket.disconnect();
  assert.equal(await pending, false);
  assert.equal(connection.getSnapshot().room.code, session.code);
  t.mock.timers.tick(500);
  const restored = FakeWebSocket.instances.at(-1);
  restored.open();
  assert.equal(connection.getSnapshot().restoring, true);
  assert.deepEqual(restored.messages[0].action, {
    type: 'resume',
    code: session.code,
    token: session.token,
  });
  restored.receive({
    type: 'reply',
    id: restored.messages[0].id,
    reply: { ok: true },
  });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, true);
  assert.equal(
    await connection.send({ type: 'start', stageId: room.stageId }),
    false,
  );
  assert.equal(restored.messages.length, 1);
  restored.receive({ type: 'state', room });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, false);
});

test('legacy state before resume acknowledgement clears the prior disconnect error', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const joining = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  assert.equal(await joining, true);

  const pending = connection.send({ type: 'start', stageId: room.stageId });
  socket.disconnect();
  assert.equal(await pending, false);
  assert.equal(connection.getSnapshot().error?.messageId, 'CONNECTION_DROPPED');

  t.mock.timers.tick(500);
  const restored = FakeWebSocket.instances.at(-1);
  restored.open();
  restored.receive({ type: 'state', room });
  restored.receive({
    type: 'reply',
    id: restored.messages[0].id,
    reply: { ok: true },
  });
  await Promise.resolve();

  assert.equal(connection.getSnapshot().room.code, session.code);
  assert.equal(connection.getSnapshot().restoring, false);
  assert.equal(connection.getSnapshot().error, null);
});

test('an acknowledged legacy resume reconnects when its state never arrives', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true },
  });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, true);

  t.mock.timers.tick(6000);
  assert.equal(connection.getSnapshot().connected, false);
  assert.equal(connection.getSnapshot().restoring, true);
  assert.equal(
    connection.getSnapshot().error?.messageId,
    'SERVER_MESSAGE_INVALID',
  );
  assert.equal(values.has('undercover-session'), true);

  t.mock.timers.tick(500);
  const current = FakeWebSocket.instances.at(-1);
  assert.notEqual(current, socket);
  current.open();
  assert.deepEqual(current.messages[0].action, {
    type: 'resume',
    code: session.code,
    token: session.token,
  });
});

test('malformed state during restoration reconnects without revoking the saved seat', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true },
  });
  await Promise.resolve();
  socket.receive({ type: 'state', room: { code: session.code } });

  assert.equal(connection.getSnapshot().connected, false);
  assert.equal(connection.getSnapshot().restoring, true);
  assert.equal(
    connection.getSnapshot().error?.messageId,
    'SERVER_MESSAGE_INVALID',
  );
  assert.equal(values.has('undercover-session'), true);
});

test('seat replacement during restoration preserves its terminal reason', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'removed',
    reason: 'Seat replaced',
    messageId: 'SEAT_REPLACED',
  });
  await Promise.resolve();

  assert.equal(values.has('undercover-session'), false);
  assert.equal(connection.getSnapshot().restoring, false);
  assert.equal(connection.getSnapshot().error?.messageId, 'SEAT_REPLACED');
});

test('callbacks from a disposed socket cannot change the current connection', async (t) => {
  const { connection, socket, unsubscribe } = await connect(t);
  socket.open();
  unsubscribe();
  await Promise.resolve();
  const nextUnsubscribe = connection.subscribe(() => {});
  const current = FakeWebSocket.instances.at(-1);
  current.open();
  current.receive({ type: 'state', room });
  socket.receive({ type: 'removed', reason: 'Stale socket' });
  socket.disconnect();
  assert.equal(connection.getSnapshot().room.code, session.code);
  assert.equal(connection.getSnapshot().connected, true);
  nextUnsubscribe();
});

test('denied session storage does not stop live play or leaving', async (t) => {
  const { connection, socket } = await connect(t, null, true);
  socket.open();
  const joining = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session },
  });
  assert.equal(await joining, true);
  socket.receive({ type: 'state', room });
  const leaving = connection.send({ type: 'leave' });
  socket.receive({
    type: 'reply',
    id: socket.messages[1].id,
    reply: { ok: true },
  });
  assert.equal(await leaving, true);
  assert.equal(connection.getSnapshot().room, null);
});

test('expired session removes saved seat while retaining the server error', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: false, error: 'Room expired', code: 'SESSION' },
  });
  await Promise.resolve();
  assert.equal(values.has('undercover-session'), false);
  assert.equal(connection.getSnapshot().restoring, false);
  assert.equal(connection.getSnapshot().error?.fallback, 'Room expired');
});

test('a restoration timeout reconnects without allowing actions on stale room state', async (t) => {
  const { connection, socket, values } = await connect(t, session);
  socket.open();
  socket.receive({ type: 'state', room });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session },
  });
  await Promise.resolve();
  socket.disconnect();
  t.mock.timers.tick(500);
  const stalled = FakeWebSocket.instances.at(-1);
  stalled.open();
  t.mock.timers.tick(6000);
  await Promise.resolve();
  assert.equal(connection.getSnapshot().connected, false);
  assert.equal(
    await connection.send({ type: 'start', stageId: room.stageId }),
    false,
  );
  assert.equal(stalled.messages.length, 1);
  assert.equal(values.has('undercover-session'), true);
  t.mock.timers.tick(500);
  const recovered = FakeWebSocket.instances.at(-1);
  assert.notEqual(recovered, stalled);
  recovered.open();
  const currentRoom = { ...room, stageId: 'current-stage' };
  recovered.receive({ type: 'state', room: currentRoom });
  recovered.receive({
    type: 'reply',
    id: recovered.messages[0].id,
    reply: { ok: true, session },
  });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().connected, true);
  assert.equal(connection.getSnapshot().restoring, false);
  assert.equal(connection.getSnapshot().room.stageId, 'current-stage');
  assert.equal(connection.getSnapshot().error, null);
});

test('a late successful entry stays serialized through the grace period', async (t) => {
  const { connection, socket, values, urls } = await connect(t);
  socket.open();
  const pending = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  t.mock.timers.tick(6000);
  await Promise.resolve();
  assert.equal(connection.getSnapshot().pending, true);
  assert.equal(
    await connection.send({
      type: 'join',
      code: session.code,
      name: 'Other',
      avatar: 1,
      pin: '123456',
    }),
    false,
  );
  assert.equal(socket.messages.length, 1);
  socket.receive({ type: 'state', room });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session },
  });
  assert.equal(await pending, true);
  assert.equal(connection.getSnapshot().pending, false);
  assert.deepEqual(JSON.parse(values.get('undercover-session')), session);
  assert.equal(connection.getSnapshot().error, null);
  assert.equal(urls.at(-1), 'http://localhost:8080/?room=ABC234');
  socket.disconnect();
  t.mock.timers.tick(500);
  const restored = FakeWebSocket.instances.at(-1);
  restored.open();
  assert.deepEqual(restored.messages[0].action, {
    type: 'resume',
    code: session.code,
    token: session.token,
  });
});

test('an atomic entry reply retains its seat when disconnected before the later broadcast', async (t) => {
  const { connection, socket, values } = await connect(t);
  socket.open();
  const joining = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  socket.disconnect();
  assert.equal(await joining, true);
  assert.deepEqual(JSON.parse(values.get('undercover-session')), session);
  assert.equal(connection.getSnapshot().room.code, session.code);
  t.mock.timers.tick(500);
  const restored = FakeWebSocket.instances.at(-1);
  restored.open();
  assert.equal(connection.getSnapshot().restoring, true);
  assert.deepEqual(restored.messages[0].action, {
    type: 'resume',
    code: session.code,
    token: session.token,
  });
  restored.receive({
    type: 'reply',
    id: restored.messages[0].id,
    reply: { ok: true, session, room },
  });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, false);
});

test('an unconfirmed entry expires and reconnects instead of retaining callbacks indefinitely', async (t) => {
  const { connection, socket, values } = await connect(t);
  socket.open();
  const joining = connection.send({
    type: 'join',
    code: session.code,
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  const request = socket.messages[0];
  t.mock.timers.tick(6000);
  await Promise.resolve();
  assert.equal(connection.getSnapshot().pending, true);
  t.mock.timers.tick(6000);
  assert.equal(await joining, false);
  assert.equal(connection.getSnapshot().pending, false);
  assert.equal(connection.getSnapshot().connected, false);
  socket.receive({
    type: 'reply',
    id: request.id,
    reply: { ok: true, session, room },
  });
  assert.equal(values.has('undercover-session'), false);
  t.mock.timers.tick(500);
  const current = FakeWebSocket.instances.at(-1);
  assert.notEqual(current, socket);
  current.open();
  assert.equal(connection.getSnapshot().room, null);
  assert.equal(connection.getSnapshot().connected, true);
  assert.equal(connection.getSnapshot().error, null);
});

test('invalid server state reports an error without replacing the current room', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  socket.receive({ type: 'state', room });
  socket.receive({ type: 'state', room: { code: session.code } });
  assert.deepEqual(connection.getSnapshot().room, room);
  assert.equal(
    connection.getSnapshot().error?.messageId,
    'SERVER_MESSAGE_INVALID',
  );
});

test('a synchronous socket send failure settles pending immediately', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  socket.send = () => {
    throw new Error('Socket is closed');
  };
  assert.equal(
    await connection.send({
      type: 'create',
      name: 'Player',
      avatar: 0,
      pin: '012345',
    }),
    false,
  );
  assert.equal(connection.getSnapshot().pending, false);
});

test('removal revokes the saved seat and retains the removal reason', async (t) => {
  const { connection, socket, values, urls } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true },
  });
  socket.receive({ type: 'state', room });
  await Promise.resolve();
  let homeUrl;
  const unsubscribe = connection.subscribe(() => {
    if (!connection.getSnapshot().room) homeUrl = urls.at(-1);
  });
  socket.receive({ type: 'removed', reason: 'Removed by host' });
  unsubscribe();
  assert.equal(connection.getSnapshot().room, null);
  assert.equal(connection.getSnapshot().error?.fallback, 'Removed by host');
  assert.equal(values.has('undercover-session'), false);
  assert.equal(homeUrl, '/');
});

test('seat replacement settles an in-flight action and preserves its reason after reconnect', async (t) => {
  const { connection, socket } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  await Promise.resolve();

  const pending = connection.send({ type: 'start', stageId: room.stageId });
  const request = socket.messages[1];
  socket.receive({
    type: 'removed',
    reason: 'Seat replaced',
    messageId: 'SEAT_REPLACED',
  });

  assert.equal(await pending, false);
  assert.equal(connection.getSnapshot().pending, false);
  assert.equal(connection.getSnapshot().error?.messageId, 'SEAT_REPLACED');
  socket.receive({
    type: 'reply',
    id: request.id,
    reply: { ok: false, code: 'SESSION', error: 'Session required' },
  });
  socket.disconnect();
  t.mock.timers.tick(500);
  const current = FakeWebSocket.instances.at(-1);
  current.open();
  assert.equal(connection.getSnapshot().error?.messageId, 'SEAT_REPLACED');
});

test('blank removal completes explicit leave without showing an alert', async (t) => {
  const { connection, socket } = await connect(t, session);
  socket.open();
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  await Promise.resolve();

  const leaving = connection.send({ type: 'leave' });
  socket.receive({ type: 'removed', reason: '' });

  assert.equal(await leaving, true);
  assert.equal(connection.getSnapshot().pending, false);
  assert.equal(connection.getSnapshot().room, null);
  assert.equal(connection.getSnapshot().error, null);
});

test('only one action is sent while another action is pending', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const first = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  assert.equal(
    await connection.send({
      type: 'join',
      name: 'Other',
      code: session.code,
      avatar: 1,
      pin: '123456',
    }),
    false,
  );
  assert.equal(socket.messages.length, 1);
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session },
  });
  assert.equal(await first, true);
});

test('an action during socket closing fails before sending a request', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  socket.close();
  assert.equal(
    await connection.send({
      type: 'create',
      name: 'Player',
      avatar: 0,
      pin: '012345',
    }),
    false,
  );
  assert.equal(socket.messages.length, 0);
  assert.equal(connection.getSnapshot().pending, false);
});

test('uncompleted restoration from an old socket cannot enable actions on a new socket', async (t) => {
  const { connection, socket, unsubscribe } = await connect(t, session);
  socket.open();
  unsubscribe();
  await Promise.resolve();
  const nextUnsubscribe = connection.subscribe(() => {});
  const current = FakeWebSocket.instances.at(-1);
  current.open();
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, true);
  assert.equal(
    await connection.send({ type: 'start', stageId: room.stageId }),
    false,
  );
  assert.equal(current.messages.length, 1);
  current.receive({
    type: 'reply',
    id: current.messages[0].id,
    reply: { ok: true },
  });
  current.receive({ type: 'state', room });
  await Promise.resolve();
  assert.equal(connection.getSnapshot().restoring, false);
  nextUnsubscribe();
});

test('a definitive late entry failure replaces the waiting error and releases pending', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const joining = connection.send({
    type: 'join',
    code: session.code,
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  t.mock.timers.tick(6000);
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: false, code: 'SESSION', error: 'Room expired' },
  });
  assert.equal(await joining, false);
  assert.equal(connection.getSnapshot().error?.fallback, 'Room expired');
  assert.equal(connection.getSnapshot().pending, false);
  t.mock.timers.tick(6000);
  assert.equal(connection.getSnapshot().connected, true);
});

test('reconnection without a saved seat clears the disconnected entry error', async (t) => {
  const { connection, socket } = await connect(t);
  socket.open();
  const creating = connection.send({
    type: 'create',
    name: 'Player',
    avatar: 0,
    pin: '012345',
  });
  socket.disconnect();
  assert.equal(await creating, false);
  assert.notEqual(connection.getSnapshot().error, null);
  t.mock.timers.tick(500);
  const current = FakeWebSocket.instances.at(-1);
  current.open();
  assert.equal(connection.getSnapshot().connected, true);
  assert.equal(connection.getSnapshot().error, null);
});

test('PIN recovery stores only the new session and resumes it after disconnect', async (t) => {
  const { connection, socket, values, urls } = await connect(t);
  socket.open();
  const recoveredSession = { ...session, token: 'recovered-private-token' };
  const recovering = connection.send({
    type: 'recover',
    code: session.code,
    name: 'Player',
    pin: '012345',
  });
  assert.deepEqual(socket.messages[0].action, {
    type: 'recover',
    code: session.code,
    name: 'Player',
    pin: '012345',
  });
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session: recoveredSession, room },
  });
  assert.equal(await recovering, true);
  assert.equal(connection.getSnapshot().room.self.id, session.playerId);
  assert.deepEqual(
    JSON.parse(values.get('undercover-session')),
    recoveredSession,
  );
  assert.equal(urls.at(-1), 'http://localhost:8080/?room=ABC234');
  assert.equal(
    [...values.values()].some((value) => value.includes('012345')),
    false,
  );
  socket.disconnect();
  t.mock.timers.tick(500);
  const restored = FakeWebSocket.instances.at(-1);
  restored.open();
  assert.deepEqual(restored.messages[0].action, {
    type: 'resume',
    code: session.code,
    token: recoveredSession.token,
  });
});

test('failed PIN recovery keeps the player outside and allows a corrected retry', async (t) => {
  const { connection, socket, values } = await connect(t);
  socket.open();
  const action = {
    type: 'recover',
    code: session.code,
    name: 'Player',
    pin: '000000',
  };
  const failed = connection.send(action);
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: false, code: 'GAME', error: 'ชื่อหรือ PIN ไม่ถูกต้อง' },
  });
  assert.equal(await failed, false);
  assert.equal(connection.getSnapshot().room, null);
  assert.equal(connection.getSnapshot().pending, false);
  assert.equal(
    connection.getSnapshot().error?.fallback,
    'ชื่อหรือ PIN ไม่ถูกต้อง',
  );
  assert.equal(values.has('undercover-session'), false);
  const retry = connection.send({ ...action, pin: '012345' });
  socket.receive({
    type: 'reply',
    id: socket.messages[1].id,
    reply: { ok: true, session, room },
  });
  assert.equal(await retry, true);
  assert.equal(connection.getSnapshot().error, null);
});

test('a late PIN recovery waits for confirmation before allowing another entry', async (t) => {
  const { connection, socket, values } = await connect(t);
  socket.open();
  const action = {
    type: 'recover',
    code: session.code,
    name: 'Player',
    pin: '012345',
  };
  const recovering = connection.send(action);
  t.mock.timers.tick(6000);
  await Promise.resolve();
  assert.equal(connection.getSnapshot().pending, true);
  assert.equal(await connection.send(action), false);
  assert.equal(socket.messages.length, 1);
  socket.receive({
    type: 'reply',
    id: socket.messages[0].id,
    reply: { ok: true, session, room },
  });
  assert.equal(await recovering, true);
  assert.deepEqual(JSON.parse(values.get('undercover-session')), session);
  assert.equal(connection.getSnapshot().pending, false);
  assert.equal(connection.getSnapshot().error, null);
});
