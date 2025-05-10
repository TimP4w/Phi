import { useEffect, useState } from "react";

import { Alert } from "@heroui/react";
import {
  CONDITION_TYPE,
  SUCCESS_TYPES,
  ERROR_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { Condition } from "../../../core/fluxTree/models/tree";
import { stringToEnum } from "../../../core/shared/enum.utils";

type ConditionAlertProps = {
  condition: Condition;
  key: string;
} & React.HTMLAttributes<HTMLDivElement>;

const ConditionAlert: React.FC<ConditionAlertProps> = ({
  condition,
}: ConditionAlertProps) => {
  const [color, setColor] = useState<
    "default" | "success" | "danger" | "primary" | "warning"
  >("default");

  useEffect(() => {
    // TODO: refactor this mess. This is just to try out various combinations, however it should be refactored
    // TODO: add drift detection ("Detecting drift for revision main@sha1:eb1924807d53b21a766e6dd8b51e51fb0a8b37aa with a timeout of 10m0s")
    const conditionType = stringToEnum(CONDITION_TYPE, condition.type);

    if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
      if (condition.status) {
        setColor("success");
        return;
      }
      setColor("danger");
      return;
    }

    if (conditionType && ERROR_TYPES.includes(conditionType)) {
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
      setColor("danger");
      return;
    }

    if (warningReasons.includes(condition.reason)) {
      setColor("warning");
      return;
    }

    if (successReasons.includes(condition.reason)) {
      setColor("success");
      return;
    }

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

export default ConditionAlert;
