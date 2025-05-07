import { observer } from "mobx-react-lite";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { env } from "../../../core/shared/env";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { Spacer } from "@heroui/react";

type FooterProps = object;

const Footer: React.FC<FooterProps> = observer((_: FooterProps) => {
  return (
    <div className="flex justify-center min-h-[40px] content-center items-center">
      <span className="footer__version">{env.VERSION}</span>
      <Spacer x={2} />
      <a href={env.GIT_URL} target="_blank" rel="noreferrer">
        <FontAwesomeIcon
          icon={faGithub}
          className="footer__git"
          size="2x"
        ></FontAwesomeIcon>
      </a>
    </div>
  );
});

export default Footer;
