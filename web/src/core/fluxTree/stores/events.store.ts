import { makeAutoObservable } from "mobx";
import { KubeEvent } from '../models/kubeEvent';

class EventsStore {
  events: KubeEvent[] = [];
  isPanelOpen = false;
  hasNewEvents = false;
  hasNewWarnings = false;

  constructor() {
    makeAutoObservable(this);
  }

  setEvents(events: KubeEvent[]) {
    this.events = events;
  }

  togglePanel() {
    this.isPanelOpen = !this.isPanelOpen;
    if (this.isPanelOpen) {
      this.hasNewEvents = false;
      this.hasNewWarnings = false;
    }
  }

  addEvent(event: KubeEvent) {
    const existingIndex = this.events.findIndex(e => e.uid === event.uid);
    const events = [...this.events];
    if (existingIndex >= 0) {
      // Recurring event (same UID, count++/newer lastObserved) — replace the stored copy
      events[existingIndex] = event;
    } else {
      events.push(event);
    }
    this.setEvents(events);
    if (!this.isPanelOpen) {
      this.hasNewEvents = true;
      if (event.type === 'Warning') {
        this.hasNewWarnings = true;
      }
    }
  }

  eventsForResource(resourceUID: string): KubeEvent[] {
    return this.events.filter(e => e.resourceUID === resourceUID);
  }

  // Events for a resource, newest first — what the detail panel renders.
  sortedEventsForResource(resourceUID: string): KubeEvent[] {
    return this.eventsForResource(resourceUID)
      .slice()
      .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime());
  }

  warningCountForResource(resourceUID: string): number {
    return this.eventsForResource(resourceUID).filter(e => e.type === "Warning").length;
  }

  clearEventsHint() {
    this.hasNewEvents = false;
    this.hasNewWarnings = false;
  }
}

export { EventsStore };
