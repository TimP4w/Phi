import { observer } from "mobx-react-lite";
import { EventsPanel } from "../events-panel/EventsPanel";
import { Navbar, NavbarBrand, NavbarContent, NavbarItem } from "@heroui/react";

type HeaderProps = object;

const Header: React.FC<HeaderProps> = observer((_: HeaderProps) => {
  return (
    <Navbar position="sticky" className="flex w-[max]">
      <NavbarBrand>
        <span className="text-5xl bold">Φ Phi</span>
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
