import "./playPause.scss";
import {
  HelmReleaseNode,
  KustomizationNode,
  TreeNode,
} from "../../../core/fluxTree/models/tree";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { reconcileUseCase } from "../../../core/resource/usecases/reconcile.usecase";
import { useCallback, useEffect, useState } from "react";
import { resumeUseCase } from "../../../core/resource/usecases/resume.usecase";
import { suspendUseCase } from "../../../core/resource/usecases/suspend.usecase";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
type PlayPauseProps = {
  node: TreeNode;
};

const PlayPause: React.FC<PlayPauseProps> = ({ node }: PlayPauseProps) => {
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [isSuspended, setIsSuspended] = useState<boolean>(
    (node as KustomizationNode | HelmReleaseNode).fluxMetadata?.isSuspended ??
      false
  );
  const [isReconciling, setIsReconciling] = useState<boolean>(
    (node as KustomizationNode | HelmReleaseNode).fluxMetadata?.isReconciling ??
      false
  );

  useEffect(() => {
    setIsReconciling(
      (node as KustomizationNode | HelmReleaseNode).fluxMetadata
        ?.isReconciling ?? false
    );
  }, [node]);

  const reconcile = useCallback(() => {
    if (isReconciling) return;
    setIsReconciling(true);
    reconcileUseCase.execute(node.uid);
  }, [node, isReconciling]);

  const resume = useCallback(() => {
    setIsToggling(true);
    resumeUseCase
      .execute(node.uid)
      .then(() => {
        setIsSuspended(false);
      })
      .finally(() => setIsToggling(false));
  }, [node]);

  const suspend = useCallback(() => {
    setIsToggling(true);
    suspendUseCase
      .execute(node.uid)
      .then(() => {
        setIsSuspended(true);
      })
      .finally(() => setIsToggling(false));
  }, [node]);

  const toggle = useCallback(() => {
    if (isSuspended) {
      resume();
    } else {
      suspend();
    }
  }, [isSuspended, resume, suspend]);

  const action = useCallback(
    (actionKey: string) => {
      switch (actionKey) {
        case "toggle":
          toggle();
          break;
        case "reconcile":
          reconcile();
          break;
      }
    },
    [reconcile, toggle]
  );

  return (
    <div>
      <Dropdown className="dark">
        <DropdownTrigger>
          <Button color="primary" variant="light" isIconOnly>
            <FontAwesomeIcon icon="ellipsis-vertical" />
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Pause/Resume or reconcile flux managed resource"
          disabledKeys={[
            isReconciling ? "reconcile" : "",
            isToggling ? "toggle" : "",
          ]}
          onAction={(k) => action(k as string)}
        >
          <DropdownItem key="toggle">
            {isSuspended ? "Resume Reconciliation" : "Pause Reconciliation"}
          </DropdownItem>
          <DropdownItem key="reconcile">Reconcile</DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
};

/*
<div className="play-pause__actions">
      <div
        id={`reconcile_${node.uid}`}
        className="play-pause__action-reconcile"
        onClick={reconcile}
      >
        <FontAwesomeIcon
          className={classNames("play-pause__action-reconcile-icon", {
            "play-pause__action-reconcile-icon--reconciling": isReconciling,
          })}
          icon="arrows-rotate"
        />
      </div>

      <div
        id={`resume_${node.uid}`}
        className={classNames("play-pause__action-toggle", {
          "play-pause__action-toggle--suspended": isSuspended,
          "play-pause__action-toggle--active": !isSuspended,
        })}
        onClick={isSuspended ? resume : suspend}
      >
        {isToggling ? (
          <FontAwesomeIcon icon="circle-notch" spin />
        ) : isSuspended ? (
          <FontAwesomeIcon icon="play" />
        ) : (
          <FontAwesomeIcon icon="pause" />
        )}
      </div>
    </div>
    */
export default PlayPause;
