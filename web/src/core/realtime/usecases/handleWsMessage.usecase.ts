import { REALTIME_CONST } from "../constants/realtime.const";
import { Message } from "../models/message";
import { inject, injectable } from "inversify";
import UseCase from "../../shared/usecase";
import { PodLog } from "../../fluxTree/models/tree";
import { LogMessageDto, ResourcePatchDto, ResourceSyncDto, TreeNodeDto } from "../../fluxTree/models/dtos/treeDto";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import { EventsStore } from "../../fluxTree/stores/events.store";
import { KubeEvent } from "../../fluxTree/models/kubeEvent";
import { EventDto } from "../../fluxTree/models/dtos/eventDto";
import { addToast } from "@heroui/react";
import { MetricsStore } from "../../metrics/stores/metrics.store";
import {
  MetricsCurrentMessageDto,
  MetricsResourceMessageDto,
  MetricsStatusDto,
  NodeUsageDto,
} from "../../metrics/models/dtos/metricsDto";

const FLUX_KINDS = new Set([
  "HelmRelease", "Kustomization", "GitRepository",
  "HelmRepository", "HelmChart", "OCIRepository", "Bucket",
]);

const FLUX_REASON_COLOR: Record<string, "primary" | "success" | "warning" | "danger"> = {
  // Shared / generic
  ReconciliationStarted: "primary",
  ReconciliationSucceeded: "success",
  ReconciliationFailed: "danger",
  DependencyNotReady: "warning",
  ArtifactFailed: "danger",
  // Helm controller
  InstallSucceeded: "success",
  InstallFailed: "danger",
  UpgradeSucceeded: "success",
  UpgradeFailed: "danger",
  TestSucceeded: "success",
  TestFailed: "warning",
  RollbackSucceeded: "warning",
  RollbackFailed: "danger",
  UninstallSucceeded: "success",
  UninstallFailed: "danger",
  HelmChartNotFound: "warning",
  // Kustomize controller
  BuildFailed: "danger",
  HealthCheckFailed: "danger",
  PruneFailed: "danger",
  // Source controller
  NewArtifact: "success",
  AuthenticationFailed: "danger",
  GitOperationFailed: "danger",
  VerificationFailed: "danger",
  ChartPullFailed: "danger",
  URLInvalid: "danger",
};

@injectable()
export class HandleWsMessageUseCase extends UseCase<Message, Promise<void>> {
  constructor(
    @inject(FluxTreeStore) private fluxTreeStore: FluxTreeStore,
    @inject(EventsStore) private eventsStore: EventsStore,
    @inject(MetricsStore) private metricsStore: MetricsStore,
  ) {
    super();
  }

  public execute(message: Message): Promise<void> {
    switch (message.type) {
      case REALTIME_CONST.RESOURCE_SYNC:
        this.handleResourceSync(message.message as ResourceSyncDto);
        break;
      case REALTIME_CONST.RESOURCE_PATCH: {
        const patch = message.message as ResourcePatchDto;
        this.handleResourcePatch(patch);
        break;
      }
      case REALTIME_CONST.LOG:
        this.handleLogMessage(message.message as LogMessageDto);
        break;
      case REALTIME_CONST.EVENT:
        this.handleEventMessage(message.message as EventDto);
        break;
      case REALTIME_CONST.METRICS_STATUS:
        this.metricsStore.applyStatus(message.message as MetricsStatusDto);
        break;
      case REALTIME_CONST.METRICS_CURRENT:
        this.metricsStore.applyCurrent((message.message as MetricsCurrentMessageDto)?.usages ?? {});
        break;
      case REALTIME_CONST.METRICS_RESOURCE: {
        const payload = message.message as MetricsResourceMessageDto;
        if (payload?.uid) this.metricsStore.applyResource(payload.uid, payload.metrics);
        break;
      }
      case REALTIME_CONST.METRICS_NODES:
        this.metricsStore.applyNodes((message.message as NodeUsageDto[]) ?? []);
        break;
      default:
    }

    return Promise.resolve();
  }

  private handleResourceSync(resources: ResourceSyncDto): void {
    if (!Array.isArray(resources)) return;
    this.fluxTreeStore.syncResources(resources.filter((r): r is TreeNodeDto => !!r?.uid));
  }

  private handleResourcePatch(patch: ResourcePatchDto): void {
    if (!patch || (patch.op !== "upsert" && patch.op !== "delete")) return;
    if (patch.op === "upsert") {
      const resource = patch.resource as TreeNodeDto | undefined;
      if (resource?.uid) this.fluxTreeStore.upsertResource(resource);
    } else {
      const uid = (patch.resource as TreeNodeDto | undefined)?.uid;
      if (uid) this.fluxTreeStore.removeResource(uid);
    }
  }

  private handleLogMessage(logMessage: LogMessageDto): void {
    if (this.fluxTreeStore.selectedResource?.uid === logMessage.uid) {
      this.fluxTreeStore.appendLog(PodLog.fromDto(logMessage));
    }
  }

  private handleEventMessage(event: EventDto): void {
    const color = FLUX_KINDS.has(event.kind) ? FLUX_REASON_COLOR[event.reason] : undefined;
    if (color) {
      addToast({
        title: `[${event.kind}] ${event.name} — ${event.reason}`,
        description: event.message,
        color,
      });
    }
    this.eventsStore.addEvent(new KubeEvent(event));
  }
}
