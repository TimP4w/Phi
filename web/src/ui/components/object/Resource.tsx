import { Card, Avatar, CardBody, Tooltip } from "@heroui/react";
import { Link } from "react-router-dom";
import { VizualizationNodeData } from "../../../core/fluxTree/models/tree";
import AppLogo from "../resource-icon/ResourceIcon";
import "./resource.scss";
import { Handle, NodeProps, Position, Node } from "@xyflow/react";
import { ROUTES } from "../../routes/routes.enum";
import { colorByStatus } from "../../shared/helpers";

type ResourceProps = NodeProps<Node<VizualizationNodeData>>;

function Resource({ data }: ResourceProps) {
  const treeNode = data.treeNode;

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
                  <Link
                    key={treeNode.uid}
                    to={`${ROUTES.RESOURCE}/${treeNode.uid}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-gray-300 hover:scale-105 hover:underline transition-transform duration-150"
                  >
                    <p className="text-md text-ellipsis truncate max-w-[120px]">
                      {treeNode.name}
                    </p>
                  </Link>
                  <p className="text-small text-default-500">{treeNode.kind}</p>
                </div>
              </div>
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
