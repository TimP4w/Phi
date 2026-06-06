import {
  FluxResource,
  HelmRelease,
  Kustomization,
} from "../../../core/fluxTree/models/tree";
import { useCallback, useEffect, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { useInjection } from "inversify-react";
import { TYPES } from "../../../core/shared/types";
import { ReconcileUseCase } from "../../../core/resource/usecases/reconcile.usecase";
import { ResumeUseCase } from "../../../core/resource/usecases/resume.usecase";
import { SuspendUseCase } from "../../../core/resource/usecases/suspend.usecase";

type ReconcileSuspendButtonGroupProps = {
  resource: FluxResource;
  compact?: boolean;
};

const ReconcileSuspendButtonGroup: React.FC<ReconcileSuspendButtonGroupProps> =
  ({ resource, compact = false }: ReconcileSuspendButtonGroupProps) => {
    const reconcileUseCase = useInjection<ReconcileUseCase>(TYPES.ReconcileUseCase);
    const resumeUseCase = useInjection<ResumeUseCase>(TYPES.ResumeUseCase);
    const suspendUseCase = useInjection<SuspendUseCase>(TYPES.SuspendUseCase);

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
      reconcileUseCase
        .execute(resource.uid)
        .catch(() => setIsReconciling(false));
    }, [resource, isReconciling, reconcileUseCase]);

    const resume = useCallback(() => {
      setIsToggling(true);
      resumeUseCase
        .execute(resource.uid)
        .then(() => setIsSuspended(false))
        .finally(() => setIsToggling(false));
    }, [resource, resumeUseCase]);

    const suspend = useCallback(() => {
      setIsToggling(true);
      suspendUseCase
        .execute(resource.uid)
        .then(() => setIsSuspended(true))
        .finally(() => setIsToggling(false));
    }, [resource, suspendUseCase]);

    const toggle = useCallback(() => {
      if (isSuspended) resume();
      else suspend();
    }, [isSuspended, resume, suspend]);

    if (compact) {
      return (
        <div className="flex gap-1.5">
          <Tooltip content="Reconcile" className="dark">
            <Button
              size="sm"
              isIconOnly
              variant="flat"
              isDisabled={isReconciling || isSuspended}
              onPress={reconcile}
              isLoading={isReconciling}
            >
              {!isReconciling && <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </Tooltip>
          <Tooltip
            content={isSuspended ? "Resume" : "Suspend"}
            className="dark"
          >
            <Button
              size="sm"
              isIconOnly
              variant={isSuspended ? "solid" : "flat"}
              onPress={toggle}
              isLoading={isToggling}
            >
              {!isToggling &&
                (isSuspended ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                ))}
            </Button>
          </Tooltip>
        </div>
      );
    }

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
