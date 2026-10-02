import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { RoomView } from '../../shared/game';
import { App } from './App';
import { Modal } from '../design-system/Modal';
import { Home } from '../features/home/Home';
import { People } from '../features/room/People';
import { Room } from '../features/room/Room';

const mockUseGame = vi.hoisted(() => vi.fn());

vi.mock('../game/use-game', () => ({ useGame: mockUseGame }));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  mockUseGame.mockReset();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  document.querySelector('[data-modal-opener]')?.remove();
});

function stubDialogMethods() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: showModal },
    close: { configurable: true, value: close },
  });
  return { showModal, close };
}

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    hostId: 'a',
    stageId: 'reveal-1',
    phase: 'reveal',
    game: 1,
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
    self: { id: 'a', word: 'หมูกระทะ', hasVoted: false },
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

function clueRoom(stageId = 'clue-1'): RoomView {
  return room({
    stageId,
    phase: 'clue',
    round: 1,
    speakerId: 'a',
  });
}

function gameState(currentRoom: RoomView | null) {
  return {
    connected: true,
    pending: false,
    restoring: false,
    room: currentRoom,
    error: null,
    send: vi.fn().mockResolvedValue(true),
    clearError: vi.fn(),
  };
}

test('entering a room focuses its page heading', async () => {
  mockUseGame.mockReturnValue(gameState(null));
  const view = render(<App />);
  document.querySelector<HTMLElement>('.entry-submit')?.focus();

  mockUseGame.mockReturnValue(gameState(room()));
  view.rerender(<App />);

  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'ห้องของเรา' }),
    ),
  );
});

test('room requests announce pending work and clear the message when settled', () => {
  mockUseGame.mockReturnValue({ ...gameState(room()), pending: true });
  const view = render(<App />);
  const pendingMessage = screen.getByText('รอสักครู่ กำลังอัปเดตเกม…');
  expect(pendingMessage.getAttribute('role')).toBe('status');

  mockUseGame.mockReturnValue(gameState(room()));
  view.rerender(<App />);

  expect(screen.queryByText('รอสักครู่ กำลังอัปเดตเกม…')).toBeNull();
});

test('a new action error focuses its alert without stealing focus again', () => {
  mockUseGame.mockReturnValue(gameState(null));
  const view = render(<App />);
  screen.getAllByRole('button', { name: 'สร้างห้อง' }).at(-1)!.focus();

  const failed = {
    ...gameState(null),
    error: { fallback: 'ไม่พบห้องนี้ ตรวจรหัสแล้วลองอีกครั้ง' },
  };
  mockUseGame.mockReturnValue(failed);
  view.rerender(<App />);

  const alert = screen.getByRole('alert');
  expect(alert.getAttribute('tabindex')).toBe('-1');
  expect(document.activeElement).toBe(alert);

  const nickname = screen.getByRole('textbox', { name: 'ชื่อเล่น' });
  nickname.focus();
  mockUseGame.mockReturnValue({ ...failed, connected: false });
  view.rerender(<App />);

  expect(document.activeElement).toBe(nickname);
});

test('a new global error does not steal focus from an open dialog', () => {
  stubDialogMethods();
  mockUseGame.mockReturnValue(gameState(null));
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'วิธีเล่น' }));
  const dialog = screen.getByRole('dialog', {
    name: 'รู้กติกา ก่อนจับพิรุธ',
  });
  const close = within(dialog).getByRole('button', { name: 'ปิด' });
  close.focus();

  mockUseGame.mockReturnValue({
    ...gameState(null),
    error: { fallback: 'การเชื่อมต่อขัดข้อง ลองอีกครั้ง' },
  });
  view.rerender(<App />);

  expect(screen.getByRole('alert')).toBeTruthy();
  expect(document.activeElement).toBe(close);
});

test('rendering Room alone does not move focus', () => {
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  expect(document.activeElement).toBe(document.body);
});

test('switching room views focuses the selected panel heading', async () => {
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'คำใบ้' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'สมุดคำใบ้' }),
    ),
  );

  fireEvent.click(screen.getByRole('button', { name: 'ผู้เล่น' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'เพื่อนในวง' }),
    ),
  );
});

test('advancing the stage focuses play when focus was in play or lost', async () => {
  const send = vi.fn();
  const view = render(<Room room={room()} disabled={false} send={send} />);
  screen.getByRole('button', { name: 'จำคำแล้ว พร้อมเล่น' }).focus();

  view.rerender(<Room room={clueRoom()} disabled={false} send={send} />);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', {
        level: 2,
        name: 'ตาคุณแล้ว ใบ้ว่าอะไรดี?',
      }),
    ),
  );

  (document.activeElement as HTMLElement).blur();
  expect(document.activeElement).toBe(document.body);
  view.rerender(
    <Room room={clueRoom('clue-2')} disabled={false} send={send} />,
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', {
        level: 2,
        name: 'ตาคุณแล้ว ใบ้ว่าอะไรดี?',
      }),
    ),
  );
});

