import { makeAutoObservable } from "mobx";

export type ConnectionPhase = "connected" | "reconnecting" | "failed";

/**
 * Observable websocket connection state. The websocket service writes to it; a
 * single reactive toast reads it, so the notification updates in place across the
 * disconnect → retry → reconnect cycle instead of stacking new toasts.
 */
class ConnectionStatus {
  phase: ConnectionPhase = "connected";
  attempt = 0;
  maxRetries = 0;

  constructor() {
    makeAutoObservable(this);
  }

  markConnected(): void {
    this.phase = "connected";
    this.attempt = 0;
  }

  markReconnecting(attempt: number, maxRetries: number): void {
    this.phase = "reconnecting";
    this.attempt = attempt;
    this.maxRetries = maxRetries;
  }

  markFailed(): void {
    this.phase = "failed";
  }
}

export const connectionStatus = new ConnectionStatus();
