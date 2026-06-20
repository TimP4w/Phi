import { useEffect, useRef } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { toast } from "@heroui/react";
import { connectionStatus } from "../../../core/realtime/connectionStatus";

// Reactive toast body: re-renders in place as the retry count climbs, so the
// single persistent toast updates instead of a new one being pushed each attempt.
const ConnectionToastContent = observer(() => {
  const { attempt, maxRetries } = connectionStatus;
  return (
    <span>
      Connection lost — reconnecting…
      {attempt > 0 && ` (attempt ${attempt}/${maxRetries})`}
    </span>
  );
});

/**
 * Drives a single websocket-connection toast off `connectionStatus`. While
 * reconnecting, one persistent (timeout 0) toast stays up and its content updates
 * live; it's closed and replaced by a terminal success/failure toast on resolve.
 */
export default function ConnectionToastManager() {
  const idRef = useRef<string | null>(null);

  useEffect(
    () =>
      reaction(
        () => connectionStatus.phase,
        (phase) => {
          if (phase === "reconnecting") {
            idRef.current ??= toast(<ConnectionToastContent />, {
              isLoading: true,
              timeout: 0,
            });
            return;
          }
          if (idRef.current != null) {
            toast.close(idRef.current);
            idRef.current = null;
            if (phase === "connected") toast.success("Reconnected");
          }
          if (phase === "failed") {
            toast.danger("Connection lost — couldn't reconnect.");
          }
        },
      ),
    [],
  );

  return null;
}
