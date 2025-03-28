import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { formatDistance } from "date-fns";
import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ICONS } from "../../shared/icons";
import { COLORS } from "../../shared/colors";

type EventsTableProps = {
  events: KubeEvent[];
};

const EventsTable: React.FC<EventsTableProps> = ({ events }) => {
  const columns = [
    {
      key: "reason",
      label: "REASON",
    },
    {
      key: "message",
      label: "MESSAGE",
    },
  ];

  const renderCell = useCallback((event: KubeEvent, columnKey: string) => {
    const cellValue = event[columnKey as keyof KubeEvent];

    const icon = event.type === "Normal" ? ICONS.INFO : ICONS.WARNING;
    const iconColor = event.type === "Normal" ? COLORS.INFO : COLORS.WARNING;
    switch (columnKey) {
      case "reason":
        return (
          <div className="flex items-center gap-3">
            <FontAwesomeIcon
              icon={icon}
              size="2x"
              color={iconColor}
            ></FontAwesomeIcon>
            <div className="flex flex-col">
              <span className="text-bold text-md">
                {event.reason} ({event.count}x)
              </span>
              <p className="text-sm text-default-400">{event.source}</p>
              {event.resourceUID ? (
                <Link href={`/tree/${event.resourceUID}`}>
                  <p className="text-sm">{event.name}</p>
                </Link>
              ) : (
                <p className="text-sm">{event.name}</p>
              )}
              <p className="text-sm text-default-400">
                {formatDistance(event.lastObserved, new Date(), {
                  includeSeconds: true,
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
        );
      case "message":
        return <p className="text-wrap">{event.message}</p>;
      default:
        return String(cellValue);
    }
  }, []);

  return (
    <Table removeWrapper aria-label="Kubernetes events" className="dark">
      <TableHeader columns={columns}>
        {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
      </TableHeader>
      <TableBody
        items={events.sort(
          (a, b) => b.lastObserved.getTime() - a.lastObserved.getTime()
        )}
        emptyContent={"No rows to display."}
      >
        {(item) => (
          <TableRow key={item.uid}>
            {(columnKey) => (
              <TableCell className="max-w-[250px]">
                {renderCell(item, columnKey)}
              </TableCell>
            )}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default EventsTable;

/*
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
*/
