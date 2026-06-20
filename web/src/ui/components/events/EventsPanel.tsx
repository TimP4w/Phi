import React, { useState } from "react";
import { Chip } from "@heroui/react";
import { BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { ROUTES } from "../../routes/routes.enum";
import EventDetailModal from "../command-palette/EventDetailModal";

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
  const [selected, setSelected] = useState<KubeEvent | null>(null);

  return (
    <>
      {/* Filter chip row */}
      <div className="flex-shrink-0 flex gap-1 px-4 py-2 border-b border-border">
        {(["all", "Warning", "Normal"] as EventFilter[]).map((f) => (
          <Chip
            key={f}
            size="sm"
            variant={filter === f ? "primary" : "soft"}
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
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
            <BellOff className="w-8 h-8 opacity-30" />
            <span className="text-sm">
              {total === 0 ? "No events" : "No matching events"}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event) => (
              <div
                key={`${event.uid}-${event.lastObserved.getTime()}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(event)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(event);
                }}
                className={`px-4 py-2.5 cursor-pointer hover:bg-surface-secondary transition-colors ${
                  event.type === "Warning" ? "bg-warning/[0.04]" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      event.type === "Warning" ? "bg-warning" : "bg-accent"
                    }`}
                  />
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">
                    {event.reason}
                  </span>
                  <span className="text-xs text-muted flex-shrink-0 tabular-nums">
                    {format(event.lastObserved, "HH:mm:ss")}
                  </span>
                </div>
                <p className="text-xs text-muted line-clamp-2 pl-3.5 leading-relaxed">
                  {event.message}
                </p>
                {showCount && event.count > 1 && (
                  <p className="text-xs text-foreground pl-3.5 mt-0.5">
                    ×{event.count}
                  </p>
                )}
                <div className="pl-3.5 mt-1">
                  <Link
                    to={`${ROUTES.RESOURCE}/${event.resourceUID}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-mono text-muted hover:text-foreground transition-colors truncate block w-fit"
                  >
                    {linkLabel ? linkLabel(event) : event.source}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EventDetailModal
        event={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
};

export default EventsPanel;
