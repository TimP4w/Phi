import { useInjection } from "inversify-react";
import { observer } from "mobx-react-lite";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import EventsTable from "../events-table/EventsTable";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
  Badge,
  Button,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const EventsPanel = observer(() => {
  const eventsStore = useInjection(EventsStore);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  return (
    <>
      <Badge
        shape="circle"
        isInvisible={!eventsStore.hasNewEvents}
        color={eventsStore.hasNewWarnings ? "warning" : "default"}
        content=""
        className="border-transparent"
      >
        <Button isIconOnly radius="full" variant="light">
          <FontAwesomeIcon icon="bell" size="2x" onClick={onOpen} />
        </Button>
      </Badge>
      <Drawer
        isOpen={isOpen}
        size={"5xl"}
        onOpenChange={() => {
          onOpenChange();
          eventsStore.clearEventsHint();
        }}
        className="dark"
      >
        <DrawerContent>
          <>
            <DrawerHeader className="flex flex-col gap-1">Events</DrawerHeader>
            <DrawerBody>
              <EventsTable events={eventsStore.events} />
            </DrawerBody>
            <DrawerFooter></DrawerFooter>
          </>
        </DrawerContent>
      </Drawer>
    </>
  );
  /*
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
  );*/
});
