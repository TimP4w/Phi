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

  clearEventsHint() {
    this.hasNewEvents = false;
    this.hasNewWarnings = false;
  }
}

export { EventsStore };
