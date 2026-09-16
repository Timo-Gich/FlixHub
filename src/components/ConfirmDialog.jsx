import { useEffect, useRef } from 'react';

/**
 * A lightweight, theme-matched confirmation modal (replaces window.confirm).
 *
 * Props:
 *   - open         : whether the dialog is visible
 *   - title        : heading text
 *   - message      : body text (ReactNode allowed)
 *   - confirmLabel : text for the confirm button (default "Confirm")
 *   - cancelLabel  : text for the cancel button (default "Cancel")
 *   - danger       : true → confirm button is the red (brand) destructive style
 *   - onConfirm    : () => void — fires when the confirm action is chosen
 *   - onClose      : () => void — fires on cancel, backdrop click, or Esc
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onClose,
}) {
  const cancelRef = useRef(null);

  // Close on Escape; move focus to Cancel when opened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />

      {/* Dialog card */}
      <div
        className="relative w-full max-w-md rounded-lg border border-ink-border bg-ink-soft
                   p-6 shadow-2xl"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-black tracking-tight text-white"
        >
          {title}
        </h2>

        {message && (
          <p
            id="confirm-dialog-message"
            className="mt-2 text-sm leading-relaxed text-muted"
          >
            {message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            ref={cancelRef}
            onClick={onClose}
            className="rounded-md bg-ink-raised px-4 py-2.5 text-sm font-semibold text-white
                       ring-1 ring-ink-border transition hover:bg-zinc-800 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-brand"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`rounded-md px-4 py-2.5 text-sm font-bold text-white transition
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                       active:scale-[0.98] ${
                         danger
                           ? 'bg-brand hover:bg-brand-dark shadow-md shadow-brand/30'
                           : 'bg-ink-raised ring-1 ring-ink-border hover:bg-zinc-800'
                       }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}