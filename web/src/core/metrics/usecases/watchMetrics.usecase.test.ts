import { describe, it, expect, vi } from "vitest";
import { WatchMetricsUseCase } from "./watchMetrics.usecase";
import { StopWatchMetricsUseCase } from "./stopWatchMetrics.usecase";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";

const ws = () => ({ sendMessage: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });

describe("WatchMetricsUseCase", () => {
  it("sends a START_WATCH_METRICS message with the subscription", () => {
    const realtime = ws();
    const sub = { channel: "detail" as const, uid: "u1", range: "1h" };
    new WatchMetricsUseCase(realtime).execute(sub);
    expect(realtime.sendMessage).toHaveBeenCalledWith({ type: REALTIME_CONST.START_WATCH_METRICS, message: sub });
  });
});

describe("StopWatchMetricsUseCase", () => {
  it("sends a STOP_WATCH_METRICS message for the channel", () => {
    const realtime = ws();
    new StopWatchMetricsUseCase(realtime).execute("tree");
    expect(realtime.sendMessage).toHaveBeenCalledWith({ type: REALTIME_CONST.STOP_WATCH_METRICS, message: { channel: "tree" } });
  });
});
