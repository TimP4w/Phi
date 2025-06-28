import { Button, Chip, Link } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { observer } from "mobx-react-lite";
import { env } from "../../../core/shared/env";
import { EventsPanel } from "../events-panel/EventsPanel";
import { ReactNode } from "react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { ROUTES } from "../../routes/routes.enum";
import { useNavigate } from "react-router-dom";

type HeaderProps = {
  children?: ReactNode;
  showBackButton?: boolean;
};

const Header: React.FC<HeaderProps> = observer(
  ({ children, showBackButton = false }: HeaderProps) => {
    const navigate = useNavigate();

    return (
      <header className="backdrop-blur-sm">
        <div className="max-w-[1400px] py-3 px-8 m-auto flex h-14 items-center">
          <div className="mr-4 flex items-center">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="text-5xl text-white">Φ</span>{" "}
              <span className="text-3xl font-bold text-white">Phi</span>
            </Link>
            <a href={env.GIT_URL} target="_blank" rel="noreferrer">
              <Chip size="md">
                <div className="flex items-center gap-2">
                  <span className="footer__version">{env.VERSION}</span>
                  <SiGithub className="h-4 w-4" />
                </div>
              </Chip>
            </a>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            {children}
            <EventsPanel />
            {showBackButton && (
              <Button
                size="sm"
                variant="flat"
                onPress={() => {
                  navigate(ROUTES.DASHBOARD);
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>
        </div>
      </header>
    );
  }
);

export default Header;
