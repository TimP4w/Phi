import { Condition } from "../../../core/fluxTree/models/tree";
import { useEffect, useState } from "react";
import { DynamicIcon, IconName } from "lucide-react/dynamic";

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
}: ConditionTagProps) => {
  const [icon, setIcon] = useState<IconName>(ICONS.INFO);
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
      setIcon(ICONS.WARNING);
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
      "URLInvalid",
      "AuthenticationFailed",
      "VerificationError",
      "DirectoryCreationFailed",
      "StatOperationFailed",
      "ReadOperationFailed",
      "AcquireLockFailed",
      "InvalidPath",
      "ArchiveOperationFailed",
      "SymlinkUpdateFailed",
      "CacheOperationFailed",
      "PatchOperationFailed",
      "InvalidSTSConfiguration",
      "InvalidProviderConfiguration",
      "RollbackFailed",
    ];

    const warningReasons = [
      "ProgressingWithRetry",
      "Progressing",
      "DependencyNotReady",
      "MinimumReplicasUnavailable",
      "ContainersNotReady",
    ];

    const successReasons = [
      "InstallSucceeded",
      "UpgradeSucceeded",
      "ChartPullSucceeded",
      "ReconciliationSucceeded",
      "Succeeded",
      "ArtifactUpToDate",
      "NewReplicaSetAvailable",
    ];

    if (failingReasons.includes(condition.reason)) {
      setIcon(ICONS.WARNING);
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
