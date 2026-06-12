package kubernetes

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/types"
)

func makeResource(uid, name, namespace, kind, version, group string) Resource {
	return Resource{
		UID:        uid,
		Name:       name,
		Namespace:  namespace,
		Kind:       kind,
		Version:    version,
		Group:      group,
		Resource:   kind,
		Labels:     map[string]string{},
		Conditions: []Condition{},
		ParentRefs: []string{},
	}
}

func newStore() *KubeStoreImpl {
	return NewKubeStoreImpl().(*KubeStoreImpl)
}

// ── GetResourceByUID ─────────────────────────────────────────────────────────

func TestKubeStore_GetResourceByUID_Found(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "nginx", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	got := s.GetResourceByUID("uid-1")
	require.NotNil(t, got)
	assert.Equal(t, "uid-1", got.UID)
	assert.Equal(t, "nginx", got.Name)
}

func TestKubeStore_GetResourceByUID_NotFound(t *testing.T) {
	s := newStore()
	assert.Nil(t, s.GetResourceByUID("missing"))
}

// ── UpdateResource ────────────────────────────────────────────────────────────

func TestKubeStore_UpdateResource_NewResource(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "my-pod", "default", "Pod", "v1", "")

	got := s.UpdateResource(res)

	require.NotNil(t, got)
	assert.Equal(t, "uid-1", got.UID)
	assert.NotNil(t, s.GetResourceByUID("uid-1"))
}

func TestKubeStore_UpdateResource_ExistingResource(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "old-name", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	updated := makeResource("uid-1", "new-name", "default", "Pod", "v1", "")
	s.UpdateResource(updated)

	got := s.GetResourceByUID("uid-1")
	require.NotNil(t, got)
	assert.Equal(t, "new-name", got.Name)
}

// ── RemoveResource ────────────────────────────────────────────────────────────

func TestKubeStore_RemoveResource_Existing(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	s.RemoveResource("uid-1")

	assert.Nil(t, s.GetResourceByUID("uid-1"))
}

func TestKubeStore_RemoveResource_NonExistent(t *testing.T) {
	s := newStore()
	// must not panic
	assert.NotPanics(t, func() {
		s.RemoveResource("does-not-exist")
	})
}

// ── GetResources ──────────────────────────────────────────────────────────────

func TestKubeStore_GetResources(t *testing.T) {
	s := newStore()
	r := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(r)

	all := s.GetResources()

	assert.Len(t, all, 1)
	got := all["uid-1"]
	assert.Equal(t, "uid-1", got.UID)
}

func TestKubeStore_GetResources_ReturnsCopy(t *testing.T) {
	s := newStore()
	r := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(r)

	all := s.GetResources()
	tampered := Resource{Name: "tampered"}
	all["uid-1"] = &tampered

	// Original must be unaffected
	assert.Equal(t, "pod", s.GetResourceByUID("uid-1").Name)
}

// ── FindChildrenResourcesByRef ────────────────────────────────────────────────

func TestKubeStore_FindChildrenResourcesByRef_Found(t *testing.T) {
	s := newStore()

	// Parent resource
	parent := makeResource("ks-uid", "my-ks", "flux-system", "Kustomization", "v1", "kustomize.toolkit.fluxcd.io")
	s.UpdateResource(parent)

	// Child with Kustomization label pointing at parent
	child := makeResource("pod-uid", "nginx", "default", "Pod", "v1", "")
	child.Labels = map[string]string{
		KustomizationNameLabel:      "my-ks",
		KustomizationNamespaceLabel: "flux-system",
	}
	s.UpdateResource(child)

	parentRef := parent.GetRef()
	children := s.FindChildrenResourcesByRef(parentRef)

	assert.Len(t, children, 1)
	assert.Equal(t, "pod-uid", children[0].UID)
}

func TestKubeStore_FindChildrenResourcesByRef_NotFound(t *testing.T) {
	s := newStore()
	children := s.FindChildrenResourcesByRef("nonexistent/ref")
	assert.Nil(t, children)
}

