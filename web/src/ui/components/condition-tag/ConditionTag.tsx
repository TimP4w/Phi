import { Condition } from "../../../core/fluxTree/models/tree";
import { useEffect, useState } from "react";
import { DynamicIcon, IconName } from "lucide-react/dynamic";

import {
  CONDITION_TYPE,
  ERROR_TYPES,
  FAILING_REASONS,
  SUCCESS_REASONS,
  SUCCESS_TYPES,
  WARNING_REASONS,
} from "../../../core/fluxTree/constants/conditions.const";
import { isEnumValue } from "../../../core/shared/enum.utils";
import { ICONS } from "../../shared/icons";
import { Chip, Tooltip } from "@heroui/react";

type ChipColor = "default" | "success" | "danger" | "primary" | "warning";

type ConditionTagProps = {
  condition: Condition;
  key: string;
} & React.HTMLAttributes<HTMLDivElement>;

function getConditionDisplay(condition: Condition): {
  icon: IconName;
  color: ChipColor;
} {
  const conditionType = isEnumValue(CONDITION_TYPE, condition.type)
    ? condition.type
    : undefined;

  if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
    if (condition.status) {
      return { icon: ICONS.SUCCESS, color: "success" };
    }
    return { icon: ICONS.WARNING, color: "danger" };
  }

  if (conditionType && ERROR_TYPES.includes(conditionType)) {
    return { icon: ICONS.ERROR, color: "danger" };
  }

  if (FAILING_REASONS.includes(condition.reason)) {
    return { icon: ICONS.WARNING, color: "danger" };
  }

  if (WARNING_REASONS.includes(condition.reason)) {
    return { icon: ICONS.WARNING, color: "warning" };
  }

  if (SUCCESS_REASONS.includes(condition.reason)) {
    return { icon: ICONS.SUCCESS, color: "success" };
  }

  return { icon: ICONS.INFO, color: "default" };
}

const ConditionTag: React.FC<ConditionTagProps> = ({
  condition,
}: ConditionTagProps) => {
  const [icon, setIcon] = useState<IconName>(ICONS.INFO);
  const [color, setColor] = useState<ChipColor>("default");

  useEffect(() => {
    const { icon, color } = getConditionDisplay(condition);
    setIcon(icon);
    setColor(color);
  }, [condition]);

  return (
    <Tooltip content={condition.message} className="dark">
      <Chip
        color={color}
        startContent={<DynamicIcon name={icon} size={16} />}
        variant="faded"
      >
        {condition.type}
      </Chip>
    </Tooltip>
  );
};

export default ConditionTag;
