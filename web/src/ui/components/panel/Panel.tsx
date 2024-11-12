import { useEffect, useMemo, useRef, useState } from "react";
import "./panel.scss";
import { TreeNode } from "../../../core/fluxTree/models/tree";
import { Tabs, TabsMap } from "../tabs/Tabs";
import { DescribeTab } from "./DescribeTab";
import { EventsTab } from "./EventsTab";
import { InfoTab } from "./InfoTab";
import { LogsTab } from "./LogsTab";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { WebSocketService } from "../../../core/realtime/services/webSocket.service";
import { TYPES } from "../../../core/shared/types";
import { observer } from "mobx-react-lite";
import { watchLogsUseCase } from "../../../core/resource/usecases/watchLogs.usecase";
import { RESOURCE_TYPE } from "../../../core/fluxTree/constants/resources.const";
import classNames from "classnames";
import StatusCircle from "../status-circle/StatusCircle";
import ConditionTag from "../condition-tag/ConditionTag";
import Tag from "../tag/Tag";
import { describeNodeUseCase } from "../../../core/resource/usecases/describeNode.usecase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type PanelProps = {
  isOpen: boolean;
  onClose: () => void;
  node: TreeNode | null;
};

export const Panel = observer(({ isOpen, onClose, node }: PanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fluxTreeStore = useInjection(FluxTreeStore);
  const realtimeService = useInjection<WebSocketService>(TYPES.WebSocket);
  const [describe, setDescribe] = useState("");
  const curentNode = useRef<TreeNode | null>(null);

  useEffect(() => {
    // TODO: refactor this mess
    if (
      node &&
      node.kind === RESOURCE_TYPE.POD &&
      (!fluxTreeStore.selectedNode ||
        node.uid !== fluxTreeStore.selectedNode.uid)
    ) {
      fluxTreeStore.setSelectedNode(node);
      watchLogsUseCase.execute(node);
    }

    const fetchYAML = async () => {
      if (!node || curentNode.current?.uid === node.uid) {
        return;
      }
      const describe = await describeNodeUseCase.execute(node.uid);
      curentNode.current = node;
      setDescribe(describe);
    };

    if (node) {
      fetchYAML();
    }
  }, [node, fluxTreeStore, realtimeService]);

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as HTMLDivElement)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const tabsMap = useMemo(() => {
    const map: TabsMap = {};

    map["Info"] = <InfoTab node={node} />;
    map["Events"] = <EventsTab node={node} />;
    map["Describe"] = <DescribeTab describe={describe} />;
    if (node && node.kind === RESOURCE_TYPE.POD) {
      map["Logs"] = <LogsTab />;
    }

    return map;
  }, [node, describe]);

  const closePanel = () => {
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className={classNames("panel", {
        "panel--open": isOpen,
        "panel--closed": !isOpen,
      })}
    >
      <div className="panel__header-bar">
        <FontAwesomeIcon
          className="panel__close-icon"
          onClick={() => closePanel()}
          size="2x"
          icon={"xmark"}
        />
      </div>
      <div className="panel__content">
        <div className="panel__label-container">
          {node && <StatusCircle status={node.status} />}
          <span className="panel__node-name">{node?.name}</span>
          <Tag>{node?.kind}</Tag>
        </div>
      </div>
      <div className="panel__conditions">
        {node?.conditions.map((condition, index) => (
          <ConditionTag
            key={index.toString()}
            nodeId={node.uid}
            condition={condition}
          />
        ))}
      </div>
      <div className="panel__tabs">
        <Tabs tabs={tabsMap}></Tabs>
      </div>
    </div>
  );
});
