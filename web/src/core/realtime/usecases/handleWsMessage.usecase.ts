import { REALTIME_CONST } from "../constants/realtime.const";
import { Message } from "../models/message";
import { container } from "../../shared/inversify.config";
import UseCase from "../../shared/usecase";
import { Log, Tree } from "../../fluxTree/models/tree";
import { LogMessageDto, TreeNodeDto } from "../../fluxTree/models/dtos/treeDto";
import { FluxTreeStore } from "../../fluxTree/stores/fluxTree.store";
import { toast, TypeOptions } from "react-toastify";
import { EventsStore } from "../../fluxTree/stores/events.store";
import { KubeEvent } from "../../fluxTree/models/kubeEvent";
import pako from "pako";
import { EventDto } from "../../fluxTree/models/dtos/eventDto";



export class HandleWsMessageUseCase extends UseCase<Message, Promise<void>> {

  private fluxTreeStore = container.get<FluxTreeStore>(FluxTreeStore);
  private eventsStore = container.get<EventsStore>(EventsStore);

  public execute(message: Message): Promise<void> {
    switch (message.type) {
      case REALTIME_CONST.TREE:
        this.handleTreeMessage(message.message);
        break;
      case REALTIME_CONST.LOG: // TODO: this should be a different usecase
        this.handleLogMessage(message.message as LogMessageDto);
        break;
      case REALTIME_CONST.EVENT: {  // TODO: this should be a different usecase
        this.handleEventMessage(message.message as EventDto);
        break;
      }
      default:
        console.log("Unknown message type: ", message.type);
    }

    return Promise.resolve();
  }

  private async handleLogMessage(logMessage: LogMessageDto): Promise<void> {
    if (this.fluxTreeStore.selectedNode?.uid === logMessage.uid) {
      this.fluxTreeStore.appendLog(new Log(logMessage.timestamp.toString(), logMessage.log, logMessage.container));
    }
  }

  private async handleEventMessage(event: EventDto): Promise<void> {
    if (event.type !== "Normal") {
      let type: TypeOptions = "warning";
      switch (event.type) {
        case "Warning":
          type = "warning";
          break;
        default:
          type = "error";
          break;
      }
      toast(`[${event.kind}] ${event.name} \n${event.reason} - ${event.message}`, { type: type, theme: "dark" });
    }
    this.eventsStore.addEvent(new KubeEvent(event));
  }

  private async handleTreeMessage(message: unknown): Promise<void> {
    const treeDto = this.decompressMessage<TreeNodeDto>(message as string);
    const tree = Tree.fromDto(treeDto as TreeNodeDto);
    this.fluxTreeStore.setTree(tree);
  }

  private decompressMessage<T>(message: string): T {
    const compressedTree = Buffer.from(message as string, 'base64');
    const decompressed = pako.ungzip(compressedTree, { to: 'string' });
    return JSON.parse(decompressed);
  }
}

export const handleWsMessage = new HandleWsMessageUseCase();
