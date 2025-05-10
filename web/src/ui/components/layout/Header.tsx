import { observer } from "mobx-react-lite";
import { EventsPanel } from "../events-panel/EventsPanel";
import {
  Chip,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Spacer,
} from "@heroui/react";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { env } from "../../../core/shared/env";

type HeaderProps = object;

const Header: React.FC<HeaderProps> = observer((_: HeaderProps) => {
  return (
    <Navbar position="sticky" className="flex w-[max]">
      <NavbarBrand>
        <span className="text-5xl bold">Φ</span>
        <Spacer x={1} />
        <span className="text-3xl bold">Phi</span>
        <Spacer x={2} />
        <a href={env.GIT_URL} target="_blank" rel="noreferrer">
          <Chip>
            <div className="flex">
              <span className="footer__version">{env.VERSION}</span>
              <Spacer x={2} />

              <FontAwesomeIcon
                icon={faGithub}
                className="footer__git"
                size="lg"
              ></FontAwesomeIcon>
            </div>
          </Chip>
        </a>
      </NavbarBrand>
      <NavbarContent justify="end">
        <NavbarItem>
          <EventsPanel />
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
});

export default Header;
