import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useAsyncConfirmation } from './use-async-confirmation';

afterEach(cleanup);

test('a confirmation stays busy until its action completes successfully', async () => {
  let finish!: (success: boolean) => void;
  const action = vi.fn<(targetId: string) => Promise<boolean>>(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const onSuccess = vi.fn();
  const { result } = renderHook(() => useAsyncConfirmation(action, onSuccess));
  let confirmation!: Promise<void>;

  act(() => {
    confirmation = result.current.confirm('b');
  });

  expect(action).toHaveBeenCalledWith('b');
  expect(result.current.submitting).toBe(true);
  expect(result.current.submissionError).toBe(false);
  expect(onSuccess).not.toHaveBeenCalled();

  await act(async () => {
    finish(true);
    await confirmation;
  });

  expect(result.current.submitting).toBe(false);
  expect(result.current.submissionError).toBe(false);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test('a failed confirmation can clear its error and retry successfully', async () => {
  const action = vi
    .fn<() => Promise<boolean>>()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const onSuccess = vi.fn();
  const { result } = renderHook(() => useAsyncConfirmation(action, onSuccess));

  await act(async () => {
    await result.current.confirm();
  });

  expect(result.current.submitting).toBe(false);
  expect(result.current.submissionError).toBe(true);
  expect(onSuccess).not.toHaveBeenCalled();

  act(() => result.current.clearSubmissionError());
  expect(result.current.submissionError).toBe(false);

  await act(async () => {
    await result.current.confirm();
  });

  expect(action).toHaveBeenCalledTimes(2);
  expect(result.current.submitting).toBe(false);
  expect(result.current.submissionError).toBe(false);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test('a confirmation uses the current action and success callback after rerender', async () => {
  const firstAction = vi
    .fn<(targetId: string) => Promise<boolean>>()
    .mockResolvedValue(true);
  const nextAction = vi
    .fn<(targetId: string) => Promise<boolean>>()
    .mockResolvedValue(true);
  const firstSuccess = vi.fn();
  const nextSuccess = vi.fn();
  const { result, rerender } = renderHook(
    ({ action, onSuccess }) => useAsyncConfirmation(action, onSuccess),
    { initialProps: { action: firstAction, onSuccess: firstSuccess } },
  );

  rerender({ action: nextAction, onSuccess: nextSuccess });
  await act(async () => {
    await result.current.confirm('c');
  });

  expect(nextAction).toHaveBeenCalledWith('c');
  expect(nextSuccess).toHaveBeenCalledTimes(1);
  expect(firstAction).not.toHaveBeenCalled();
  expect(firstSuccess).not.toHaveBeenCalled();
});

test('separate confirmations keep their busy and error state independent', async () => {
  let finish!: (success: boolean) => void;
  const leave = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const remove = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const onSuccess = vi.fn();
  const { result } = renderHook(() => ({
    leave: useAsyncConfirmation(leave, onSuccess),
    remove: useAsyncConfirmation(remove, onSuccess),
  }));
  let confirmation!: Promise<void>;

  act(() => {
    confirmation = result.current.leave.confirm();
  });

  expect(result.current.leave.submitting).toBe(true);
  expect(result.current.remove.submitting).toBe(false);

  await act(async () => {
    finish(false);
    await confirmation;
  });

  expect(result.current.leave.submissionError).toBe(true);
  expect(result.current.remove.submissionError).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});

test('a rejected confirmation releases busy state and preserves the rejection', async () => {
  const failure = new Error('unavailable');
  const action = vi.fn<() => Promise<boolean>>().mockRejectedValue(failure);
  const onSuccess = vi.fn();
  const { result } = renderHook(() => useAsyncConfirmation(action, onSuccess));

  await act(async () => {
    await expect(result.current.confirm()).rejects.toBe(failure);
  });

  expect(result.current.submitting).toBe(false);
  expect(result.current.submissionError).toBe(false);
  expect(onSuccess).not.toHaveBeenCalled();
});
