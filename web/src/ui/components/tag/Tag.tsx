import { observer } from "mobx-react-lite";
import "./tag.scss";

type TagProps = {
  children: React.ReactNode;
};

const Tag: React.FC<TagProps> = observer((props) => {
  return (
    <div className="tag">
      <span>{props.children}</span>
    </div>
  );
});

export default Tag;
