import React from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
} from "@heroui/react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { ROUTES } from "../../routes/routes.enum";

type Props = {
  event: KubeEvent | null;
  isOpen: boolean;
  onClose: () => void;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
    <span className="text-sm break-words">{children}</span>
  </div>
);

const EventDetailModal: React.FC<Props> = ({ event, isOpen, onClose }) => {
  const navigate = useNavigate();

  if (!event) return null;

  const isWarning = event.type === "Warning";

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
          <ModalHeader className="flex flex-col items-center gap-2">
            <div className="flex flex-row items-center gap-2">
              <div
                className={`w-2 h-2 shrink-0 rounded-full ${
                  isWarning ? "bg-warning" : "bg-accent"
                }`}
              />
              <span className="truncate">{event.reason}</span>
            </div>
            <Chip
              size="sm"
              variant="soft"
              color={isWarning ? "warning" : "default"}
            >
              {event.type}
            </Chip>
          </ModalHeader>
          <ModalBody className="gap-4">
            <Field label="Message">{event.message}</Field>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <Field label="Object">
                {event.kind}/{event.name}
              </Field>
              <Field label="Namespace">{event.namespace || "—"}</Field>
              <Field label="Source">{event.source || "—"}</Field>
              <Field label="Count">{event.count}</Field>
              <Field label="First seen">
                {format(event.firstObserved, "yyyy-MM-dd HH:mm:ss")}
              </Field>
              <Field label="Last seen">
                {format(event.lastObserved, "yyyy-MM-dd HH:mm:ss")}
              </Field>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="sm" onPress={onClose}>
              Close
            </Button>
            {event.resourceUID && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => {
                  navigate(`${ROUTES.RESOURCE}/${event.resourceUID}`);
                  onClose();
                }}
              >
                Go to resource
              </Button>
            )}
          </ModalFooter>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};

export default EventDetailModal;
