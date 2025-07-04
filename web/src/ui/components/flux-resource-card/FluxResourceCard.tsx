import { observer } from "mobx-react-lite";
import {
  FluxResource,
  HelmRelease,
  Kustomization,
} from "../../../core/fluxTree/models/tree";
import ConditionTag from "../condition-tag/ConditionTag";
import Source from "../source/Source";
import ReconcileSuspendButtonGroup from "../play-pause/ReconcileSuspendButtonGroup";
import AppLogo from "../resource-icon/ResourceIcon";
import {
  Card,
  CardHeader,
  Divider,
  CardBody,
  CardFooter,
  Link,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import TooltipedDate from "../tooltiped-date/TooltipedDate";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import StatusChip from "../status-chip/StatusChip";

type FluxResourceCardProps = {
  node: FluxResource;
};

const FluxResourceCard: React.FC<FluxResourceCardProps> = observer(
  ({ node }) => {
    const navigate = useNavigate();
    const fluxTreeStore = useInjection(FluxTreeStore);

    const SourceInfo = (node: FluxResource) => {
      if (node instanceof Kustomization || node instanceof HelmRelease) {
        const ref = (node as Kustomization).metadata?.sourceRef;
        const repository = fluxTreeStore.findRepositoryByRef(ref);

        return (
          <div className="flex justify-between">
            <span className="text-default-400">Source</span>
            <Link
              href={`${ROUTES.RESOURCE}/${repository?.uid}`}
              showAnchorIcon
              className="flex items-center gap-1 font-mono text-xs hover:underline text-white"
            >
              {(node as Kustomization).metadata?.sourceRef?.name}
            </Link>
          </div>
        );
      }

      return <></>;
    };

    const RevisionInfo = (resource: FluxResource) => {
      if (
        !(resource instanceof Kustomization || resource instanceof HelmRelease)
      ) {
        return null;
      }

      const label = resource instanceof HelmRelease ? "Version" : "Revision";

      return (
        <div className="flex justify-between">
          <span className="text-default-400">{label}</span>
          <span className="font-mono text-xs truncate max-w-[120px]">
            <Source fluxResource={resource} />
          </span>
        </div>
      );
    };
    return (
      <Card
        className="cursor-pointer transition-colors hover:bg-content2"
        isPressable
        onPress={() => {
          navigate(`${ROUTES.RESOURCE}/${node.uid}`);
        }}
        shadow="none"
      >
        <CardHeader className="p-3 pb-0">
          <div className="flex flex-col space-y-2 w-full">
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <AppLogo kind={node.kind} />
                <span className="text-base">{node.name}</span>
              </div>
              <StatusChip resource={node} />
            </div>
            <span className="self-start text-sm text-default-400">
              {node.kind} • {node.namespace}
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex space-y-2 gap-2 items-center">
            {node.conditions.map((condition, key) => (
              <ConditionTag condition={condition} key={key.toString()} />
            ))}
          </div>
          <Divider className="my-4" />
          <div className="flex flex-col justify-between gap-2 text-sm ">
            {SourceInfo(node)}
            {RevisionInfo(node)}
            <div className="flex justify-between">
              <span className="text-default-400">Created</span>
              <span className="text-xs">
                <TooltipedDate date={node.createdAt} />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-400">Last Sync</span>
              <span className="text-xs">
                <TooltipedDate date={node.lastSyncAt} />
              </span>
            </div>
          </div>
        </CardBody>
        <Divider className="mx-3 w-auto" />
        <CardFooter className="flex justify-between items-center p-3">
          <ReconcileSuspendButtonGroup resource={node} />
        </CardFooter>
      </Card>
    );
  }
);

export default FluxResourceCard;
