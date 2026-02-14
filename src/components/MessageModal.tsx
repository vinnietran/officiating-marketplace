interface MessageModalProps {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
}

export function MessageModal({
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "primary",
  confirmDisabled = false,
  cancelDisabled = false
}: MessageModalProps) {
  const confirmClassName = confirmTone === "danger" ? "button-danger" : undefined;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="modal-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          {onConfirm ? (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={onClose}
                disabled={cancelDisabled}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={confirmClassName}
                onClick={onConfirm}
                disabled={confirmDisabled}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
