import { reaction } from "mobx";
import { useEffect } from "react";
import { KubeResource } from "../fluxTree/models/tree";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../fluxTree/stores/fluxTree.store";

export function useSubtreeUpdates(rootNode?: KubeResource, onChange: () => void) {
  const fluxTreeStore = useInjection(FluxTreeStore);

  useEffect(() => {
    if (!rootNode) {
      console.warn("useSubtreeUpdates: rootNode is undefined");
      return;
    }
    const disposer = reaction(
      () => fluxTreeStore.tree.getSubtreeSnapshot(rootNode),
      () => onChange()
    );
    return () => disposer();
  }, [fluxTreeStore.tree, onChange, rootNode]);
}