test('advancing the stage does not steal focus from sharing or history', async () => {
  const currentRoom = room({
    history: [
      {
        id: 'clue-a',
        game: 1,
        round: 1,
        playerId: 'a',
        name: 'a',
        avatar: 0,
        text: 'ร้อน',
        time: 1,
      },
    ],
  });
  const view = render(
    <Room room={currentRoom} disabled={false} send={vi.fn()} />,
  );
  const shareButton = screen.getByRole('button', { name: 'ชวนเพื่อน' });
  shareButton.focus();

  view.rerender(
    <Room
      room={{ ...clueRoom(), history: currentRoom.history }}
      disabled={false}
      send={vi.fn()}
    />,
  );
  expect(document.activeElement).toBe(shareButton);

  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'มุมมองห้อง' })).getByRole(
      'button',
      { name: 'คำใบ้' },
    ),
  );
  const gameFilter = screen.getByRole('combobox', { name: 'เกม' });
  gameFilter.focus();
  view.rerender(
    <Room
      room={{ ...clueRoom('clue-2'), history: currentRoom.history }}
      disabled={false}
      send={vi.fn()}
    />,
  );
  await waitFor(() => expect(document.activeElement).toBe(gameFilter));
});

test('advancing the stage does not steal focus from a modal', async () => {
  const { showModal, close } = stubDialogMethods();
  const lobby = room({ stageId: 'lobby-1', phase: 'lobby', game: 0 });
  const view = render(<Room room={lobby} disabled={false} send={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'ผู้เล่น' }));
  fireEvent.click(screen.getByRole('button', { name: 'นำ b ออก' }));
  const modalClose = screen.getByRole('button', { name: 'ปิด' });
  modalClose.focus();

  view.rerender(
    <Room
      room={{ ...lobby, stageId: 'lobby-2' }}
      disabled={false}
      send={vi.fn()}
    />,
  );

  await waitFor(() => expect(document.activeElement).toBe(modalClose));
  expect(showModal).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});

test('unmounting a modal restores focus to its connected opener', () => {
  stubDialogMethods();
  const opener = document.createElement('button');
  opener.dataset.modalOpener = '';
  opener.textContent = 'วิธีเล่น';
  document.body.append(opener);
  opener.focus();
  const view = render(
    <Modal title="รู้กติกา ก่อนจับพิรุธ" closeLabel="ปิด" close={vi.fn()}>
      <button>ปิดกติกา</button>
    </Modal>,
  );
  const modalClose = screen.getByRole('button', { name: 'ปิด' });
  modalClose.focus();

  view.unmount();

  expect(document.activeElement).toBe(opener);
});

test('removing the dialog opener returns focus to the player list heading', () => {
  stubDialogMethods();
  const lobby = room({ phase: 'lobby', stageId: 'lobby-1' });
  const send = vi.fn();
  const view = render(<People room={lobby} disabled={false} send={send} />);
  const opener = screen.getByRole('button', { name: 'นำ b ออก' });
  opener.focus();
  fireEvent.click(opener);
  screen.getByRole('button', { name: 'ปิด' }).focus();

  view.rerender(
    <People
      room={{
        ...lobby,
        players: lobby.players.filter((player) => player.id !== 'b'),
      }}
      disabled={false}
      send={send}
    />,
  );

  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'เพื่อนในวง' }),
  );
});

test('a successful removal focuses the player list before its snapshot arrives', async () => {
  stubDialogMethods();
  const lobby = room({ phase: 'lobby', stageId: 'lobby-1' });
  const send = vi.fn().mockResolvedValue(true);
  const view = render(<People room={lobby} disabled={false} send={send} />);
  const opener = screen.getByRole('button', { name: 'นำ b ออก' });
  opener.focus();
  fireEvent.click(opener);
  const confirm = screen.getByRole('button', { name: 'นำออกจากห้อง' });
  confirm.focus();
  fireEvent.click(confirm);

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const heading = screen.getByRole('heading', { name: 'เพื่อนในวง' });
  expect(document.activeElement).toBe(heading);

  view.rerender(
    <People
      room={{
        ...lobby,
        players: lobby.players.filter((player) => player.id !== 'b'),
      }}
      disabled={false}
      send={send}
    />,
  );
  expect(document.activeElement).toBe(heading);
});

