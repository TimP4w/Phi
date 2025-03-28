import { observer } from "mobx-react-lite";
import {
  HelmReleaseNode,
  KustomizationNode,
  ResourceStatus,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import ConditionTag from "../condition-tag/ConditionTag";
import Source from "../source/Source";
import PlayPause from "../play-pause/PlayPause";
import AppLogo from "../app-logo/AppLogo";
import {
  Card,
  CardHeader,
  Badge,
  Avatar,
  Divider,
  CardBody,
  CardFooter,
  Spinner,
  Chip,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";

type AppProps = {
  node: TreeNode;
};

const App: React.FC<AppProps> = observer(({ node }) => {
  const navigate = useNavigate();

  const colorByStatus = (status: ResourceStatus) => {
    switch (status) {
      case ResourceStatus.SUCCESS:
        return "success";
      case ResourceStatus.FAILED:
        return "danger";
      case ResourceStatus.PENDING:
        return "warning";
      default:
        return "primary";
    }
  };

  return (
    <Card
      className="w-96"
      key={node.uid}
      isPressable
      onPress={() => {
        navigate(`/tree/${node.uid}`);
      }}
    >
      <CardHeader className="flex justify-between">
        <div className="flex gap-3">
          <Badge
            color={colorByStatus(node.status)}
            content={node.fluxMetadata?.isSuspended ? "suspended" : " "}
            className="border-transparent"
          >
            <Avatar
              isBordered
              classNames={{
                base: "bg-transparent",
                icon: "text-black/80",
              }}
              color={colorByStatus(node.status)}
              icon={<AppLogo kind={node.kind} />}
            />
          </Badge>
          <div className="flex flex-col items-start">
            <p className="text-md">{node.name}</p>
            <p className="text-small text-default-500">{node.kind}</p>
          </div>
          {node.kind === "HelmRelease" && (
            <Chip>{(node as HelmReleaseNode).metadata?.chartVersion}</Chip>
          )}
        </div>
        <PlayPause node={node} />
      </CardHeader>
      <Divider />
      <CardBody>
        <div className="flex gap-3">
          {node.conditions.map((condition, key) => (
            <ConditionTag condition={condition} key={key.toString()} />
          ))}
        </div>
      </CardBody>
      <CardFooter className="flex justify-between">
        <Source node={node} />
        {((node as KustomizationNode | HelmReleaseNode).fluxMetadata
          ?.isReconciling ||
          node.status === ResourceStatus.PENDING) && (
          <Spinner className="justify-end" color="warning" />
        )}
      </CardFooter>
    </Card>
  );
});

export default App;
