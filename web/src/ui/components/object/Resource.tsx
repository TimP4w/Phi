import { Card, Avatar, CardBody, Tooltip } from "@heroui/react";
import { Link } from "react-router-dom";
import {
  ResourceStatus,
  VizualizationNodeData,
} from "../../../core/fluxTree/models/tree";
import AppLogo from "../app-logo/AppLogo";
import "./resource.scss";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Resource({ data }: ResourceProps) {
  const treeNode = data.treeNode;

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
    <div>
      <Handle type="target" position={Position.Left} />
      <Tooltip content={treeNode.name} color="primary">
        <Card
          className="w-62 min-h-[72px] max-h-[72px] overflow-y-hidden"
          key={treeNode.uid}
          shadow="none"
        >
          <CardBody>
            <div className="flex">
              <div className="flex gap-3">
                <Avatar
                  isBordered
                  classNames={{
                    base: "bg-transparent",
                    icon: "text-black/80",
                  }}
                  color={colorByStatus(treeNode.status)}
                  icon={<AppLogo kind={treeNode.kind} />}
                />
                <div className="flex flex-col">
                  <Link key={treeNode.uid} to={`/tree/${treeNode.uid}`}>
                    <p className="text-md underline text-ellipsis truncate max-w-[120px]">
                      {treeNode.name}
                    </p>
                  </Link>
                  <p className="text-small text-default-500">{treeNode.kind}</p>
                </div>
              </div>

              {/*<div className="">
              <Dropdown className="dark">
                <DropdownTrigger>
                  <Button color="primary" variant="light" isIconOnly>
                    <FontAwesomeIcon icon="ellipsis-vertical" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Pause/Resume or reconcile flux managed resource"
                  onAction={(k) => action(k as string)}
                >
                  <DropdownItem key="reconcile">Reconcile</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>*/}
            </div>
          </CardBody>
        </Card>
      </Tooltip>
      {treeNode.children.length > 0 ? (
        <Handle type="source" position={Position.Right} />
      ) : null}
    </div>
  );
}

export default Resource;

/*
    <div className="resource">
      <div className="resource__kind-tag">
        <Tag>{treeNode.kind}</Tag>
      </div>
      <Handle type="target" position={Position.Left} />
      <div className="resource__content">
        <div>
          <div className="resource__label-container">
            <span className="resource__name">{treeNode.name}</span>
            <span className="resource__namespace">{treeNode.namespace}</span>
          </div>
        </div>
        <div className="resource__status-container">
          {treeNode.status !== ResourceStatus.UNKNOWN && (
            <>
              <StatusCircle status={treeNode.status} />
            </>
          )}
          {treeNode.isFluxManaged && (
            <>
              <div />
              <div className="resource__flux-managed-tag">
                <Tooltip message="Managed By Flux" />
                <FluxLogo width={50} height={30} />
              </div>
            </>
          )}
        </div>
      </div>

    </div>
    */
