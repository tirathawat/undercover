import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('moves native initial dialog focus from the close button to its heading', () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('button')?.focus();
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      }),
    },
  });

  render(
    <Modal title="Rules" closeLabel="Close" close={vi.fn()}>
      <p>How to play</p>
    </Modal>,
  );

  const heading = screen.getByRole('heading', { level: 2, name: 'Rules' });
  expect(document.activeElement).toBe(heading);
  expect(heading.getAttribute('tabindex')).toBe('-1');
  expect(screen.getByRole('dialog', { name: 'Rules' })).toBeTruthy();
});
