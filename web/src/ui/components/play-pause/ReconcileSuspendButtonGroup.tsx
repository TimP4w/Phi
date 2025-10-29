import {
  FluxResource,
  HelmRelease,
  Kustomization,
} from "../../../core/fluxTree/models/tree";
import { reconcileUseCase } from "../../../core/resource/usecases/reconcile.usecase";
import { useCallback, useEffect, useState } from "react";
import { resumeUseCase } from "../../../core/resource/usecases/resume.usecase";
import { suspendUseCase } from "../../../core/resource/usecases/suspend.usecase";
import { Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";

type ReconcileSuspendButtonGroupProps = {
  resource: FluxResource;
};

const ReconcileSuspendButtonGroup: React.FC<
  ReconcileSuspendButtonGroupProps
> = ({ resource }: ReconcileSuspendButtonGroupProps) => {
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [isSuspended, setIsSuspended] = useState<boolean>(
    (resource as Kustomization | HelmRelease).isSuspended ?? false
  );
  const [isReconciling, setIsReconciling] = useState<boolean>(
    (resource as Kustomization | HelmRelease).isReconciling ?? false
  );

  useEffect(() => {
    setIsReconciling(
      (resource as Kustomization | HelmRelease).isReconciling ?? false
    );
  }, [resource]);

  useEffect(() => {
    setIsSuspended(
      (resource as Kustomization | HelmRelease).isSuspended ?? false
    );
  }, [resource]);

  const reconcile = useCallback(() => {
    if (isReconciling) return;
    setIsReconciling(true);
    reconcileUseCase.execute(resource.uid);
  }, [resource, isReconciling]);

  const resume = useCallback(() => {
    setIsToggling(true);
    resumeUseCase
      .execute(resource.uid)
      .then(() => {
        setIsSuspended(false);
      })
      .finally(() => setIsToggling(false));
  }, [resource]);

  const suspend = useCallback(() => {
    setIsToggling(true);
    suspendUseCase
      .execute(resource.uid)
      .then(() => {
        setIsSuspended(true);
      })
      .finally(() => setIsToggling(false));
  }, [resource]);

  const toggle = useCallback(() => {
    if (isSuspended) {
      resume();
    } else {
      suspend();
    }
  }, [isSuspended, resume, suspend]);

  return (
    <div className="flex gap-2 w-full">
      <Button
        size="sm"
        variant="flat"
        className={`w-full ${
          !isReconciling && !isSuspended
            ? "hover:bg-primary-400"
            : "cursor-not-allowed"
        }`}
        disabled={isReconciling || isSuspended}
        onPress={reconcile}
        isLoading={isReconciling}
        startContent={
          isReconciling ? null : <RefreshCw className="w-3 h-3 mr-1" />
        }
      >
        Reconcile
      </Button>
      <Button
        size="sm"
        variant={isSuspended ? "solid" : "flat"}
        className={`w-full ${
          isSuspended ? "hover:bg-green-600" : "hover:bg-red-600"
        }`}
        onPress={toggle}
        isLoading={isToggling}
      >
        {isSuspended ? "Resume" : "Suspend"}
      </Button>
    </div>
  );
};

export default ReconcileSuspendButtonGroup;
