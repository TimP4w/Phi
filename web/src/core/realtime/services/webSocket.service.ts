import { Listener } from "../../../infrastructure/backend/websocket/services/impl/webSocket.service.impl";
import { Message } from "../models/message";

export interface WebSocketService {
  connect(): void;
  sendMessage(message: Message): void;
  disconnect(): void;
  addListener(listener: Listener): void;
  removeListener(id: string): void;
}
