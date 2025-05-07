import { useEffect, useState } from "react";

import { Alert } from "@heroui/react";
import {
  CONDITION_TYPE,
  SUCCESS_TYPES,
  ERROR_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { Condition } from "../../../core/fluxTree/models/tree";
import { stringToEnum } from "../../../core/shared/enum.utils";
import { ICONS } from "../../shared/icons";

type ConditionAlertProps = {
  condition: Condition;
  key: string;
} & React.HTMLAttributes<HTMLDivElement>;

const ConditionAlert: React.FC<ConditionAlertProps> = ({
  condition,
  key,
}: ConditionAlertProps) => {
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

    const failingReasons = [
      "BuildFailed",
      "Failed",
      "Error",
      "Invalid",
      "HealthCheckFailed",
      "StateError",
      "UpgradeFailed",
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
    <Alert
      color={color}
      description={condition.message}
      title={condition.reason}
    />
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

export default ConditionAlert;
