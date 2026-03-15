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
