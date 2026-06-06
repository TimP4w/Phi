import { inject, injectable } from "inversify";
import { TYPES } from "../../shared/types";
import UseCase from "../../shared/usecase";
import type { TreeService } from "../services/tree.service";
import { KubeEvent } from "../models/kubeEvent";
import { EventsStore } from "../stores/events.store";
import { addToast } from "@heroui/react";

@injectable()
export class FetchEventsUseCase extends UseCase<void, Promise<KubeEvent[]>> {
  constructor(
    @inject(EventsStore) private readonly eventsStore: EventsStore,
    @inject(TYPES.TreeService) private readonly treeService: TreeService,
  ) {
    super();
  }

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
