import React from "react";
import { Chip } from "@heroui/react";
import { BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { ROUTES } from "../../routes/routes.enum";

export type EventFilter = "all" | "Warning" | "Normal";

export type EventsPanelProps = {
  events: KubeEvent[];
  filter: EventFilter;
  onFilterChange: (f: EventFilter) => void;
  /** Total number of events before filter, used for "No matching events" vs "No events" */
  totalEventCount?: number;
  /** Custom label for the resource link. Defaults to event.source */
  linkLabel?: (event: KubeEvent) => string;
  /** Whether to show the repeat count line. Defaults to false */
  showCount?: boolean;
};

const EventsPanel: React.FC<EventsPanelProps> = ({
  events,
  filter,
  onFilterChange,
  totalEventCount,
  linkLabel,
  showCount = false,
}) => {
  const total = totalEventCount ?? events.length;

  return (
    <>
      {/* Filter chip row */}
      <div className="flex-shrink-0 flex gap-1 px-4 py-2 border-b border-default-100">
        {(["all", "Warning", "Normal"] as EventFilter[]).map((f) => (
          <Chip
            key={f}
            size="sm"
            variant={filter === f ? "solid" : "flat"}
            color={filter === f && f === "Warning" ? "warning" : "default"}
            className="cursor-pointer select-none"
            onClick={() => onFilterChange(f)}
          >
            {f === "all" ? "All" : f}
          </Chip>
        ))}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-default-400">
            <BellOff className="w-8 h-8 opacity-30" />
            <span className="text-sm">
              {total === 0 ? "No events" : "No matching events"}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-default-100">
            {events.map((event) => (
              <div
                key={`${event.uid}-${event.lastObserved.getTime()}`}
                className={`px-4 py-2.5 hover:bg-content2 transition-colors ${
                  event.type === "Warning" ? "bg-warning/[0.04]" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      event.type === "Warning" ? "bg-warning" : "bg-primary"
                    }`}
                  />
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">
                    {event.reason}
                  </span>
                  <span className="text-xs text-default-500 flex-shrink-0 tabular-nums">
                    {format(event.lastObserved, "HH:mm:ss")}
                  </span>
                </div>
                <p className="text-xs text-default-400 line-clamp-2 pl-3.5 leading-relaxed">
                  {event.message}
                </p>
                {showCount && event.count > 1 && (
                  <p className="text-xs text-default-600 pl-3.5 mt-0.5">
                    ×{event.count}
                  </p>
                )}
                <div className="pl-3.5 mt-1">
                  <Link
                    to={`${ROUTES.RESOURCE}/${event.resourceUID}`}
                    className="text-xs font-mono text-default-500 hover:text-foreground transition-colors truncate block"
                  >
                    {linkLabel ? linkLabel(event) : event.source}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default EventsPanel;