test('a pending removal cannot be dismissed and a failure restores recovery', async () => {
  stubDialogMethods();
  let resolveRemoval!: (success: boolean) => void;
  const send = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveRemoval = resolve;
      }),
  );
  const lobby = room({ phase: 'lobby', stageId: 'lobby-1' });
  render(<People room={lobby} disabled={false} send={send} />);
  const opener = screen.getByRole('button', { name: 'นำ b ออก' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', {
    name: 'นำ b ออกจากห้อง?',
  });
  const confirm = within(dialog).getByRole('button', {
    name: 'นำออกจากห้อง',
  });
  confirm.focus();
  fireEvent.click(confirm);
  const cancel = screen.getByRole<HTMLButtonElement>('button', {
    name: 'ยกเลิก',
  });
  const close = screen.getByRole<HTMLButtonElement>('button', { name: 'ปิด' });
  const pending = screen.getByRole<HTMLButtonElement>('button', {
    name: 'กำลังนำออก…',
  });
  await waitFor(() => expect(dialog.getAttribute('aria-busy')).toBe('true'));
  expect(document.activeElement).toBe(
    within(dialog).getByRole('heading', { name: 'กำลังนำ b ออกจากห้อง…' }),
  );
  expect(cancel.disabled).toBe(true);
  expect(close.disabled).toBe(true);
  expect(pending.disabled).toBe(true);

  fireEvent.click(cancel);
  fireEvent.click(close);
  const cancelEvent = new Event('cancel', {
    bubbles: false,
    cancelable: true,
  });
  fireEvent(dialog, cancelEvent);
  expect(cancelEvent.defaultPrevented).toBe(true);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(send).toHaveBeenCalledTimes(1);

  await act(async () => resolveRemoval(false));
  expect(dialog.getAttribute('aria-busy')).not.toBe('true');
  expect(within(dialog).getByRole('alert').textContent).toBe(
    'ยังยืนยันการนำออกไม่ได้ ปิดหน้าต่างเพื่อตรวจรายชื่อก่อนลองอีกครั้ง',
  );
  const dismiss = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'ปิดหน้าต่าง',
  });
  expect(dismiss.disabled).toBe(false);
  expect(close.disabled).toBe(false);
  fireEvent.click(dismiss);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test('a pending leave cannot be dismissed and a failure restores recovery', async () => {
  stubDialogMethods();
  let resolveLeave!: (success: boolean) => void;
  const send = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveLeave = resolve;
      }),
  );
  mockUseGame.mockReturnValue({ ...gameState(room()), send });
  render(<App />);
  const opener = screen.getByRole('button', { name: 'ออกจากห้อง' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'ออกจากวงนี้?' });
  const confirm = within(dialog).getByRole('button', {
    name: /^ออกจากห้อง/,
  });
  confirm.focus();
  fireEvent.click(confirm);
  const stay = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'อยู่ต่อ',
  });
  const close = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'ปิด',
  });
  const pending = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'กำลังออกจากห้อง…',
  });
  await waitFor(() => expect(dialog.getAttribute('aria-busy')).toBe('true'));
  expect(document.activeElement).toBe(
    within(dialog).getByRole('heading', { name: 'กำลังออกจากห้อง…' }),
  );
  expect(stay.disabled).toBe(true);
  expect(close.disabled).toBe(true);
  expect(pending.disabled).toBe(true);

  fireEvent.click(stay);
  fireEvent.click(close);
  const cancelEvent = new Event('cancel', {
    bubbles: false,
    cancelable: true,
  });
  fireEvent(dialog, cancelEvent);
  expect(cancelEvent.defaultPrevented).toBe(true);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(send).toHaveBeenCalledTimes(1);

  await act(async () => resolveLeave(false));
  expect(dialog.getAttribute('aria-busy')).not.toBe('true');
  expect(within(dialog).getByRole('alert').textContent).toBe(
    'ยังยืนยันการออกจากห้องไม่ได้ ปิดหน้าต่างเพื่อตรวจสถานะห้องก่อนลองอีกครั้ง',
  );
  const dismiss = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'ปิดหน้าต่าง',
  });
  expect(dismiss.disabled).toBe(false);
  expect(close.disabled).toBe(false);
  fireEvent.click(dismiss);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test('clipboard failure focuses and selects the fallback link and announces it', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));

  const fallback = await screen.findByRole<HTMLInputElement>('textbox', {
    name: 'ลิงก์เข้าห้อง',
  });
  expect(document.activeElement).toBe(fallback);
  expect(fallback.selectionStart).toBe(0);
  expect(fallback.selectionEnd).toBe(fallback.getAttribute('value')?.length);
  expect(
    screen
      .getAllByRole('status')
      .some((status) =>
        /คัดลอก.*ลิงก์.*ให้เพื่อน/.test(status.textContent ?? ''),
      ),
  ).toBe(true);
});

