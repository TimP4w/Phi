import { action, makeObservable, observable, ObservableMap } from "mobx";
import {
  CurrentUsageDto,
  MetricsStatusDto,
  NodeUsageDto,
  ResourceMetricsDto,
} from "../models/dtos/metricsDto";

class MetricsStore {
  prometheusActive = false;
  currentUsage: ObservableMap<string, CurrentUsageDto> = observable.map();
  resourceMetrics: ObservableMap<string, ResourceMetricsDto> = observable.map();
  nodeUsage: NodeUsageDto[] = [];

  constructor() {
    makeObservable(this, {
      prometheusActive: observable,
      nodeUsage: observable.ref,
      applyStatus: action,
      applyCurrent: action,
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

  applyResource(uid: string, metrics: ResourceMetricsDto): void {
    this.resourceMetrics.set(uid, {
      ...metrics,
      series: metrics.series ?? {},
    });
  }

  applyNodes(nodes: NodeUsageDto[]): void {
    this.nodeUsage = nodes;
  }
}

export { MetricsStore };
