import { container } from "../../shared/inversify.config";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import { TreeService } from "../services/tree.service";
import { KubeEvent } from "../models/kubeEvent";
import { EventsStore } from "../stores/events.store";
import { addToast } from "@heroui/react";

export class FetchEventsUseCase extends UseCase<void, Promise<KubeEvent[]>> {

  private readonly eventsStore = container.get<EventsStore>(EventsStore);
  private readonly treeService = container.get<TreeService>(TYPES.TreeService);

  public async execute(): Promise<KubeEvent[]> {
    try {
      const events = await this.treeService.getEvents();
      this.eventsStore.setEvents(events);
      return Promise.resolve(events);
    } catch (error) {
      addToast({
        title: "Failed to fetch events",
        color: "danger",
      });
      console.error('Failed to fetch events:', error);
      return Promise.reject(error);
    }
  }
}

export const fetchEventsUseCase = new FetchEventsUseCase();
