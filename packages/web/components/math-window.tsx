'use client';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

let scrollLocks = 0;
let originalOverflow = '';
let originalOverflowPriority = '';

type Props = {
  open: boolean;
  kind: 'practice' | 'export' | 'explanation';
  title: string;
  eyebrow: string;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export default function MathWindow({
  open,
  kind,
  title,
  eyebrow,
  closeLabel,
  onClose,
  actions,
  returnFocusRef,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (scrollLocks++ === 0) {
      originalOverflow = document.body.style.getPropertyValue('overflow');
      originalOverflowPriority = document.body.style.getPropertyPriority('overflow');
      document.body.style.setProperty('overflow', 'hidden');
    }
    const returnTarget = returnFocusRef?.current;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      if (--scrollLocks === 0) {
        if (originalOverflow)
          document.body.style.setProperty('overflow', originalOverflow, originalOverflowPriority);
        else document.body.style.removeProperty('overflow');
      }
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true });
      bodyRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, kind]);

  return (
    <dialog
      ref={ref}
      className={`math-window math-window-${kind}`}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPressed.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (!backdropPressed.current || event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <header className="math-window-header">
        <div>
          <p>{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="math-window-header-actions">
          {actions}
          <button
            type="button"
            className="math-window-close"
            ref={closeRef}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="math-window-body" ref={bodyRef}>
        {children}
      </div>
    </dialog>
  );
}
