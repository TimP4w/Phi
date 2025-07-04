import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { Button, Card, Chip, Link } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { colorByEventStatus } from "../../shared/helpers";
import { ROUTES } from "../../routes/routes.enum";
import TooltipedDate from "../tooltiped-date/TooltipedDate";

type EventsTableProps = {
  events: KubeEvent[];
};

const EventsTable: React.FC<EventsTableProps> = ({ events }) => {
  return (
    <div className="flex flex-col gap-3">
      {events
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
        ))}
    </div>
  );
};

export default EventsTable;
