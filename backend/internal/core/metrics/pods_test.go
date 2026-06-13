package metrics_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/metrics"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func res(uid, kind string, parents ...string) *kube.Resource {
	return &kube.Resource{UID: uid, Kind: kind, Name: "n-" + uid, Namespace: "ns", ParentIDs: parents}
}

func storeWith(t *testing.T, all map[string]*kube.Resource, root *kube.Resource) *mocks.KubeStore {
	s := mocks.NewKubeStore(t)
	s.On("GetResourceByUID", root.UID).Return(root)
	s.On("GetResources").Return(all).Maybe()
	return s
}

func TestCollectPodsReturnsPodItself(t *testing.T) {
	p := res("p1", "Pod")
	s := mocks.NewKubeStore(t)
	s.On("GetResourceByUID", "p1").Return(p)

	pods, err := metrics.CollectPods(s, "p1")
	assert.NoError(t, err)
	assert.Len(t, pods, 1)
	assert.Equal(t, "p1", pods[0].UID)
}

func TestCollectPodsWalksDescendants(t *testing.T) {
	// ks -> deploy -> rs -> pod1, pod2 ; unrelated pod3
	ks := res("ks", "Kustomization")
	all := map[string]*kube.Resource{
		"ks":   ks,
		"dep":  res("dep", "Deployment", "ks"),
		"rs":   res("rs", "ReplicaSet", "dep"),
		"pod1": res("pod1", "Pod", "rs"),
		"pod2": res("pod2", "Pod", "rs"),
		"pod3": res("pod3", "Pod", "other"),
	}
	pods, err := metrics.CollectPods(storeWith(t, all, ks), "ks")
	assert.NoError(t, err)
	uids := []string{}
	for _, p := range pods {
		uids = append(uids, p.UID)
	}
	assert.ElementsMatch(t, []string{"pod1", "pod2"}, uids)
}

func TestCollectPodsSurvivesCycles(t *testing.T) {
	a := res("a", "Kustomization", "b")
	all := map[string]*kube.Resource{
		"a":   a,
		"b":   res("b", "Deployment", "a"), // cycle a<->b
		"pod": res("pod", "Pod", "b"),
	}
	pods, err := metrics.CollectPods(storeWith(t, all, a), "a")
	assert.NoError(t, err)
	assert.Len(t, pods, 1)
}

func TestCollectPodsUnknownUID(t *testing.T) {
	s := mocks.NewKubeStore(t)
	s.On("GetResourceByUID", "nope").Return((*kube.Resource)(nil))
	_, err := metrics.CollectPods(s, "nope")
	assert.ErrorIs(t, err, kube.ErrNotFound)
}

func TestCollectPodsNoPodsReturnsErrNoPods(t *testing.T) {
	dep := res("dep", "Deployment")
	all := map[string]*kube.Resource{"dep": dep}
	pods, err := metrics.CollectPods(storeWith(t, all, dep), "dep")
	assert.ErrorIs(t, err, metrics.ErrNoPods)
	assert.Empty(t, pods)
}

func TestCollectPVCsWalksDescendants(t *testing.T) {
	// ks -> deploy -> pvc1 ; ks -> sts -> pvc2 ; unrelated pvc3
	ks := res("ks", "Kustomization")
	all := map[string]*kube.Resource{
		"ks":   ks,
		"dep":  res("dep", "Deployment", "ks"),
		"pvc1": res("pvc1", "PersistentVolumeClaim", "dep"),
		"sts":  res("sts", "StatefulSet", "ks"),
		"pvc2": res("pvc2", "PersistentVolumeClaim", "sts"),
		"pvc3": res("pvc3", "PersistentVolumeClaim", "other"),
	}
	pvcs := metrics.CollectPVCs(storeWith(t, all, ks), "ks")
	uids := []string{}
	for _, p := range pvcs {
		uids = append(uids, p.UID)
	}
	assert.ElementsMatch(t, []string{"pvc1", "pvc2"}, uids)
}

func TestCollectPVCsNoneReturnsEmpty(t *testing.T) {
	dep := res("dep", "Deployment")
	all := map[string]*kube.Resource{"dep": dep}
	pvcs := metrics.CollectPVCs(storeWith(t, all, dep), "dep")
	assert.Empty(t, pvcs)
}

func TestCollectPVCsUnknownUID(t *testing.T) {
	s := mocks.NewKubeStore(t)
	s.On("GetResourceByUID", "nope").Return((*kube.Resource)(nil))
	assert.Nil(t, metrics.CollectPVCs(s, "nope"))
}
