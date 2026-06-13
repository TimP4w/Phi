package metrics

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

// CollectPods resolves a resource UID to the set of Pods it covers: the
// resource itself if it is a Pod, otherwise every Pod reachable through
// ParentIDs child links (BFS, cycle-safe). Returns ErrNoPods when the resource
// has no pod descendants — never an empty slice, because an empty pod set fed
// into BuildPodMatcher would produce an all-matching selector.
func CollectPods(store kube.KubeStore, uid string) ([]kube.Resource, error) {
	root := store.GetResourceByUID(uid)
	if root == nil {
		return nil, kube.ErrNotFound
	}
	if root.Kind == "Pod" {
		return []kube.Resource{*root}, nil
	}

	children := map[string][]*kube.Resource{}
	for _, r := range store.GetResources() {
		for _, pid := range r.ParentIDs {
			children[pid] = append(children[pid], r)
		}
	}

	var pods []kube.Resource
	visited := map[string]bool{uid: true}
	queue := []string{uid}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, c := range children[cur] {
			if visited[c.UID] {
				continue
			}
			visited[c.UID] = true
			if c.Kind == "Pod" {
				pods = append(pods, *c)
			}
			queue = append(queue, c.UID)
		}
	}
	if len(pods) == 0 {
		return nil, ErrNoPods
	}
	return pods, nil
}

// CollectPVCs resolves a resource UID to the set of PersistentVolumeClaims it
// covers: every PVC reachable through ParentIDs child links (BFS, cycle-safe).
// Unlike CollectPods it returns a (possibly empty) slice rather than an error
// when none are found — a resource with no claims simply contributes no storage.
func CollectPVCs(store kube.KubeStore, uid string) []kube.Resource {
	root := store.GetResourceByUID(uid)
	if root == nil {
		return nil
	}

	children := map[string][]*kube.Resource{}
	for _, r := range store.GetResources() {
		for _, pid := range r.ParentIDs {
			children[pid] = append(children[pid], r)
		}
	}

	var pvcs []kube.Resource
	visited := map[string]bool{uid: true}
	queue := []string{uid}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, c := range children[cur] {
			if visited[c.UID] {
				continue
			}
			visited[c.UID] = true
			if c.Kind == "PersistentVolumeClaim" {
				pvcs = append(pvcs, *c)
			}
			queue = append(queue, c.UID)
		}
	}
	return pvcs
}
