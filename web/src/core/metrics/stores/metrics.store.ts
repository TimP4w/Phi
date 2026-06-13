import { action, makeObservable, observable, ObservableMap } from "mobx";
import {
  CurrentUsageDto,
  MetricsStatusDto,
  NodeUsageDto,
  ResourceMetricsDto,
  StorageUsageDto,
} from "../models/dtos/metricsDto";

/** The most recent CPU/memory sample for a resource plus its configured limits. */
export interface LatestUsage {
  cpu?: number;
  memory?: number;
  cpuLimit: number | null;
  memoryLimit: number | null;
}

class MetricsStore {
  prometheusActive = false;
  currentUsage: ObservableMap<string, CurrentUsageDto> = observable.map();
  storageUsage: ObservableMap<string, StorageUsageDto> = observable.map();
  resourceMetrics: ObservableMap<string, ResourceMetricsDto> = observable.map();
  nodeUsage: NodeUsageDto[] = [];

  constructor() {
    makeObservable(this, {
      prometheusActive: observable,
      nodeUsage: observable.ref,
      applyStatus: action,
      applyCurrent: action,
      applyStorage: action,
      applyResource: action,
      applyNodes: action,
    });
  }

  applyStatus(status: MetricsStatusDto): void {
    this.prometheusActive = status.status === "active";
  }

  applyCurrent(usages: Record<string, CurrentUsageDto>): void {
    for (const [uid, usage] of Object.entries(usages)) {
      this.currentUsage.set(uid, {
        ...usage,
        cpu: usage.cpu ?? [],
        memory: usage.memory ?? [],
      });
    }
  }

  applyStorage(usages: Record<string, StorageUsageDto>): void {
    for (const [uid, usage] of Object.entries(usages)) {
      this.storageUsage.set(uid, usage);
    }
  }

  applyResource(uid: string, metrics: ResourceMetricsDto): void {
    this.resourceMetrics.set(uid, {
      ...metrics,
      series: metrics.series ?? {},
    });
  }

  applyNodes(nodes: NodeUsageDto[]): void {
    this.nodeUsage = nodes;
  }

  /** Latest CPU/memory sample + limits for a resource, or undefined if no data. */
  latestUsage(uid: string): LatestUsage | undefined {
    const usage = this.currentUsage.get(uid);
    if (!usage) return undefined;
    return {
      cpu: usage.cpu[usage.cpu.length - 1]?.v,
      memory: usage.memory[usage.memory.length - 1]?.v,
      cpuLimit: usage.spec.cpu.limits,
      memoryLimit: usage.spec.memory.limits,
    };
  }
}

export { MetricsStore };
