import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../app/App';
import { resources } from './resources';

class FakeWebSocket {
  static OPEN = 1;
  static latest: FakeWebSocket;
  readyState = 0;
  requests: { id: string }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    FakeWebSocket.latest = this;
  }

  send(data: string) {
    this.requests.push(JSON.parse(data) as { id: string });
  }

  close() {
    this.readyState = 3;
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

test('errors retain metadata from the socket through the live App alert and locale changes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: 'th',
    resources: {
      ...resources,
      en: {
        translation: {
          messages: {
            TEXT_LENGTH_OUT_OF_RANGE:
              'Maximum {{max}} characters; minimum {{min}}',
            SERVER_MESSAGE_INVALID: 'Invalid server response',
            REQUEST_TIMED_OUT: 'Check the game before trying again',
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  render(
    <I18nextProvider i18n={instance}>
      <App />
    </I18nextProvider>,
  );
  const socket = FakeWebSocket.latest;
  act(() => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.();
  });
  const nickname = screen.getByRole('textbox', { name: 'ชื่อเล่น' });
  const pin = document.getElementById('room-pin') as HTMLInputElement;
  fireEvent.change(nickname, { target: { value: 'Player' } });
  fireEvent.change(pin, { target: { value: '012345' } });
  const form = nickname.closest('form')!;
  fireEvent.submit(form);
  expect(socket.requests).toHaveLength(1);
  await act(async () => {
    socket.receive({
      type: 'reply',
      id: socket.requests[0].id,
      reply: {
        ok: false,
        code: 'GAME',
        error: 'ข้อความต้องมี 1–20 ตัวอักษร',
        messageId: 'TEXT_LENGTH_OUT_OF_RANGE',
        messageParams: { min: 1, max: 20 },
      },
    });
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Maximum 20 characters; minimum 1',
  );
  expect(document.activeElement).toBe(screen.getByRole('alert'));
  expect((nickname as HTMLInputElement).value).toBe('Player');
  expect(pin.value).toBe('012345');
  await act(() => instance.changeLanguage('th'));
  expect(screen.getByRole('alert').textContent).toContain(
    'ข้อความต้องมี 1–20 ตัวอักษร',
  );
  await act(() => instance.changeLanguage('en'));
  expect(screen.getByRole('alert').textContent).toContain(
    'Maximum 20 characters; minimum 1',
  );
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.submit(form);
  expect(socket.requests).toHaveLength(2);
  act(() => socket.onmessage?.({ data: '{' }));
  expect(screen.getByRole('alert').textContent).toContain(
    'Invalid server response',
  );
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByRole('alert').textContent).toContain(
    'Check the game before trying again',
  );
  expect(
    screen
      .getByRole('button', { name: 'กำลังสร้างห้อง…' })
      .hasAttribute('disabled'),
  ).toBe(true);
  await act(async () => {
    socket.receive({
      type: 'reply',
      id: socket.requests[1].id,
      reply: {
        ok: false,
        code: 'GAME',
        error: 'Future server error',
        messageId: 'FUTURE_SERVER_ERROR',
      },
    });
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Future server error',
  );
  expect(
    within(form)
      .getByRole('button', { name: 'สร้างห้อง' })
      .hasAttribute('disabled'),
  ).toBe(false);
});
