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
  Button,
  Tabs,
  Tab,
} from "@heroui/react";
import { Bell } from "lucide-react";
import { FLUX_CONTROLLER } from "../../../core/fluxTree/constants/resources.const";
import { isEnumValue } from "../../../core/shared/enum.utils";

export const EventsPanel = observer(() => {
  const eventsStore = useInjection(EventsStore);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const isFluxEvent = (eventSource: string): boolean => {
    return isEnumValue(FLUX_CONTROLLER, eventSource);
  };

  return (
    <div>
      <Button
        variant="flat"
        size="sm"
        onPress={onOpen}
        color={eventsStore.hasNewWarnings ? "warning" : "default"}
      >
        <Bell className="h-4 w-4 mr-1" />
        Events
      </Button>
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
              <Tabs>
                <Tab key="fluxevents" title="Flux Events">
                  <EventsTable
                    events={eventsStore.events.filter((event) =>
                      isFluxEvent(event.source)
                    )}
                  />
                </Tab>
                <Tab key="clusterevents" title="Cluster Events">
                  <EventsTable
                    events={eventsStore.events.filter(
                      (event) => !isFluxEvent(event.source)
                    )}
                  />
                </Tab>
              </Tabs>
            </DrawerBody>
            <DrawerFooter></DrawerFooter>
          </>
        </DrawerContent>
      </Drawer>
    </div>
  );
});
