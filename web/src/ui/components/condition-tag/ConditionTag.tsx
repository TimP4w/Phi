import { Condition } from "../../../core/fluxTree/models/tree";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  SUCCESS_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { stringToEnum } from "../../../core/shared/enum.utils";
import { ICONS } from "../../shared/icons";
import { Chip, Tooltip } from "@heroui/react";

type ConditionTagProps = {
  condition: Condition;
  key: string;
} & React.HTMLAttributes<HTMLDivElement>;

const ConditionTag: React.FC<ConditionTagProps> = ({
  condition,
  key,
}: ConditionTagProps) => {
  const [icon, setIcon] = useState<string>("circle-info");
  const [color, setColor] = useState<
    "default" | "success" | "danger" | "primary" | "warning"
  >("default");

  useEffect(() => {
    // TODO: refactor this mess. This is just to try out various combinations, however it should be refactored
    // TODO: add drift detection ("Detecting drift for revision main@sha1:eb1924807d53b21a766e6dd8b51e51fb0a8b37aa with a timeout of 10m0s")
    const conditionType = stringToEnum(CONDITION_TYPE, condition.type);

    if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
      if (condition.status) {
        setIcon(ICONS.SUCCESS);
        setColor("success");
        return;
      }
      setIcon(ICONS.ERROR);
      setColor("danger");
      return;
    }

    /*
    if (conditionType && INFO_TYPES.includes(conditionType)) {
      if (condition.status) {
        setIcon(ICONS.INFO);
        setColor(COLORS.INFO);
        return;
      }
      setIcon(ICONS.ERROR);
      setColor(COLORS.ERROR);
      return;
    } */

    if (conditionType && ERROR_TYPES.includes(conditionType)) {
      setIcon(ICONS.ERROR);
      setColor("danger");
      return;
    }

    // TODO: move to a separate const
    const failingReasons = [
      "BuildFailed",
      "Failed",
      "Error",
      "Invalid",
      "HealthCheckFailed",
      "StateError",
      "UpgradeFailed",
      "ReconciliationFailed",
    ];

    const warningReasons = [
      "ProgressingWithRetry",
      "Progressing",
      "DependencyNotReady",
    ];

    const successReasons = [
      "UpgradeSucceeded",
      "ChartPullSucceeded",
      "ReconciliationSucceeded",
      "Succeeded",
    ];

    if (failingReasons.includes(condition.reason)) {
      setIcon(ICONS.ERROR);
      setColor("danger");
      return;
    }

    if (warningReasons.includes(condition.reason)) {
      setIcon(ICONS.WARNING); // TODO: warning icon
      setColor("warning");
      return;
    }

    if (successReasons.includes(condition.reason)) {
      setIcon(ICONS.SUCCESS);
      setColor("success");
      return;
    }

    setIcon(ICONS.INFO);
    setColor("default");
  }, [condition]);

  return (
    <Tooltip content={condition.message} className="dark">
      <Chip
        key={key}
        color={color}
        startContent={<FontAwesomeIcon icon={icon as IconProp} size={"1x"} />}
        variant="faded"
      >
        {condition.type}
      </Chip>
    </Tooltip>
  );
};

/*
*

    <div key={key} className="condition-tag">
      <Tooltip message={condition.message} />
      {<FontAwesomeIcon icon={icon as IconProp} size={"1x"} color={color} />}
      <span className="condition-tag__type" style={{ color: color }}>
        {condition.type}
      </span>
    </div>

    */

export default ConditionTag;
