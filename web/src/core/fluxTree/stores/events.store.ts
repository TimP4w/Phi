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
    if (this.events.find(e => e.uid === event.uid)) {
      return;
    }
    const events = [...this.events];
    events.push(event);
    this.setEvents(events);
    if (!this.isPanelOpen) {
      this.hasNewEvents = true;
      if (event.type === 'Warning') {
        this.hasNewWarnings = true;
      }
    }
  }

  clearEventsHint() {
    this.hasNewEvents = false;
    this.hasNewWarnings = false;
  }
}

export { EventsStore };
