import { describe, it, expect, vi, beforeEach } from "vitest";

import { ReconcileUseCase } from "./reconcile.usecase";
import { SuspendUseCase } from "./suspend.usecase";
import { ResumeUseCase } from "./resume.usecase";
import { DescribeNodeUseCase } from "./describeNode.usecase";
import { WatchLogsUseCase } from "./watchLogs.usecase";
import { REALTIME_CONST } from "../../realtime/constants/realtime.const";
import { kubeResource } from "../../../test/fixtures";
import type { ResourceService } from "../services/resource.service";
import type { Notifier } from "../../shared/notifier";

const resourceSvc = (over: Partial<ResourceService> = {}): ResourceService => ({
  describe: vi.fn().mockResolvedValue("yaml"),
  reconcile: vi.fn().mockResolvedValue(undefined),
  suspend: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  ...over,
});

let notifier: Notifier & { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
beforeEach(() => {
  notifier = { success: vi.fn(), error: vi.fn() };
});

describe("ReconcileUseCase", () => {
  it("delegates to the service on success", async () => {
    const svc = resourceSvc();
    await new ReconcileUseCase(svc, notifier).execute("u1");
    expect(svc.reconcile).toHaveBeenCalledWith("u1");
  });

  it("notifies and rejects on failure", async () => {
    const svc = resourceSvc({ reconcile: vi.fn().mockRejectedValue(new Error("x")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new ReconcileUseCase(svc, notifier).execute("u1")).rejects.toThrow("x");
    expect(notifier.error).toHaveBeenCalledWith("Failed to trigger reconciliation");
  });
});

describe("SuspendUseCase", () => {
  it("notifies success", async () => {
    await new SuspendUseCase(resourceSvc(), notifier).execute("u1");
    expect(notifier.success).toHaveBeenCalledWith("Suspended sync");
  });

  it("notifies error and rejects on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = resourceSvc({ suspend: vi.fn().mockRejectedValue(new Error("e")) });
    await expect(new SuspendUseCase(svc, notifier).execute("u1")).rejects.toThrow("e");
    expect(notifier.error).toHaveBeenCalledWith("Failed to suspend");
  });
});

describe("ResumeUseCase", () => {
  it("notifies success", async () => {
    await new ResumeUseCase(resourceSvc(), notifier).execute("u1");
    expect(notifier.success).toHaveBeenCalledWith("Resumed sync");
  });

  it("notifies error and rejects on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = resourceSvc({ resume: vi.fn().mockRejectedValue(new Error("e")) });
    await expect(new ResumeUseCase(svc, notifier).execute("u1")).rejects.toThrow("e");
    expect(notifier.error).toHaveBeenCalledWith("Failed to resume");
  });
});

describe("DescribeNodeUseCase", () => {
  it("returns the described YAML", async () => {
    await expect(new DescribeNodeUseCase(resourceSvc(), notifier).execute("u1")).resolves.toBe("yaml");
  });

  it("notifies and rejects on failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = resourceSvc({ describe: vi.fn().mockRejectedValue(new Error("e")) });
    await expect(new DescribeNodeUseCase(svc, notifier).execute("u1")).rejects.toThrow("e");
    expect(notifier.error).toHaveBeenCalledWith("Failed to fetch tree data");
  });
});

describe("WatchLogsUseCase", () => {
  const ws = () => ({ sendMessage: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });

  it("sends a START_WATCH_LOGS message for a Pod", async () => {
    const realtime = ws();
    await new WatchLogsUseCase(realtime).execute(kubeResource({ uid: "p1", kind: "Pod" }));
    expect(realtime.sendMessage).toHaveBeenCalledWith({ type: REALTIME_CONST.START_WATCH_LOGS, message: "p1" });
  });

  it("rejects for a non-Pod resource", async () => {
    const realtime = ws();
    await expect(new WatchLogsUseCase(realtime).execute(kubeResource({ kind: "Deployment" }))).rejects.toThrow(/not a Pod/);
    expect(realtime.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects when no node is given", async () => {
    await expect(new WatchLogsUseCase(ws()).execute(undefined as never)).rejects.toThrow(/not defined/);
  });
});