// ── Flux label registration ──────────────────────────────────────────────────

func TestKubeStore_UpdateResource_WithKustomizationLabel(t *testing.T) {
	s := newStore()
	res := Resource{
		UID:       "uid-1",
		Name:      "nginx",
		Namespace: "default",
		Kind:      "Pod",
		Version:   "v1",
		Labels: map[string]string{
			KustomizationNameLabel:      "my-ks",
			KustomizationNamespaceLabel: "flux-system",
		},
		ParentRefs: []string{},
	}

	s.UpdateResource(res)

	// IsFluxManaged should be set on the stored resource
	assert.True(t, s.GetResourceByUID("uid-1").IsFluxManaged)
}

func TestKubeStore_UpdateResource_WithHelmLabel(t *testing.T) {
	s := newStore()
	res := Resource{
		UID:       "uid-2",
		Name:      "app",
		Namespace: "default",
		Kind:      "Deployment",
		Version:   "apps/v1",
		Labels: map[string]string{
			HelmNameLabel:      "my-release",
			HelmNamespaceLabel: "default",
		},
		ParentRefs: []string{},
	}

	s.UpdateResource(res)

	assert.True(t, s.GetResourceByUID("uid-2").IsFluxManaged)
}

// ── Out-of-order parent arrival ───────────────────────────────────────────────

func TestKubeStore_UpdateResource_ParentArrivesAfterChild_BackfillsParentIDs(t *testing.T) {
	s := newStore()

	// Child arrives first (informers deliver resources in arbitrary order)
	child := makeResource("pod-uid", "nginx", "default", "Pod", "v1", "")
	child.Labels = map[string]string{
		KustomizationNameLabel:      "my-ks",
		KustomizationNamespaceLabel: "flux-system",
	}
	s.UpdateResource(child)
	assert.Empty(t, s.GetResourceByUID("pod-uid").ParentIDs)

	// Parent arrives later
	parent := makeResource("ks-uid", "my-ks", "flux-system", "Kustomization", "v1", "kustomize.toolkit.fluxcd.io")
	s.UpdateResource(parent)

	assert.Equal(t, []string{"ks-uid"}, s.GetResourceByUID("pod-uid").ParentIDs)
	children := s.FindChildrenResourcesByRef(parent.GetRef())
	assert.Len(t, children, 1)
	assert.Equal(t, "pod-uid", children[0].UID)
}

func TestKubeStore_AddResourceToRef_KeepsOwnerReferenceParentIDs(t *testing.T) {
	s := newStore()

	// Child carries owner-reference UIDs from the mapper plus a flux label;
	// registering the flux ref must not clobber the owner UIDs.
	parent := makeResource("ks-uid", "my-ks", "flux-system", "Kustomization", "v1", "kustomize.toolkit.fluxcd.io")
	s.UpdateResource(parent)

	child := makeResource("pod-uid", "nginx", "default", "Pod", "v1", "")
	child.ParentIDs = []string{"owner-uid"}
	child.Labels = map[string]string{
		KustomizationNameLabel:      "my-ks",
		KustomizationNamespaceLabel: "flux-system",
	}
	s.UpdateResource(child)

	assert.ElementsMatch(t, []string{"owner-uid", "ks-uid"}, s.GetResourceByUID("pod-uid").ParentIDs)
}

// ── AddEvent ──────────────────────────────────────────────────────────────────

func TestKubeStore_AddEvent_NewEvent(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	ev := Event{
		Name:        "BackOff",
		LastObserved: time.Now(),
	}

	added := s.AddEvent("uid-1", ev, 72*time.Hour, 100)

	assert.True(t, added)
	assert.Len(t, s.GetEventsByResourceUID("uid-1"), 1)
}

func TestKubeStore_AddEvent_ResourceNotFound(t *testing.T) {
	s := newStore()
	ev := Event{Name: "Boom", LastObserved: time.Now()}

	added := s.AddEvent("missing-uid", ev, 72*time.Hour, 100)

	assert.False(t, added)
}

