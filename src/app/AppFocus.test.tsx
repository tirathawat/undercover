import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';

const mockUseGame = vi.hoisted(() => vi.fn());

vi.mock('../game/use-game', () => ({ useGame: mockUseGame }));

afterEach(() => {
  cleanup();
  mockUseGame.mockReset();
});

function gameState(restoring = false) {
  return {
    connected: true,
    pending: false,
    restoring,
    room: null,
    error: null,
    send: vi.fn().mockResolvedValue(true),
    clearError: vi.fn(),
  };
}

test('keeps focus unchanged on the initial page', () => {
  mockUseGame.mockReturnValue(gameState());

  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  expect(document.activeElement).toBe(document.body);
});

test('focuses the destination heading after a page change', async () => {
  mockUseGame.mockReturnValue(gameState());
  const view = render(<App />);
  screen.getByRole('textbox', { name: 'ชื่อเล่น' }).focus();

  mockUseGame.mockReturnValue(gameState(true));
  view.rerender(<App />);

  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', {
        level: 1,
        name: 'กำลังกลับเข้าวงเดิม',
      }),
    ),
  );
});
