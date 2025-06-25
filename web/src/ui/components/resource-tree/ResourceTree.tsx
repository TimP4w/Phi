import { observer } from "mobx-react-lite";
import { KubeResource } from "../../../core/fluxTree/models/tree";
import { Button, Card, CardBody, Chip, Skeleton } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import AppLogo from "../resource-icon/ResourceIcon";
import { colorByStatus, statusText } from "../../shared/helpers";
import ConditionTag from "../condition-tag/ConditionTag";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../routes/routes.enum";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";

type ResourceTreeProps = {
  resource?: KubeResource;
  level: number;
  onResourceClick: (node: KubeResource) => void;
};

const ResourceTree: React.FC<ResourceTreeProps> = observer(
  ({ resource, level = 0, onResourceClick }: ResourceTreeProps) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren =
      resource && resource.children && resource.children.length > 0;
    const navigate = useNavigate();

    const renderResourceInfo = () => {
      switch (resource?.kind) {
        // TODO: add here special infos for certain resource kinds
        default:
          return null;
      }
    };

    if (!resource) {
      return (
        <div className="space-y-2">
          <Skeleton className="rounded-lg">
            <div className="h-24 rounded-lg bg-default-300" />
          </Skeleton>
          <Skeleton className="rounded-lg ml-12">
            <div className="h-24 rounded-lg bg-default-300" />
          </Skeleton>
          <Skeleton className="rounded-lg ml-24">
            <div className="h-24 rounded-lg bg-default-300" />
          </Skeleton>
        </div>
      );
    }

    return (
      <div className="space-y-2" style={{ paddingLeft: `${level * 12}px` }}>
        <Card
          className="block w-full items-start border border-default-200"
          onPress={resource ? () => onResourceClick(resource) : () => {}}
          isPressable
          shadow="none"
        >
          <CardBody className="flex-1">
            <div className="flex justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <AppLogo kind={resource?.kind} />
                  <div>
                    <span className="font-md font-bold truncate">
                      {resource?.name}
                    </span>
                    <p className="text-sm text-default-400">
                      {resource?.namespace}
                    </p>
                  </div>
                  <Chip variant="faded" className="text-xs">
                    {resource?.kind}
                  </Chip>
                  <Chip
                    variant="faded"
                    className={`text-xs`}
                    color={colorByStatus(resource?.status)}
                  >
                    {statusText(resource?.status)}
                  </Chip>
                </div>
                {resource?.conditions.map((condition, key) => (
                  <ConditionTag condition={condition} key={key.toString()} />
                ))}
                {renderResourceInfo()}
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  {hasChildren && (
                    <Button
                      variant="light"
                      size="sm"
                      className="h-6 w-6 p-0 mt-1"
                      onPress={() => {
                        setIsExpanded(!isExpanded);
                      }}
                    >
                      <span
                        className={`transform transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                    </Button>
                  )}
                  {!hasChildren && <div className="w-6" />}
                </div>
                <Button
                  variant="light"
                  size="sm"
                  onPress={() =>
                    navigate(`${ROUTES.RESOURCE}/${resource?.uid}`)
                  }
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {hasChildren &&
          isExpanded &&
          !(
            (level > 0 && resource.kind === RESOURCE_TYPE.KUSTOMIZATION) ||
            resource.kind === RESOURCE_TYPE.HELM_RELEASE
          ) && (
            <div className="space-y-2">
              {resource?.children.map((child: KubeResource) => (
                <ResourceTree
                  key={child.uid}
                  resource={child}
                  level={level + 1}
                  onResourceClick={onResourceClick}
                />
              ))}
            </div>
          )}
      </div>
    );
  }
);

export default ResourceTree;
