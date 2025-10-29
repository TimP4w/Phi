import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { Button, Card, Chip, Link } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { colorByEventStatus } from "../../shared/helpers";
import { ROUTES } from "../../routes/routes.enum";
import TooltipedDate from "../tooltiped-date/TooltipedDate";
import { useMemo, useState } from "react";

type EventsTableProps = {
  events: KubeEvent[];
};

const EventsTable: React.FC<EventsTableProps> = ({ events }) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Get unique event types for the filter
  const eventTypes = useMemo(() => {
    const types = Array.from(new Set(events.map((event) => event.type)));
    return types.sort();
  }, [events]);

  // Filter events based on selected status
  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") {
      return events;
    }
    return events.filter((event) => event.type === statusFilter);
  }, [events, statusFilter]);

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Filter by status:</span>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "solid" : "bordered"}
            onPress={() => handleStatusChange("all")}
          >
            All
          </Button>
          {eventTypes.map((type) => (
            <Button
              key={type}
              size="sm"
              variant={statusFilter === type ? "solid" : "bordered"}
              color={
                statusFilter === type ? colorByEventStatus(type) : "default"
              }
              onPress={() => handleStatusChange(type)}
            >
              {type}
            </Button>
          ))}
        </div>
        <span className="text-xs text-default-400">
          {filteredEvents.length} of {events.length} events
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <Card className="p-6 text-center" shadow="none">
          <p className="text-default-400">
            {statusFilter === "all"
              ? "No events found"
              : `No events found with status "${statusFilter}"`}
          </p>
        </Card>
      ) : (
        filteredEvents
          .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime())
          .map((event, index) => (
            <Card
              key={`${event.uid}_${index}`}
              className="space-y-2 p-3 rounded-lg  hover:bg-default/50 transition-colors border border-default-200"
              shadow="none"
            >
              <div className="flex items-center justify-between">
                <Chip variant="bordered" color={colorByEventStatus(event.type)}>
                  {event.type}
                </Chip>
                <span className="text-xs text-default-400">
                  <TooltipedDate date={event.lastObserved} />
                </span>
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">
                  {event.reason}
                </p>
                <p className="text-sm text-default-400">{event.message}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-default-400">
                    Source: {event.source}
                  </p>
                  <Link href={`${ROUTES.RESOURCE}/${event.resourceUID}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {event.kind}: {event.name}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))
      )}
    </div>
  );
};

export default EventsTable;
