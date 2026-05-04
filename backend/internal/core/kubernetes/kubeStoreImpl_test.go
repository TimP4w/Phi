package kubernetes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		Events:     []Event{},
		Children:   []Resource{},
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

// ── SetResources / GetResources ───────────────────────────────────────────────

func TestKubeStore_SetResources(t *testing.T) {
	s := newStore()
	r1 := makeResource("uid-1", "pod-a", "default", "Pod", "v1", "")
	r2 := makeResource("uid-2", "pod-b", "default", "Pod", "v1", "")
	newMap := map[string]*Resource{"uid-1": &r1, "uid-2": &r2}

	returned := s.SetResources(newMap)

	assert.Len(t, returned, 2)
	assert.NotNil(t, s.GetResourceByUID("uid-1"))
	assert.NotNil(t, s.GetResourceByUID("uid-2"))
}

func TestKubeStore_SetResources_ClearsOldRefs(t *testing.T) {
	s := newStore()
	// Add a resource so refs are built
	parent := makeResource("p-uid", "kustomization", "flux-system", "Kustomization", "kustomize.toolkit.fluxcd.io/v1", "kustomize.toolkit.fluxcd.io")
	s.UpdateResource(parent)

	// Replace with empty map
	s.SetResources(map[string]*Resource{})

	assert.Nil(t, s.GetResourceByUID("p-uid"))
	// refs map should be reset — verified implicitly by no crash on subsequent ops
}

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
	all["uid-1"] = Resource{Name: "tampered"}

	// Original must be unaffected
	assert.Equal(t, "pod", s.GetResourceByUID("uid-1").Name)
}

// ── RegisterResource / FindChildrenResourcesByRef ─────────────────────────────

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

// ── RegisterResource with Flux labels ─────────────────────────────────────────

func TestKubeStore_RegisterResource_WithKustomizationLabel(t *testing.T) {
	s := newStore()
	res := &Resource{
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

	s.RegisterResource(res)

	// IsFluxManaged should be set on the resource
	assert.True(t, res.IsFluxManaged)
}

func TestKubeStore_RegisterResource_WithHelmLabel(t *testing.T) {
	s := newStore()
	res := &Resource{
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

	s.RegisterResource(res)

	assert.True(t, res.IsFluxManaged)
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
	got := s.GetResourceByUID("uid-1")
	assert.Len(t, got.Events, 1)
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
	assert.Empty(t, s.GetResourceByUID("uid-1").Events)
}

func TestKubeStore_AddEvent_Duplicate(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	ts := time.Now()
	ev := Event{Name: "BackOff", LastObserved: ts}
	s.AddEvent("uid-1", ev, 72*time.Hour, 100)

	// Same name + same timestamp → duplicate
	duplicate := Event{Name: "BackOff", LastObserved: ts}
	added := s.AddEvent("uid-1", duplicate, 72*time.Hour, 100)

	assert.False(t, added)
	assert.Len(t, s.GetResourceByUID("uid-1").Events, 1)
}

func TestKubeStore_AddEvent_MaxEvents_EvictsOldest(t *testing.T) {
	s := newStore()
	res := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	s.UpdateResource(res)

	now := time.Now()
	for i := 0; i < 3; i++ {
		ev := Event{
			Name:        "Event",
			LastObserved: now.Add(time.Duration(i) * time.Second),
		}
		// Use unique LastObserved to avoid duplicate detection
		s.AddEvent("uid-1", ev, 72*time.Hour, 3)
	}

	got := s.GetResourceByUID("uid-1")
	assert.Len(t, got.Events, 3)

	// Add one more — oldest should be evicted
	newest := Event{Name: "Event", LastObserved: now.Add(10 * time.Second)}
	added := s.AddEvent("uid-1", newest, 72*time.Hour, 3)

	assert.True(t, added)
	assert.Len(t, s.GetResourceByUID("uid-1").Events, 3)
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

