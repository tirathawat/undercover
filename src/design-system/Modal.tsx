import { X } from 'lucide-react';
import { useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export function Modal({
  title,
  children,
  close,
  closeLabel,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  closeLabel: string;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    heading.current?.focus();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useLayoutEffect(() => {
    if (busy) heading.current?.focus();
  }, [busy]);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 ref={heading} id={titleId} tabIndex={-1}>
        {title}
      </h2>
      <IconButton
        className="modal-close"
        aria-label={closeLabel}
        disabled={busy}
        onClick={close}
      >
        <X size={20} />
      </IconButton>
      {children}
    </dialog>
  );
}
