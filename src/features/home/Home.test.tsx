import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Home } from './Home';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function renderHome(
  overrides: Partial<React.ComponentProps<typeof Home>> = {},
) {
  const props = {
    send: vi.fn().mockResolvedValue(true),
    disabled: false,
    pending: false,
    showRules: vi.fn(),
    ...overrides,
  };
  return { ...render(<Home {...props} />), props };
}

test('submits a leading-zero PIN when creating a room', async () => {
  const { props } = renderHome();

  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: '  มะลิ  ' },
  });
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '012345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'เลือกอวาตาร์ 🐼' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'สร้างห้อง' }).at(-1)!);

  await waitFor(() =>
    expect(props.send).toHaveBeenCalledExactlyOnceWith({
      type: 'create',
      name: 'มะลิ',
      avatar: 5,
      pin: '012345',
    }),
  );
});

test('recovery keeps room details, hides avatars, and restores focus on return', async () => {
  const { props } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: 'เข้าห้องเพื่อน' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: ' บัว ' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'รหัสห้อง 6 ตัว' }), {
    target: { value: 'abc234' },
  });
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '111111' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'กลับเข้าห้องเดิม' }));

  const recoveryHeading = screen.getByRole('heading', {
    level: 2,
    name: 'กลับเข้าห้องเดิม',
  });
  expect(document.activeElement).toBe(recoveryHeading);
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'ชื่อเล่น' }).value,
  ).toBe(' บัว ');
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'รหัสห้อง 6 ตัว' })
      .value,
  ).toBe('ABC234');
  expect(screen.getByLabelText<HTMLInputElement>('PIN 6 หลัก').value).toBe('');
  expect(screen.queryByRole('group', { name: 'เลือกตัวแทนของคุณ' })).toBeNull();

  fireEvent.change(screen.getByLabelText('PIN 6 หลัก'), {
    target: { value: '012345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'กลับเข้าห้องเดิม' }));

  await waitFor(() =>
    expect(props.send).toHaveBeenCalledExactlyOnceWith({
      type: 'recover',
      code: 'ABC234',
      name: 'บัว',
      pin: '012345',
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: 'เข้าเล่นครั้งแรก' }));
  const recoveryTrigger = screen.getByRole('button', {
    name: 'กลับเข้าห้องเดิม',
  });
  expect(document.activeElement).toBe(recoveryTrigger);
  expect(screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก').value).toBe(
    '',
  );
  expect(screen.getByRole('group', { name: 'เลือกตัวแทนของคุณ' })).toBeTruthy();
});

test('shows and focuses an inline error when PIN is malformed', async () => {
  const { props } = renderHome();
  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: 'มะลิ' },
  });
  const pin = screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก');
  fireEvent.change(pin, { target: { value: '12ab' } });

  fireEvent.submit(pin.form!);

  const error = screen.getByRole('alert');
  expect(error.textContent).toBe('กรอก PIN เป็นตัวเลข 6 หลัก');
  expect(pin.getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(pin));
  expect(props.send).not.toHaveBeenCalled();
});

test('PIN visibility control has an accessible changing label', () => {
  renderHome();
  const pin = screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก');
  expect(pin.type).toBe('password');
  expect(pin.inputMode).toBe('numeric');
  expect(pin.maxLength).toBe(6);
  expect(pin.pattern).toBe('[0-9]{6}');
  expect(pin.getAttribute('aria-describedby')).toBe('pin-help');
  expect(
    screen.getByText('จำ PIN นี้ไว้ใช้กลับเข้าห้อง และไม่ควรใช้รหัสผ่านสำคัญ'),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'แสดง PIN' }));
  expect(pin.type).toBe('text');
  expect(screen.getByRole('button', { name: 'ซ่อน PIN' })).toBeTruthy();
});

test('switching primary intent clears PIN but preserves shared fields', () => {
  renderHome();
  fireEvent.change(screen.getByRole('textbox', { name: 'ชื่อเล่น' }), {
    target: { value: 'มะลิ' },
  });
  fireEvent.change(screen.getByLabelText('ตั้ง PIN 6 หลัก'), {
    target: { value: '123456' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'เข้าห้องเพื่อน' }));

  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'ชื่อเล่น' }).value,
  ).toBe('มะลิ');
  expect(screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก').value).toBe(
    '',
  );
});

test('offline fields stay editable while submission stays blocked', () => {
  const { props } = renderHome({ disabled: true });
  const name = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'ชื่อเล่น',
  });
  const pin = screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก');

  fireEvent.change(name, { target: { value: 'มะลิ' } });
  fireEvent.change(pin, { target: { value: '123456' } });

  expect(name.disabled).toBe(false);
  expect(pin.disabled).toBe(false);
  expect(name.value).toBe('มะลิ');
  expect(pin.value).toBe('123456');
  fireEvent.click(screen.getByRole('button', { name: 'กำลังเชื่อมต่อ…' }));
  expect(props.send).not.toHaveBeenCalled();
});

test('an in-flight submission freezes the form and blocks duplicates', async () => {
  let finishRequest!: (sent: boolean) => void;
  const send = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finishRequest = resolve;
      }),
  );
  renderHome({ send });
  const name = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'ชื่อเล่น',
  });
  const pin = screen.getByLabelText<HTMLInputElement>('ตั้ง PIN 6 หลัก');
  fireEvent.change(name, { target: { value: 'มะลิ' } });
  fireEvent.change(pin, { target: { value: '123456' } });

  fireEvent.submit(pin.form!);
  fireEvent.submit(pin.form!);

  expect(send).toHaveBeenCalledOnce();
  expect(name.disabled).toBe(true);
  expect(pin.disabled).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'แสดง PIN' })
      .disabled,
  ).toBe(true);

  finishRequest(false);
  await waitFor(() => expect(name.disabled).toBe(false));
});

test('a failed recovery remains editable and preserves every entry', async () => {
  const send = vi.fn().mockResolvedValue(false);
  renderHome({ send });
  fireEvent.click(screen.getByRole('button', { name: 'เข้าห้องเพื่อน' }));
  fireEvent.click(screen.getByRole('button', { name: 'กลับเข้าห้องเดิม' }));
  const name = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'ชื่อเล่น',
  });
  const code = screen.getByRole<HTMLInputElement>('textbox', {
    name: 'รหัสห้อง 6 ตัว',
  });
  const pin = screen.getByLabelText<HTMLInputElement>('PIN 6 หลัก');
  fireEvent.change(name, { target: { value: 'มะลิ' } });
  fireEvent.change(code, { target: { value: 'abc234' } });
  fireEvent.change(pin, { target: { value: '012345' } });

  fireEvent.click(screen.getByRole('button', { name: 'กลับเข้าห้องเดิม' }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());

  expect(name.disabled).toBe(false);
  expect(code.disabled).toBe(false);
  expect(pin.disabled).toBe(false);
  expect(name.value).toBe('มะลิ');
  expect(code.value).toBe('ABC234');
  expect(pin.value).toBe('012345');
});
