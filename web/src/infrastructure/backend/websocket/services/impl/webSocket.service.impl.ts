import { injectable } from "inversify";
import { Message } from "../../../../../core/realtime/models/message";
import { REALTIME_CONST } from "../../../../../core/realtime/constants/realtime.const";
import { env } from "../../../../../core/shared/env";
import { WebSocketService } from "../../../../../core/realtime/services/webSocket.service";
import { addToast } from "@heroui/react";

export type Listener = {
  id: string;
  handle: (data: Message) => void;
};

@injectable()
class WebSocketServiceImpl implements WebSocketService {
  url: string;
  socket: WebSocket | null = null;
  listeners: Set<Listener>;
  retryCount = 0;
  maxRetries = 10;
  pingInterval: NodeJS.Timeout | null = null;
  clientId: string = "";

  constructor() {
    console.log("Loading WebSocketService");
    this.url = env.WS_URL;
    this.listeners = new Set();
  }

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  removeListener(id: string) {
    for (const listener of this.listeners) {
      if (listener.id === id) {
        this.listeners.delete(listener);
        break;
      }
    }
  }

  connect(): void {
    console.log(`Connecting websocket to ${this.url}`);
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      console.log("Websocket connection opened");
      addToast({
        title: "Websocket connection opened",
        color: "success",
      });
      this.retryCount = 0;
      this.startPing();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      const message: Message = JSON.parse(event.data);
      switch (message.type) {
        case REALTIME_CONST.PONG:
          break;
        case REALTIME_CONST.CONNECTED:
          this.clientId = message.clientId ?? "";
          console.log(`Connected with clientId: ${this.clientId}`);
          break;
        default:
          this.handleMessage(message);
      }
    };

    this.socket.onclose = () => {
      addToast({
        title: "WebSocket connection closed",
        color: "danger",
      });

      this.clientId = "";
      this.stopPing();
      this.reconnect();
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  startPing(): void {
    this.pingInterval = setInterval(() => {
      if (!this.socket) {
        console.error("Socket is not open");
        return;
      }
      if (this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: REALTIME_CONST.PING,
          clientId: "",
          message: "ping",
        });
      }
    }, 5000);
  }

  reconnect() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const retryTimeout = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
      setTimeout(() => {
        console.log(`Reconnection attempt #${this.retryCount}`);
        addToast({
          title: `Reconnection attempt #${this.retryCount}`,
          color: "default",
        });

        this.connect();
      }, retryTimeout);
    } else {
      addToast({
        title: `Max reconnection attempts reached.`,
        color: "danger",
      });
      console.log("Max reconnection attempts reached.");
    }
  }

  stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  handleMessage(data: Message): void {
    for (const listener of this.listeners) {
      listener.handle(data);
    }
  }

  sendMessage(message: Message): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      message.clientId = this.clientId;
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not open");
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }
}

export { WebSocketServiceImpl };
