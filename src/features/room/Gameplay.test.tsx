import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { RoomView } from '../../../shared/game';
import { History } from './History';
import { Home } from '../home/Home';
import { People } from './People';
import { Stage } from './stages/Stage';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('a non-host lobby directs removal of disconnected players to the host', () => {
  const currentRoom = room({ self: { id: 'c', word: null, hasVoted: false } });
  currentRoom.players[1].connected = false;
  render(<Stage room={currentRoom} disabled={false} send={vi.fn()} />);
  expect(
    screen.getByText('รอเพื่อนที่หลุดกลับมา หรือให้เจ้าของห้องนำออกก่อนเริ่ม'),
  ).toBeTruthy();
  expect(
    screen.queryByText(
      'รอเพื่อนที่หลุดกลับมา หรือไปหน้าผู้เล่นเพื่อนำออกก่อนเริ่ม',
    ),
  ).toBeNull();
});

test('a lobby retains a disconnected player and explains how to start after their return', () => {
  const send = vi.fn();
  const currentRoom = room();
  currentRoom.players[1].connected = false;
  const view = render(
    <Stage room={currentRoom} disabled={false} send={send} />,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เริ่มเกม' })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText(
      'รอเพื่อนที่หลุดกลับมา หรือไปหน้าผู้เล่นเพื่อนำออกก่อนเริ่ม',
    ),
  ).toBeTruthy();
  view.rerender(<Stage room={room()} disabled={false} send={send} />);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เริ่มเกม' })
      .disabled,
  ).toBe(false);
  expect(
    screen.queryByText(
      'รอเพื่อนที่หลุดกลับมา หรือไปหน้าผู้เล่นเพื่อนำออกก่อนเริ่ม',
    ),
  ).toBeNull();
});

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    hostId: 'a',
    stageId: 'stage-1',
    phase: 'lobby',
    game: 0,
    round: 0,
    settings: { category: 'food', undercovers: 1 },
    players: ['a', 'b', 'c'].map((id, avatar) => ({
      id,
      name: id,
      avatar,
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

test('creating a room submits the trimmed nickname, chosen avatar, and PIN', async () => {
  const send = vi.fn().mockResolvedValue(true);
  render(
    <Home send={send} disabled={false} pending={false} showRules={vi.fn()} />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: '  มะลิ  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'เลือกอวาตาร์ 🐼' }));
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '012345' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'สร้างห้อง' }).at(-1)!);
  await waitFor(() =>
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'create',
      name: 'มะลิ',
      avatar: 5,
      pin: '012345',
    }),
  );
});

test('an invite opens join mode and sends the current uppercase room code', async () => {
  window.history.replaceState({}, '', '/?room=abc234');
  const send = vi.fn().mockResolvedValue(true);
  render(
    <Home send={send} disabled={false} pending={false} showRules={vi.fn()} />,
  );
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'รหัสห้อง 6 ตัว' })
      .value,
  ).toBe('ABC234');
  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: ' บัว ' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'รหัสห้อง 6 ตัว' }), {
    target: { value: 'def567' },
  });
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'เข้าห้อง' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'join',
      code: 'DEF567',
      name: 'บัว',
      avatar: 0,
      pin: '123456',
    }),
  );
});

test('starting requires a connected civilian majority and host permission', () => {
  const send = vi.fn();
  const current = room();
  const view = render(<Stage room={current} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'เริ่มเกม' }));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'start',
    stageId: current.stageId,
  });
  view.rerender(
    <Stage
      room={{ ...current, settings: { category: 'food', undercovers: 2 } }}
      disabled={false}
      send={send}
    />,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เริ่มเกม' })
      .disabled,
  ).toBe(true);
  view.rerender(
    <Stage
      room={{
        ...current,
        players: current.players.map((p) => ({
          ...p,
          connected: p.id !== 'c',
        })),
      }}
      disabled={false}
      send={send}
    />,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เริ่มเกม' })
      .disabled,
  ).toBe(true);
  view.rerender(
    <Stage room={{ ...current, hostId: 'b' }} disabled={false} send={send} />,
  );
  expect(screen.queryByRole('button', { name: 'เริ่มเกม' })).toBeNull();
});

test('a failed clue retains its draft and a successful retry clears it', async () => {
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const current = room({ phase: 'clue', game: 1, round: 1, speakerId: 'a' });
  render(<Stage room={current} disabled={false} send={send} />);
  const input = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'คำใบ้ของคุณ',
  });
  const submit = screen.getByRole<HTMLButtonElement>('button', {
    name: 'ส่งคำใบ้',
  });
  fireEvent.change(input, { target: { value: '   ' } });
  expect(submit.disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'กินกับเพื่อน' } });
  fireEvent.click(submit);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(input.value).toBe('กินกับเพื่อน');
  fireEvent.click(submit);
  await waitFor(() => expect(input.value).toBe(''));
  expect(send).toHaveBeenLastCalledWith({
    type: 'clue',
    stageId: current.stageId,
    text: 'กินกับเพื่อน',
  });
});

