import { observer } from "mobx-react-lite";

import "./footer.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { env } from "../../../core/shared/env";
import { faGithub } from "@fortawesome/free-brands-svg-icons";

type FooterProps = {};

const Footer: React.FC<FooterProps> = observer((_: FooterProps) => {
  return (
    <div className="footer">
      <span className="footer__version">{env.VERSION}</span>
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
