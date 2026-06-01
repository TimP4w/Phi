import { REALTIME_CONST } from "../constants/realtime.const";
import { Message } from "../models/message";
import { container } from "../../shared/inversify.config";
import UseCase from "../../shared/usecase";
import { PodLog } from "../../fluxTree/models/tree";
import { LogMessageDto, ResourcePatchDto, ResourceSyncDto, TreeNodeDto } from "../../fluxTree/models/dtos/treeDto";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import { EventsStore } from "../../fluxTree/stores/events.store";
import { KubeEvent } from "../../fluxTree/models/kubeEvent";
import { EventDto } from "../../fluxTree/models/dtos/eventDto";
import { addToast } from "@heroui/react";

export class HandleWsMessageUseCase extends UseCase<Message, Promise<void>> {
  private fluxTreeStore = container.get<FluxTreeStore>(FluxTreeStore);
  private eventsStore = container.get<EventsStore>(EventsStore);

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
      default:
    }

    return Promise.resolve();
  }

  private handleResourceSync(resources: ResourceSyncDto): void {
    this.fluxTreeStore.syncResources(resources as TreeNodeDto[]);
  }

  private handleResourcePatch(patch: ResourcePatchDto): void {
    if (patch.op === "upsert" && patch.resource) {
      this.fluxTreeStore.upsertResource(patch.resource as TreeNodeDto);
    } else if (patch.op === "delete" && patch.resource) {
      const uid = (patch.resource as TreeNodeDto).uid;
      if (uid) {
        this.fluxTreeStore.removeResource(uid);
      }
    }
  }

  private handleLogMessage(logMessage: LogMessageDto): void {
    if (this.fluxTreeStore.selectedResource?.uid === logMessage.uid) {
      this.fluxTreeStore.appendLog(PodLog.fromDto(logMessage));
    }
  }

  private handleEventMessage(event: EventDto): void {
    if (event.type !== "Normal") {
      addToast({
        title: `[${event.kind}] ${event.name} \n${event.reason}`,
        description: event.message,
        color: event.type === "Warning" ? "warning" : "danger",
      });
    }
    this.eventsStore.addEvent(new KubeEvent(event));
  }
}

export const handleWsMessage = new HandleWsMessageUseCase();
