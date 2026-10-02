import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';

afterEach(cleanup);

test('only an explicit submit button submits its enclosing form', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const secondaryAction = vi.fn();
  render(
    <form onSubmit={submit}>
      <Button variant="secondary" onClick={secondaryAction}>
        Preview
      </Button>
      <Button type="submit">Confirm</Button>
    </form>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(secondaryAction).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(submit).toHaveBeenCalledOnce();
});

test('disabled buttons preserve native click prevention and accessible state', () => {
  const click = vi.fn();
  render(
    <Button variant="danger" disabled aria-busy onClick={click}>
      Leaving
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Leaving' });
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
  expect(button.getAttribute('aria-busy')).toBe('true');
});

test('icon buttons expose their accessible name and native ref for focus restoration', () => {
  const ref = createRef<HTMLButtonElement>();
  render(
    <IconButton ref={ref} aria-label="Close" className="modal-close">
      <span aria-hidden="true">×</span>
    </IconButton>,
  );

  const button = screen.getByRole('button', { name: 'Close' });
  ref.current?.focus();
  expect(document.activeElement).toBe(button);
  expect(ref.current).toBe(button);
});
