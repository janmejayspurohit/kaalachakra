import React, { useCallback, useEffect, useId, useRef } from 'react';

/**
 * In-app modal dialog.
 *
 * Replaces `window.confirm`, for the same reason `<input type="date">` was
 * replaced in DateField: the browser's own dialog is drawn by the OS, ignores
 * the theme entirely, and announces itself as "localhost:5173 says" - which
 * reads as a page misbehaving rather than as part of the application. It is
 * also outside our control in ways that matter: a browser that has been told
 * to block further dialogs makes `confirm()` return false silently, and the
 * action then fails with no explanation.
 *
 * What a real dialog has to do, beyond looking right:
 *   - take focus when it opens, and give it back to whatever opened it;
 *   - keep Tab inside it, so the page behind is not reachable while it is up;
 *   - close on Escape and on a click outside;
 *   - stop the page behind from scrolling.
 * A div with a shadow does none of that.
 */
export function Modal({ open, onClose, title, children, footer, labelledBy }) {
  const cardRef = useRef(null);
  const restoreTo = useRef(null);
  const autoId = useId();
  const titleId = labelledBy ?? `${autoId}-title`;

  // Remember what had focus, so it can be handed back on close. Without this
  // a keyboard user is dropped at the top of the document every time.
  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement;
    return () => {
      const el = restoreTo.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, [open]);

  // Focus the first control in the dialog. For a destructive confirmation the
  // first control is the cancelling one, so Return does the safe thing.
  useEffect(() => {
    if (!open) return;
    const first = cardRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (first ?? cardRef.current)?.focus();
  }, [open]);

  // Escape closes; Tab cycles within the dialog rather than escaping to the
  // page behind it.
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  // The page behind must not scroll under the dialog. The previous value is
  // restored rather than blanked, so a nested or reopened dialog cannot leave
  // the document permanently unscrollable.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={cardRef}
        className="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {title && <h3 id={titleId} className="modal-title">{title}</h3>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for an action that cannot be undone.
 *
 * Cancel is listed FIRST so it takes initial focus: on a destructive prompt
 * the keyboard default should be the harmless answer.
 */
export function ConfirmDialog({
  open, onCancel, onConfirm, title, children,
  confirmLabel = 'Delete', cancelLabel = 'Cancel', busy = false, destructive = true,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export default Modal;
