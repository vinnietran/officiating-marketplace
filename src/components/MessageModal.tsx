import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/Button";

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
  autoCloseMs?: number;
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
  cancelDisabled = false,
  autoCloseMs
}: MessageModalProps) {
  const isToast = Boolean(autoCloseMs && !onConfirm);

  useEffect(() => {
    if (!isToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onClose();
    }, Math.max(autoCloseMs ?? 0, 2800));

    return () => window.clearTimeout(timeoutId);
  }, [autoCloseMs, isToast, onClose]);

  if (isToast) {
    return (
      <div className="toast-notice" role="status" aria-live="polite">
        <div className="toast-notice-card">
          <div className="toast-notice-icon" aria-hidden="true">
            <CheckCircle2 />
          </div>
          <div className="toast-notice-copy">
            <strong className="toast-notice-title">{title}</strong>
            <p className="toast-notice-message">{message}</p>
          </div>
          <button
            type="button"
            className="toast-notice-dismiss"
            onClick={onClose}
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <Dialog.Title className="modal-title">{title}</Dialog.Title>
          <Dialog.Description className="modal-description">{message}</Dialog.Description>
          <div className="modal-actions">
            {onConfirm ? (
              <>
                <Button type="button" variant="secondary" onClick={onClose} disabled={cancelDisabled}>
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant={confirmTone === "danger" ? "danger" : "primary"}
                  onClick={onConfirm}
                  disabled={confirmDisabled}
                >
                  {confirmLabel}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={onClose}>
                OK
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
