import { observer } from "mobx-react-lite";

import { KubeResource } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  useDisclosure,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ROUTES } from "../../routes/routes.enum";
import { colorByStatus, statusText } from "../../shared/helpers";
import AppLogo from "../resource-icon/ResourceIcon";
import ConditionTag from "../condition-tag/ConditionTag";
import { useNavigate } from "react-router-dom";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";

type ResourceCountWidgetProps = {
  resource?: KubeResource;
  skipGrandChildren?: boolean;
};

const ResourceCountWidget: React.FC<ResourceCountWidgetProps> = observer(
  ({ resource, skipGrandChildren = false }: ResourceCountWidgetProps) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const navigate = useNavigate();

    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    const [failedResources, setFailedResources] = useState<KubeResource[]>([]);
    const [resourceCounts, setResourceCounts] = useState({
      total: 0,
      ready: 0,
      notReady: 0,
      unknown: 0,
    });

    useEffect(() => {
      const failedSet = new Set<string>();
      const newFailed: KubeResource[] = [];

      const countResources = (
        resource: KubeResource | null,
        depth = 0
      ): {
        total: number;
        ready: number;
        notReady: number;
        unknown: number;
      } => {
        if (!resource) {
          return { total: 0, ready: 0, notReady: 0, unknown: 0 };
        }

        let total = 1;
        let ready = resource.status === "success" ? 1 : 0;
        let notReady =
          resource.status !== "success" && resource.status !== "unknown"
            ? 1
            : 0;
        let unknown = resource.status === "unknown" ? 1 : 0;

        const isFailed = notReady === 1;
        if (isFailed && !failedSet.has(resource.uid)) {
          failedSet.add(resource.uid);
          newFailed.push(resource);
        }

        const skipChildren =
          depth > 0 &&
          (resource.kind === RESOURCE_TYPE.KUSTOMIZATION ||
            resource.kind === RESOURCE_TYPE.HELM_RELEASE) &&
          skipGrandChildren;

        if (!skipChildren) {
          for (const child of resource.children || []) {
            const childCounts = countResources(child, depth + 1);
            total += childCounts.total;
            ready += childCounts.ready;
            notReady += childCounts.notReady;
            unknown += childCounts.unknown;
          }
        }

        return { total, ready, notReady, unknown };
      };

      const counts = countResources(resource);
      setResourceCounts(counts);

      setFailedResources(() => newFailed);
    }, [resource, skipGrandChildren]);

    return (
      <Widget span={1} title="Resources" subtitle="Status of all resources">
        <div className="flex flex-col justify-between h-full">
          <div className="space-y-2 text-md">
            <div className="flex justify-between">
              <span className="text-default-400">Total</span>
              <span className="text-foreground">{resourceCounts.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-400">Ready</span>
              <span className="text-green-400">{resourceCounts.ready}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-400">Not Ready</span>
              <span className="text-red-400">{resourceCounts.notReady}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-400">Unknown</span>
              <span className="text-primary-400">{resourceCounts.unknown}</span>
            </div>
          </div>
          {resourceCounts.notReady > 0 && (
            <div className="w-full">
              <Alert color="danger">
                <div className="flex flex-row text-sm">
                  There are {resourceCounts.notReady} Not Ready Resources
                  <Button onPress={onOpen} size="sm">
                    Show
                  </Button>
                  <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="4xl">
                    <ModalContent>
                      {(onClose) => (
                        <>
                          <ModalHeader className="flex flex-col gap-1">
                            Not Ready Resources
                          </ModalHeader>
                          <ModalBody>
                            {failedResources.map((resource) => (
                              <Card
                                className="block w-full items-start border border-default-200"
                                shadow="none"
                              >
                                <CardBody className="flex-1">
                                  <div className="flex justify-between">
                                    <div className="space-y-2">
                                      <div className="flex items-center space-x-2">
                                        <AppLogo kind={resource.kind} />
                                        <div>
                                          <span className="font-md font-bold truncate">
                                            {resource.name}
                                          </span>
                                          <p className="text-sm text-default-400">
                                            {resource.namespace}
                                          </p>
                                        </div>
                                        <Chip
                                          variant="faded"
                                          className="text-xs"
                                        >
                                          {resource.kind}
                                        </Chip>
                                        <Chip
                                          variant="faded"
                                          className={`text-xs`}
                                          color={colorByStatus(resource.status)}
                                        >
                                          {statusText(resource.status)}
                                        </Chip>
                                      </div>
                                      {resource.conditions.map(
                                        (condition, key) => (
                                          <ConditionTag
                                            condition={condition}
                                            key={key.toString()}
                                          />
                                        )
                                      )}
                                    </div>

                                    <div className="flex flex-col justify-between">
                                      <Button
                                        variant="light"
                                        size="sm"
                                        onPress={() =>
                                          navigate(
                                            `${ROUTES.RESOURCE}/${resource.uid}`
                                          )
                                        }
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardBody>
                              </Card>
                            ))}
                          </ModalBody>
                          <ModalFooter>
                            <Button
                              color="danger"
                              variant="light"
                              onPress={onClose}
                            >
                              Close
                            </Button>
                          </ModalFooter>
                        </>
                      )}
                    </ModalContent>
                  </Modal>
                </div>
              </Alert>
            </div>
          )}
        </div>
      </Widget>
    );
  }
);

export default ResourceCountWidget;
