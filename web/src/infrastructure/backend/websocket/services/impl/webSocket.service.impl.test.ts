import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const addToast = vi.fn();
vi.mock("@heroui/react", () => ({ addToast: (...a: unknown[]) => addToast(...a) }));

import { WebSocketServiceImpl } from "./webSocket.service.impl";
import { REALTIME_CONST } from "../../../../../core/realtime/constants/realtime.const";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.onclose?.(); }
}

describe("WebSocketServiceImpl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addToast.mockReset();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const connected = () => {
    const svc = new WebSocketServiceImpl();
    svc.connect();
    const ws = MockWebSocket.instances.at(-1)!;
    ws.onopen?.();
    return { svc, ws };
  };

  it("opens a socket and toasts on open", () => {
    const { ws } = connected();
    expect(ws).toBeDefined();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ color: "success" }));
  });

  it("dispatches non-control messages to listeners", () => {
    const { svc, ws } = connected();
    const handle = vi.fn();
    svc.addListener({ id: "l1", handle });
    ws.onmessage?.({ data: JSON.stringify({ type: "RESOURCE", message: "x" }) } as MessageEvent);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ type: "RESOURCE" }));
  });

  it("captures the clientId from a CONNECTED frame and ignores PONG", () => {
    const { svc, ws } = connected();
    const handle = vi.fn();
    svc.addListener({ id: "l1", handle });
    ws.onmessage?.({ data: JSON.stringify({ type: REALTIME_CONST.CONNECTED, clientId: "abc" }) } as MessageEvent);
    ws.onmessage?.({ data: JSON.stringify({ type: REALTIME_CONST.PONG }) } as MessageEvent);
    expect(handle).not.toHaveBeenCalled();

    // The captured clientId is stamped onto outgoing messages.
    svc.sendMessage({ type: "X", clientId: "", message: "" });
    expect(JSON.parse(ws.sent[0]).clientId).toBe("abc");
  });

  it("ignores malformed frames without throwing", () => {
    const { ws } = connected();
    expect(() => ws.onmessage?.({ data: "not json" } as MessageEvent)).not.toThrow();
  });

  it("removes a listener by id", () => {
    const { svc, ws } = connected();
    const handle = vi.fn();
    svc.addListener({ id: "l1", handle });
    svc.removeListener("l1");
    ws.onmessage?.({ data: JSON.stringify({ type: "RESOURCE" }) } as MessageEvent);
    expect(handle).not.toHaveBeenCalled();
  });

  it("sends periodic ping frames while open", () => {
    const { ws } = connected();
    vi.advanceTimersByTime(5000);
    expect(JSON.parse(ws.sent.at(-1)!).type).toBe(REALTIME_CONST.PING);
  });

  it("does not send when the socket is not open", () => {
    const { svc, ws } = connected();
    ws.readyState = MockWebSocket.CLOSED;
    svc.sendMessage({ type: "X", clientId: "", message: "" });
    expect(ws.sent).toHaveLength(0);
  });

  it("reconnects with backoff on an unexpected close", () => {
    const { ws } = connected();
    ws.onclose?.();
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: "WebSocket connection closed" }));
    vi.advanceTimersByTime(30000);
    // A second socket was created by the reconnect attempt.
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it("does not reconnect after an intentional disconnect", () => {
    const { svc } = connected();
    const before = MockWebSocket.instances.length;
    svc.disconnect();
    vi.advanceTimersByTime(30000);
    expect(MockWebSocket.instances.length).toBe(before);
  });

  it("gives up after the maximum number of retries", () => {
    const { ws } = connected();
    // Force past the retry ceiling.
    for (let i = 0; i < 12; i++) {
      const last = MockWebSocket.instances.at(-1)!;
      last.onclose?.();
      vi.advanceTimersByTime(30000);
      last.onopen?.();
    }
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Max reconnection attempts reached." }));
    expect(ws).toBeDefined();
  });
});