test('only the host can skip the disconnected current speaker', () => {
  const base = room({ phase: 'clue', game: 1, round: 1, speakerId: 'b' });
  const current = {
    ...base,
    players: base.players.map((p) => ({ ...p, connected: p.id !== 'b' })),
  };
  const send = vi.fn();
  const view = render(<Stage room={current} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'ข้ามตาผู้เล่นที่หลุด' }));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'skip',
    stageId: current.stageId,
  });
  view.rerender(
    <Stage room={{ ...current, hostId: 'c' }} disabled={false} send={send} />,
  );
  expect(
    screen.queryByRole('button', { name: 'ข้ามตาผู้เล่นที่หลุด' }),
  ).toBeNull();
});

test('runoff voting excludes self and confirms only a selected finalist', () => {
  const current = room({
    phase: 'vote',
    game: 1,
    round: 1,
    voteCandidates: ['a', 'b'],
    result: {
      eliminatedId: null,
      role: null,
      counts: { a: 1, b: 1 },
      tiedIds: ['a', 'b'],
    },
  });
  const send = vi.fn();
  const view = render(<Stage room={current} disabled={false} send={send} />);
  const options = within(
    screen.getByRole('group', { name: 'เลือกผู้เล่นที่สงสัย' }),
  );
  expect(options.queryByRole('button', { name: 'a' })).toBeNull();
  expect(options.queryByRole('button', { name: 'c' })).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'ยืนยันโหวต' })
      .disabled,
  ).toBe(true);
  fireEvent.click(options.getByRole('button', { name: /b/ }));
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันโหวต b' }));
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'vote',
    stageId: current.stageId,
    targetId: 'b',
  });
  view.rerender(
    <Stage
      room={{ ...current, self: { ...current.self, hasVoted: true } }}
      disabled={false}
      send={send}
    />,
  );
  expect(
    screen.queryByRole('group', { name: 'เลือกผู้เล่นที่สงสัย' }),
  ).toBeNull();
  expect(screen.getByText('โหวตแล้ว รอเพื่อนที่เหลือ')).toBeTruthy();
});

test('disconnected players let the host request vote completion', () => {
  const base = room({
    phase: 'vote',
    game: 1,
    round: 1,
    voteCount: 1,
    voteCandidates: ['a', 'b', 'c'],
  });
  const current = {
    ...base,
    players: base.players.map((p) => ({ ...p, connected: p.id !== 'c' })),
  };
  const send = vi.fn();
  render(<Stage room={current} disabled={false} send={send} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'จบโหวตเมื่อคนที่เชื่อมต่อโหวตครบ' }),
  );
  expect(send).toHaveBeenCalledWith({
    type: 'finishVote',
    stageId: current.stageId,
  });
});

test('removing the selected candidate disables confirmation until another candidate is chosen', () => {
  const current = room({
    phase: 'vote',
    game: 1,
    round: 1,
    voteCandidates: ['a', 'b', 'c'],
  });
  const send = vi.fn();
  const view = render(<Stage room={current} disabled={false} send={send} />);
  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'เลือกผู้เล่นที่สงสัย' }),
    ).getByRole('button', { name: /b/ }),
  );
  view.rerender(
    <Stage
      room={{
        ...current,
        voteCandidates: ['a', 'c'],
        players: current.players.map((p) => ({
          ...p,
          alive: p.id !== 'b',
          connected: p.id !== 'b',
        })),
      }}
      disabled={false}
      send={send}
    />,
  );
  const confirm = screen.getByRole<HTMLButtonElement>('button', {
    name: /^ยืนยันโหวต/,
  });
  expect(confirm.disabled).toBe(true);
  expect(confirm.textContent).toBe('ยืนยันโหวต');
  fireEvent.click(confirm);
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'เลือกผู้เล่นที่สงสัย' }),
    ).getByRole('button', { name: /c/ }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันโหวต c' }));
  expect(send).toHaveBeenCalledWith({
    type: 'vote',
    stageId: current.stageId,
    targetId: 'c',
  });
});

