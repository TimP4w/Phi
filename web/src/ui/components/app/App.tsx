import { observer } from "mobx-react-lite";
import "./app.scss";
import {
  HelmReleaseNode,
  ResourceStatus,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import Tag from "../tag/Tag";
import { COLORS } from "../../shared/colors";
import ConditionTag from "../condition-tag/ConditionTag";
import Source from "../source/Source";
import PlayPause from "../play-pause/PlayPause";
import AppLogo from "../app-logo/AppLogo";

type AppProps = {
  node: TreeNode;
};

const App: React.FC<AppProps> = observer(({ node }) => {
  return (
    <div className="app">
      {node.status === ResourceStatus.PENDING ? (
        <div
          className="app__border"
          style={{ "--gradient-color": COLORS.WARNING } as React.CSSProperties}
        ></div>
      ) : null}
      <div className="app__container">
        <div className="app__content">
          <div className="app__header">
            <div className="app__title-container">
              <span className="app__title-name">{node.name}</span>
              <span className="app__title-namespace">{node.namespace}</span>
            </div>
            <div className="app__version">
              {node.kind === "HelmRelease" && (
                <Tag>{(node as HelmReleaseNode).metadata?.chartVersion}</Tag>
              )}
            </div>
            {node.isReconcillable && <PlayPause node={node} />}
          </div>
          <div className="app__conditions">
            {node.conditions.map((condition, index) => (
              <ConditionTag key={index.toString()} condition={condition} />
            ))}
          </div>
          <div className="app__footer">
            <Source node={node}></Source>
          </div>
        </div>
        <div className="app__logo">
          <AppLogo kind={node.kind} />
        </div>
        <div className="app__tags">
          <Tag>{node.kind}</Tag>
        </div>
      </div>
    </div>
  );
});

export default App;