func TestKubeStore_AddEvent_TooOld(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	old := Event{
		Name:        "OldEvent",
		LastObserved: time.Now().Add(-73 * time.Hour), // beyond 72h TTL
	}

	added := s.AddEvent("uid-1", old, 72*time.Hour, 100)

	assert.False(t, added)
	assert.Empty(t, s.GetEventsByResourceUID("uid-1"))
}

func TestKubeStore_AddEvent_Duplicate(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	now := time.Now()
	ev := Event{UID: "event-uid-1", Name: "BackOff", LastObserved: now, Count: 1}
	s.AddEvent("uid-1", ev, 72*time.Hour, 100)

	// Same UID, same observation → duplicate
	duplicate := Event{UID: "event-uid-1", Name: "BackOff", LastObserved: now, Count: 1}
	added := s.AddEvent("uid-1", duplicate, 72*time.Hour, 100)

	assert.False(t, added)
	assert.Len(t, s.GetEventsByResourceUID("uid-1"), 1)
}

func TestKubeStore_AddEvent_RecurringEventReplacesStoredCopy(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	now := time.Now()
	first := Event{UID: "event-uid-1", Name: "BackOff", LastObserved: now.Add(-time.Minute), Count: 1}
	s.AddEvent("uid-1", first, 72*time.Hour, 100)

	// K8s updates the same Event in place: count++ and a newer lastTimestamp
	recurring := Event{UID: "event-uid-1", Name: "BackOff", LastObserved: now, Count: 2}
	added := s.AddEvent("uid-1", recurring, 72*time.Hour, 100)

	assert.True(t, added)
	events := s.GetEventsByResourceUID("uid-1")
	if assert.Len(t, events, 1) {
		assert.Equal(t, int32(2), events[0].Count)
	}
}

func TestKubeStore_AddEvent_MaxEvents_EvictsOldest(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	now := time.Now()
	for i := 0; i < 3; i++ {
		ev := Event{
			UID:          types.UID(fmt.Sprintf("event-%d", i)),
			Name:         "Event",
			LastObserved: now.Add(time.Duration(i) * time.Second),
		}
		s.AddEvent("uid-1", ev, 72*time.Hour, 3)
	}

	assert.Len(t, s.GetEventsByResourceUID("uid-1"), 3)

	// Add one more with unique UID — oldest should be evicted
	newest := Event{UID: "event-newest", Name: "Event", LastObserved: now.Add(10 * time.Second)}
	added := s.AddEvent("uid-1", newest, 72*time.Hour, 3)

	assert.True(t, added)
	assert.Len(t, s.GetEventsByResourceUID("uid-1"), 3)
}

func TestKubeStore_RemoveResource_DropsItsEvents(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)
	s.AddEvent("uid-1", Event{UID: "ev-1", LastObserved: time.Now()}, 72*time.Hour, 100)

	s.RemoveResource("uid-1")

	assert.Empty(t, s.GetEventsByResourceUID("uid-1"))
}

// ── Parent/child ref cleanup on removal ───────────────────────────────────────

func TestKubeStore_RemoveResource_CleansParentRefs(t *testing.T) {
	s := newStore()

	parent := makeResource("ks-uid", "my-ks", "flux-system", "Kustomization", "v1", "kustomize.toolkit.fluxcd.io")
	s.UpdateResource(parent)

	child := makeResource("pod-uid", "nginx", "default", "Pod", "v1", "")
	child.Labels = map[string]string{
		KustomizationNameLabel:      "my-ks",
		KustomizationNamespaceLabel: "flux-system",
	}
	s.UpdateResource(child)

	// Before removal child should appear under parent ref
	assert.Len(t, s.FindChildrenResourcesByRef(parent.GetRef()), 1)

	s.RemoveResource("pod-uid")

	// After removal child should be gone from parent ref
	assert.Empty(t, s.FindChildrenResourcesByRef(parent.GetRef()))
}

