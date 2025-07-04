import { reaction } from "mobx";
import { useEffect } from "react";
import { KubeResource } from "../fluxTree/models/tree";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../fluxTree/stores/fluxTree.store";

export function useResourceUpdate(resource?: KubeResource, onChange: () => void) {
  const fluxTreeStore = useInjection(FluxTreeStore);

  useEffect(() => {
    if (!resource) {
      console.warn("useResourceUpdate: resource is undefined");
      return;
    }
    const disposer = reaction(
      () => resource.lastUpdatedAt,
      () => onChange()
    );
    return () => disposer();
  }, [fluxTreeStore.tree, onChange, resource]);
}
