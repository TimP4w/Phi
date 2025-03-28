import {
  Card,
  Avatar,
  CardBody,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Tabs,
  Tab,
} from "@heroui/react";
import { Link } from "react-router-dom";
import { ResourceStatus, TreeNode } from "../../../core/fluxTree/models/tree";
import AppLogo from "../app-logo/AppLogo";
import { InfoTab } from "../panel/InfoTab";
import { EventsTab } from "../panel/EventsTab";
import { DescribeTab } from "../panel/DescribeTab";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import { LogsTab } from "../panel/LogsTab";

type ResourceDrawerProps = {
  onOpenChange: () => void;
  isOpen: boolean;
  node?: TreeNode;
  describe?: string;
};

function ResourceDrawer({
  node,
  onOpenChange,
  isOpen,
  describe,
}: ResourceDrawerProps) {
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
    <Drawer
      isOpen={isOpen}
      size={"5xl"}
      onOpenChange={onOpenChange}
      className="dark"
    >
      <DrawerContent>
        {node && (
          <>
            <DrawerHeader className="flex flex-col gap-1">
              <div className="flex gap-3">
                <Avatar
                  isBordered
                  classNames={{
                    base: "bg-transparent",
                    icon: "text-black/80",
                  }}
                  color={colorByStatus(node.status)}
                  icon={<AppLogo kind={node.kind} />}
                />
                <div className="flex flex-col">
                  <Link key={node.uid} to={`/tree/${node.uid}`}>
                    <p className="text-md underline">{node.name}</p>
                  </Link>
                  <p className="text-small text-default-500">{node.kind}</p>
                </div>
              </div>
            </DrawerHeader>
            <DrawerBody>
              <Tabs aria-label="Options">
                <Tab key="infos" title="Info">
                  <Card>
                    <CardBody>
                      <InfoTab node={node} />
                    </CardBody>
                  </Card>
                </Tab>
                <Tab key="events" title="Events">
                  <Card>
                    <CardBody>
                      <EventsTab node={node} />
                    </CardBody>
                  </Card>
                </Tab>
                <Tab key="describe" title="Describe">
                  <Card>
                    <CardBody>
                      <DescribeTab describe={describe} />
                    </CardBody>
                  </Card>
                </Tab>
                {node && node.kind === RESOURCE_TYPE.POD && (
                  <Tab key="logs" title="Pod logs">
                    <Card>
                      <CardBody>
                        <LogsTab />
                      </CardBody>
                    </Card>
                  </Tab>
                )}
              </Tabs>
            </DrawerBody>
            <DrawerFooter></DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default ResourceDrawer;