test('clipboard success temporarily confirms completion on the invite button', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  });

  const copiedButton = screen.getByRole('button', { name: 'คัดลอกแล้ว' });
  expect(copiedButton.querySelector('.lucide-check')).toBeTruthy();
  const copyStatus = screen.getByText('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย');
  expect(copyStatus.getAttribute('role')).toBe('status');
  expect(copyStatus.classList.contains('sr-only')).toBe(true);
  expect(copyStatus.parentElement?.classList.contains('share-bar')).toBe(true);
  expect(document.querySelector('.share-status')?.textContent).toBe('');

  act(() => vi.advanceTimersByTime(1_999));
  expect(screen.getByRole('button', { name: 'คัดลอกแล้ว' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('button', { name: 'ชวนเพื่อน' })).toBeTruthy();
});

test('successful clipboard retry clears a stale fallback', async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValueOnce(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  await screen.findByRole('textbox', { name: 'ลิงก์เข้าห้อง' });
  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));

  await screen.findByRole('button', { name: 'คัดลอกแล้ว' });
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'ลิงก์เข้าห้อง' })).toBeNull(),
  );
  expect(writeText).toHaveBeenCalledTimes(2);
});

test('repeated clipboard failure refocuses and selects the existing fallback', async () => {
  let rejectRetry!: (reason: Error) => void;
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectRetry = reject;
        }),
    );
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  const fallback = await screen.findByRole<HTMLInputElement>('textbox', {
    name: 'ลิงก์เข้าห้อง',
  });
  const invite = screen.getByRole('button', { name: 'ชวนเพื่อน' });
  invite.focus();
  fireEvent.click(invite);

  expect(document.activeElement).toBe(invite);
  await act(async () => rejectRetry(new Error('denied again')));
  expect(document.activeElement).toBe(fallback);
  expect(fallback.selectionStart).toBe(0);
  expect(fallback.selectionEnd).toBe(fallback.value.length);
  expect(writeText).toHaveBeenCalledTimes(2);
});

test('a stale clipboard success cannot replace a newer failure', async () => {
  let resolveFirstCopy!: () => void;
  const writeText = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstCopy = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('denied'));
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Room room={room()} disabled={false} send={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  const fallback = await screen.findByRole('textbox', {
    name: 'ลิงก์เข้าห้อง',
  });

  await act(async () => resolveFirstCopy());

  expect(document.activeElement).toBe(fallback);
  expect(screen.getByRole('button', { name: 'ชวนเพื่อน' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'คัดลอกแล้ว' })).toBeNull();
});

test('unmounting clears a pending clipboard confirmation reset', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const view = render(<Room room={room()} disabled={false} send={vi.fn()} />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'ชวนเพื่อน' }));
  });
  expect(vi.getTimerCount()).toBe(1);

  view.unmount();

  expect(vi.getTimerCount()).toBe(0);
});

test('Home distinguishes connection and pending action states', () => {
  const commonProps = {
    send: vi.fn().mockResolvedValue(true),
    disabled: true,
    showRules: vi.fn(),
  };
  const disconnected = render(<Home {...commonProps} pending={false} />);
  expect(screen.getByRole('button', { name: 'กำลังเชื่อมต่อ…' })).toBeTruthy();
  disconnected.unmount();

  const creating = render(<Home {...commonProps} pending />);
  expect(screen.getByRole('button', { name: 'กำลังสร้างห้อง…' })).toBeTruthy();
  creating.unmount();

  window.history.replaceState({}, '', '/?room=ABC234');
  render(<Home {...commonProps} pending />);
  expect(screen.getByRole('button', { name: 'กำลังเข้าห้อง…' })).toBeTruthy();
});

test('Home freezes the submitted form while a request is pending', () => {
  const view = render(
    <Home send={vi.fn()} disabled pending showRules={vi.fn()} />,
  );

  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: /^สร้างห้อง$/,
    }).disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เข้าห้องเพื่อน' })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'ชื่อเล่น' })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก').disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'แสดง PIN' })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เลือกอวาตาร์ 🦊' })
      .disabled,
  ).toBe(true);

  view.rerender(
    <Home send={vi.fn()} disabled pending={false} showRules={vi.fn()} />,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'เข้าห้องเพื่อน' })
      .disabled,
  ).toBe(false);
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'ชื่อเล่น' })
      .disabled,
  ).toBe(false);
  expect(
    screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก').disabled,
  ).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'เข้าห้องเพื่อน' }));
  view.rerender(<Home send={vi.fn()} disabled pending showRules={vi.fn()} />);
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'รหัสห้อง 6 ตัว' })
      .disabled,
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'กำลังเข้าห้อง…' })).toBeTruthy();
});
