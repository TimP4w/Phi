import { observer } from "mobx-react-lite";

import "./header.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useInjection } from "inversify-react";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { COLORS } from "../../shared/colors";

type HeaderProps = {};

const Header: React.FC<HeaderProps> = observer((_: HeaderProps) => {
  const eventsStore = useInjection(EventsStore);
  return (
    <div className="header">
      <span className="header__logo">Φ Phi</span>
      <FontAwesomeIcon
        icon="envelope"
        size="2x"
        className="header__events-icon"
        bounce={eventsStore.hasNewEvents}
        shake={eventsStore.hasNewWarnings}
        onClick={() => {
          eventsStore.togglePanel();
        }}
        color={eventsStore.hasNewWarnings ? COLORS.WARNING : COLORS.FONT}
      />
    </div>
  );
});

export default Header;
