'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { ProviderIcon } from './provider-icon';

export function ProviderDialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const reference = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = reference.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="provider-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={reference}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button aria-label="Đóng" onClick={onClose} type="button">
          <ProviderIcon name="plus" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
