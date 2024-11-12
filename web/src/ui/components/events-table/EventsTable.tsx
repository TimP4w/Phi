import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import Search, { FilterCategory } from "../search/Search";
import "./events-table.scss";
import { formatDistance } from "date-fns";
import { COLORS } from "../../shared/colors";
import { useMemo, useState } from "react";
import Tag from "../tag/Tag";
import { EventDto } from "../../../core/fluxTree/models/dtos/eventDto";

type EventsTableProps = {
  events: KubeEvent[];
};

// TODO: this may need a bit of refactoring and renaming.
// 1. EventResource and EventReason are not the best names for these components.
// 2. Message needs more space, count and First Observed way less

const EventResource = ({ event }: { event: KubeEvent }) => {
  return (
    <div className="event-resource">
      <span className="event-resource__name">{event.name}</span>
      <span className="event-resource__namespace">{event.namespace}</span>
      <span>
        <Tag>{event.kind}</Tag>
      </span>
    </div>
  );
};

const EventReason = ({ event }: { event: KubeEvent }) => {
  return (
    <div className="event-reason">
      <div className="event-reason__icon">
        {event.type === "Normal" && (
          <FontAwesomeIcon icon="circle-info" color={COLORS.INFO} />
        )}
        {event.type === "Warning" && (
          <FontAwesomeIcon icon="circle-exclamation" color={COLORS.WARNING} />
        )}
      </div>
      <div className="event-reason__label-container">
        <span className="event-reason__label">{event.reason}</span>
        <span className="event-reason__time">
          {formatDistance(event.lastObserved, new Date(), {
            includeSeconds: true,
            addSuffix: true,
          })}
        </span>
      </div>
    </div>
  );
};

const EventsTable: React.FC<EventsTableProps> = ({ events }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<(node: EventDto) => boolean>(
    () => () => true
  );

  const filters: FilterCategory<KubeEvent>[] = useMemo(() => {
    return [
      {
        label: "Status",
        filters: [
          {
            label: "Normal",
            filter: (event: KubeEvent) => event.type === "Normal",
          },
          {
            label: "Warning",
            filter: (event: KubeEvent) => event.type === "Warning",
          },
        ],
      },
      {
        label: "Reason",
        filters: Array.from(new Set(events.map((event) => event.reason))).map(
          (reason) => {
            return {
              label: reason,
              filter: (event: KubeEvent) => event.reason === reason,
            };
          }
        ),
      },
      {
        label: "Source",
        filters: Array.from(new Set(events.map((event) => event.source))).map(
          (source) => {
            return {
              label: source,
              filter: (event: KubeEvent) => event.source === source,
            };
          }
        ),
      },
    ];
  }, [events]);

  const onFilterChange = (filter: (a: never) => boolean) => {
    setFilter(() => filter as (node: KubeEvent) => boolean);
  };

  return (
    <div className="events-table">
      <Search
        onChange={setSearchTerm}
        onFilterChange={onFilterChange}
        filters={filters}
      />
      <table>
        <thead>
          <tr>
            <th>Reason</th>
            <th>Source</th>
            <th>Message</th>
            <th>Resource</th>
            <th>Count</th>
            <th>First Observed</th>
          </tr>
        </thead>
        <tbody>
          {events
            .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime())
            .filter(
              (event) =>
                filter(event) &&
                (event.message
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()) ||
                  event.name.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .map((event: KubeEvent) => (
              <tr key={event.uid}>
                <td>
                  <EventReason event={event} />
                </td>
                <td>{event.source}</td>
                <td>{event.message}</td>
                <td>{<EventResource event={event} />}</td>
                <td>{event.count}</td>
                <td>
                  {formatDistance(event.firstObserved, new Date(), {
                    includeSeconds: true,
                    addSuffix: true,
                  })}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

export default EventsTable;
