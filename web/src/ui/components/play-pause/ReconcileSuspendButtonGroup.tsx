import {
  FluxResource,
  HelmRelease,
  Kustomization,
} from "../../../core/fluxTree/models/tree";
import { useCallback, useEffect, useState } from "react";
import { Button, Spinner, Tooltip } from "@heroui/react";
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
          <Tooltip>
            <Button
              size="sm"
              isIconOnly
              variant="ghost"
              className="rounded-lg"
              isDisabled={isReconciling || isSuspended}
              onPress={reconcile}
            >
              {isReconciling ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
            <Tooltip.Content>Reconcile</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              size="sm"
              isIconOnly
              variant={isSuspended ? "secondary" : "ghost"}
              className="rounded-lg"
              onPress={toggle}
            >
              {isToggling ? (
                <Spinner size="sm" />
              ) : isSuspended ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
            </Button>
            <Tooltip.Content>
              {isSuspended ? "Resume" : "Suspend"}
            </Tooltip.Content>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="flex gap-2 w-full">
        <Button
          size="sm"
          variant="secondary"
          className={`w-full ${
            !isReconciling && !isSuspended
              ? "hover:bg-accent"
              : "cursor-not-allowed"
          }`}
          isDisabled={isReconciling || isSuspended}
          onPress={reconcile}
        >
          {isReconciling ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1" />
          )}
          Reconcile
        </Button>
        <Button
          size="sm"
          variant={isSuspended ? "primary" : "secondary"}
          className={`w-full ${
            isSuspended ? "hover:bg-green-600" : "hover:bg-red-600"
          }`}
          onPress={toggle}
        >
          {isToggling ? (
            <Spinner size="sm" />
          ) : isSuspended ? (
            "Resume"
          ) : (
            "Suspend"
          )}
        </Button>
      </div>
    );
  };

export default ReconcileSuspendButtonGroup;
