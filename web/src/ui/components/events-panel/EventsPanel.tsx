import { useEffect, useRef } from "react";
import "./eventsPanel.scss";
import { useInjection } from "inversify-react";
import { observer } from "mobx-react-lite";
import classNames from "classnames";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import EventsTable from "../events-table/EventsTable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const EventsPanel = observer(() => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const eventsStore = useInjection(EventsStore);
  const isOpen = eventsStore.isPanelOpen;

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as HTMLDivElement)
      ) {
        eventsStore.togglePanel();
        return;
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, eventsStore]);

  const closePanel = () => {
    eventsStore.togglePanel();
  };

  return (
    <div
      ref={panelRef}
      className={classNames("events-panel", {
        "events-panel--open": isOpen,
        "events-panel--closed": !isOpen,
      })}
    >
      <div className="events-panel__table">
        <div className="events-panel__header-bar">
          <FontAwesomeIcon
            className="events-panel__close-icon"
            onClick={() => closePanel()}
            size="2x"
            icon={"xmark"}
          />
        </div>
        <EventsTable events={eventsStore.events} />
      </div>
    </div>
  );
});