test('only the host advances results and opens a rematch', () => {
  const current = room({
    phase: 'result',
    game: 1,
    round: 1,
    result: {
      eliminatedId: null,
      role: null,
      counts: { a: 1, b: 1, c: 1 },
      tiedIds: ['a', 'b', 'c'],
    },
  });
  const send = vi.fn();
  const view = render(<Stage room={current} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'เริ่มโหวตตัดสิน' }));
  expect(send).toHaveBeenCalledWith({ type: 'next', stageId: current.stageId });
  const finished = {
    ...current,
    phase: 'finished' as const,
    winner: 'civilian' as const,
    words: { civilian: 'หมูกระทะ', undercover: 'ชาบู' },
  };
  view.rerender(<Stage room={finished} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'เล่นอีกเกม' }));
  expect(send).toHaveBeenCalledWith({
    type: 'rematch',
    stageId: current.stageId,
  });
  view.rerender(
    <Stage room={{ ...finished, hostId: 'b' }} disabled={false} send={send} />,
  );
  expect(screen.queryByRole('button', { name: 'เล่นอีกเกม' })).toBeNull();
});

test('settings preserve other values and participants cannot change them', () => {
  const current = room();
  const send = vi.fn();
  const view = render(<People room={current} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'สถานที่' }));
  expect(send).toHaveBeenCalledWith({
    type: 'settings',
    stageId: current.stageId,
    settings: { category: 'places', undercovers: 1 },
  });
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'เพิ่มจำนวน Undercover',
    }).disabled,
  ).toBe(true);
  view.rerender(
    <People room={{ ...current, hostId: 'b' }} disabled={false} send={send} />,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'สถานที่' }).disabled,
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'นำ c ออก' })).toBeNull();
});

test('removing a player requires confirmation and retains the dialog on failure', async () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    },
  });
  const current = room();
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<People room={current} disabled={false} send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'นำ b ออก' }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'นำออกจากห้อง' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('dialog', { name: 'นำ b ออกจากห้อง?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'นำออกจากห้อง' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(send).toHaveBeenLastCalledWith({
    type: 'remove',
    stageId: current.stageId,
    targetId: 'b',
  });
});

test('history combines filters, resets the round on game change, and restores all clues', () => {
  const current = room({
    history: [
      {
        id: '1',
        game: 1,
        round: 2,
        playerId: 'a',
        name: 'a',
        avatar: 0,
        text: 'ร้อน',
        time: 1,
      },
      {
        id: '2',
        game: 2,
        round: 1,
        playerId: 'b',
        name: 'b',
        avatar: 1,
        text: 'น้ำ',
        time: 2,
      },
      {
        id: '3',
        game: 2,
        round: 1,
        playerId: 'departed',
        name: 'เพื่อนที่ออก',
        avatar: 2,
        text: 'เย็น',
        time: 3,
      },
    ],
  });
  render(<History room={current} />);
  const game = screen.getByRole<HTMLSelectElement>('combobox', { name: 'เกม' });
  const round = screen.getByRole<HTMLSelectElement>('combobox', {
    name: 'รอบ',
  });
  const player = screen.getByRole<HTMLSelectElement>('combobox', {
    name: 'ผู้เล่น',
  });
  fireEvent.change(round, { target: { value: '2' } });
  expect(screen.getByText('ร้อน')).toBeTruthy();
  expect(screen.queryByText('น้ำ')).toBeNull();
  fireEvent.change(game, { target: { value: '2' } });
  expect(round.value).toBe('all');
  expect(screen.getByText('น้ำ')).toBeTruthy();
  expect(screen.queryByText('ร้อน')).toBeNull();
  fireEvent.change(player, { target: { value: 'departed' } });
  expect(screen.getByText('เย็น')).toBeTruthy();
  expect(screen.queryByText('น้ำ')).toBeNull();
  fireEvent.change(game, { target: { value: '1' } });
  expect(screen.getByText('ไม่พบคำใบ้ที่เลือก')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'ดูคำใบ้ทั้งหมด' }));
  expect(game.value).toBe('all');
  expect(player.value).toBe('all');
  expect(screen.getByText('ร้อน')).toBeTruthy();
  expect(screen.getByText('น้ำ')).toBeTruthy();
  expect(screen.getByText('เย็น')).toBeTruthy();
});

test('pending or offline state disables clue and vote submission', () => {
  const send = vi.fn();
  const current = room({ phase: 'clue', game: 1, round: 1, speakerId: 'a' });
  const view = render(<Stage room={current} disabled send={send} />);
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'คำใบ้ของคุณ' })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'ส่งคำใบ้' })
      .disabled,
  ).toBe(true);
  view.rerender(
    <Stage
      room={{ ...current, phase: 'vote', voteCandidates: ['a', 'b', 'c'] }}
      disabled
      send={send}
    />,
  );
  const options = within(
    screen.getByRole('group', { name: 'เลือกผู้เล่นที่สงสัย' }),
  ).getAllByRole<HTMLButtonElement>('button');
  expect(options.every((button) => button.disabled)).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'ยืนยันโหวต' })
      .disabled,
  ).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
