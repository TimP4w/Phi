import { KubeResource } from "../../../core/fluxTree/models/tree";
import EventsTable from "../events-table/EventsTable";
import { BellOff } from "lucide-react";

type EventsTabProps = {
  resource: KubeResource | null;
};

export const EventsTab = ({ resource }: EventsTabProps) => {
  if (!resource) {
    return <div className="events-tab">No Resource</div>;
  }
  if (resource?.events.length === 0) {
    return (
      <div className="flex flex-col gap-2 items-center p-4">
        <span className="text-xl">No Events for this Resource</span>
        <BellOff className="text-default-100" size={256}></BellOff>
      </div>
    );
  }
  return (
    <div className="events-tab">
      <div className="events-tab__events">
        <EventsTable events={resource.events} />
      </div>
    </div>
  );
};
