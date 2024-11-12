import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { TreeNode } from "../../../core/fluxTree/models/tree";
import EventsTable from "../events-table/EventsTable";
import "./panel.scss";
import { COLORS } from "../../shared/colors";

type EventsTabProps = {
  node: TreeNode | null;
};

export const EventsTab = ({ node }: EventsTabProps) => {
  if (!node) {
    return <div className="events-tab">No Node</div>;
  }
  if (node?.events.length === 0) {
    return (
      <div className="events-tab events-tab--no-events">
        <h2>No Events</h2>
        <FontAwesomeIcon
          icon="bell-slash"
          size="10x"
          color={COLORS.ACCENT_DARKER}
        />
      </div>
    );
  }
  return (
    <div className="events-tab">
      <div className="events-tab__events">
        <EventsTable events={node.events} />
      </div>
    </div>
  );
};
