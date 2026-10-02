import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { RoomView } from '../../../shared/game';
import { Room } from './Room';

afterEach(cleanup);

function revealingRoom(): RoomView {
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
  };
}

test('a revealed word is concealed and rendered once after the last ready advances to clues', () => {
  const room = revealingRoom();
  const send = vi.fn().mockResolvedValue(true);
  const { rerender } = render(
    <Room room={room} disabled={false} send={send} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'ดูคำลับ' }));
  expect(screen.getByText('หมูกระทะ')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'จำคำแล้ว พร้อมเล่น' }));
  expect(send).toHaveBeenCalledWith({ type: 'ready', stageId: room.stageId });
  rerender(
    <Room
      room={{
        ...room,
        phase: 'clue',
        stageId: 'clue-1',
        round: 1,
        speakerId: 'a',
      }}
      disabled={false}
      send={send}
    />,
  );
  expect(screen.getAllByRole('region', { name: 'คำลับส่วนตัว' })).toHaveLength(
    1,
  );
  expect(screen.queryByText('หมูกระทะ')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'คำใบ้ของคุณ' })).toBeTruthy();
  rerender(
    <Room
      room={{
        ...room,
        phase: 'vote',
        stageId: 'vote-1',
        round: 1,
        voteCandidates: ['a', 'b', 'c'],
      }}
      disabled={false}
      send={send}
    />,
  );
  expect(screen.getAllByRole('region', { name: 'คำลับส่วนตัว' })).toHaveLength(
    1,
  );
  expect(screen.queryByText('หมูกระทะ')).toBeNull();
});

test('returning from clue history requires revealing the private word again', () => {
  render(<Room room={revealingRoom()} disabled={false} send={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'ดูคำลับ' }));
  fireEvent.click(screen.getByRole('button', { name: 'คำใบ้' }));
  expect(screen.queryByText('หมูกระทะ')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'เกม' }));
  expect(screen.queryByText('หมูกระทะ')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'ดูคำลับ' })).toHaveLength(1);
});

test('switching away from the browser conceals the word', () => {
  render(<Room room={revealingRoom()} disabled={false} send={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'ดูคำลับ' }));
  fireEvent(window, new Event('blur'));
  expect(screen.queryByText('หมูกระทะ')).toBeNull();
});

test('removing a future speaker preserves the current clue draft and focus', () => {
  const room: RoomView = {
    ...revealingRoom(),
    phase: 'clue',
    stageId: 'clue-1',
    round: 1,
    speakerId: 'a',
  };
  const send = vi.fn();
  const { rerender } = render(
    <Room room={room} disabled={false} send={send} />,
  );
  const input = screen.getByRole('textbox', { name: 'คำใบ้ของคุณ' });
  input.focus();
  fireEvent.change(input, { target: { value: 'คำใบ้ที่กำลังพิมพ์' } });
  rerender(
    <Room
      room={{
        ...room,
        players: room.players.map((player) =>
          player.id === 'c'
            ? { ...player, alive: false, connected: false }
            : player,
        ),
      }}
      disabled={false}
      send={send}
    />,
  );
  expect(screen.getByRole('textbox', { name: 'คำใบ้ของคุณ' })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('คำใบ้ที่กำลังพิมพ์');
  expect(document.activeElement).toBe(input);
});
