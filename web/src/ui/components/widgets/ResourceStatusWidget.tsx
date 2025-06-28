import { observer } from "mobx-react-lite";

import { KubeResource } from "../../../core/fluxTree/models/tree";
import Widget from "./Widget";
import { Skeleton } from "@heroui/react";
import ConditionTag from "../condition-tag/ConditionTag";
import StatusChip from "../status-chip/StatusChip";
import TooltipedDate from "../tooltiped-date/TooltipedDate";

type ResourceStatusWidgetProps = {
  resource?: KubeResource;
};

const ResourceStatusWidget: React.FC<ResourceStatusWidgetProps> = observer(
  ({ resource }: ResourceStatusWidgetProps) => {
    if (!resource) {
      return (
        <Skeleton className="rounded-lg">
          <div className="h-24 rounded-lg bg-default-300" />
        </Skeleton>
      );
    }

    return (
      <Widget span={2} title="Resource Status" subtitle="">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-default-400">Status</span>
            <StatusChip resource={resource} />
          </div>
          <div className="space-y-2">
            {/* TODO: Hide last sync and suspended if it's not a flux resource */}
            {resource?.conditions.length > 0 && (
              <>
                <span className="text-default-400">Conditions</span>
                <div className="flex flex-col gap-2">
                  {resource?.conditions.map((condition, key) => (
                    <div
                      className="flex flex-row justify-between items-center"
                      key={key.toString()}
                    >
                      <ConditionTag
                        condition={condition}
                        key={key.toString()}
                      />
                      <span className="text-default-400">
                        {condition.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-default-400">Created</span>
            <span>
              <TooltipedDate date={resource?.createdAt} />
            </span>
          </div>
        </div>
      </Widget>
    );
  }
);

export default ResourceStatusWidget;
