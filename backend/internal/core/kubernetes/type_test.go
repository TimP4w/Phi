package kubernetes

import (
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func createSampleResource() Resource {
	return Resource{
		Kind:          "SampleKind",
		Version:       "v1",
		Namespace:     "default",
		Name:          "sample-name",
		Resource:      "sample-resource",
		ParentIDs:     []string{"parent1", "parent2"},
		ParentRefs:    []string{"ref1", "ref2"},
		UID:           "sample-uid",
		Labels:        map[string]string{"key": "value"},
		Annotations:   map[string]string{"anno": "val"},
		Group:         "sample-group",
		Status:        "Active",
		Conditions:    []Condition{{Type: "condition1", Status: "True"}},
		CreatedAt:     time.Date(2024, 01, 01, 0, 0, 0, 0, time.UTC),
		DeletedAt:     time.Date(2024, 02, 01, 0, 0, 0, 0, time.UTC),
		IsFluxManaged: true,
		FluxMetadata: FluxMetadata{
			LastHandledReconcileAt: time.Date(2024, 01, 15, 0, 0, 0, 0, time.UTC),
			LastSyncAt:             time.Date(2024, 01, 20, 0, 0, 0, 0, time.UTC),
			IsSuspended:            false,
			IsReconciling:          false,
		},
		PodMetadata:           PodMetadata{Phase: "Running"},
		DeploymentMetadata:    DeploymentMetadata{Replicas: 3},
		HelmReleaseMetadata:   HelmReleaseMetadata{},
		KustomizationMetadata: KustomizationMetadata{},
		GitRepositoryMetadata: GitRepositoryMetadata{URL: "https://github.com/example/repo.git"},
		OCIRepositoryMetadata: OCIRepositoryMetadata{URL: "oci://example.com/repo"},
	}
}

func TestCopy(t *testing.T) {
	original := createSampleResource()
	dst := Resource{}

	dst.Copy(original)

	if !reflect.DeepEqual(dst, original) {
		t.Errorf("Copy() failed, expected %v, got %v", original, dst)
	}
}

func TestIsDeepEqual_EqualResources(t *testing.T) {
	r := Resource{UID: "uid1", Kind: "Pod", Name: "my-pod", Status: StatusPending}
	assert.True(t, r.IsDeepEqual(r))
}

func TestIsDeepEqual_DifferentStatus(t *testing.T) {
	a := Resource{UID: "uid1", Status: StatusPending}
	b := Resource{UID: "uid1", Status: StatusFailed}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentLabels(t *testing.T) {
	a := Resource{UID: "uid1", Labels: map[string]string{"env": "prod"}}
	b := Resource{UID: "uid1", Labels: map[string]string{"env": "dev"}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentParentIDs(t *testing.T) {
	a := Resource{UID: "uid1", ParentIDs: []string{"p1"}}
	b := Resource{UID: "uid1", ParentIDs: []string{"p2"}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentConditions(t *testing.T) {
	a := Resource{UID: "uid1", Conditions: []Condition{{Type: "Ready", Status: "True"}}}
	b := Resource{UID: "uid1", Conditions: []Condition{{Type: "Ready", Status: "False"}}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentDeploymentMetadata(t *testing.T) {
	a := Resource{UID: "uid1", DeploymentMetadata: DeploymentMetadata{Replicas: 1}}
	b := Resource{UID: "uid1", DeploymentMetadata: DeploymentMetadata{Replicas: 2}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentKustomizationMetadata(t *testing.T) {
	a := Resource{UID: "uid1", KustomizationMetadata: KustomizationMetadata{Path: "./apps"}}
	b := Resource{UID: "uid1", KustomizationMetadata: KustomizationMetadata{Path: "./infra"}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestIsDeepEqual_DifferentPVCMetadata(t *testing.T) {
	a := Resource{UID: "uid1", PVCMetadata: PVCMetadata{StorageClass: "standard"}}
	b := Resource{UID: "uid1", PVCMetadata: PVCMetadata{StorageClass: "fast"}}
	assert.False(t, a.IsDeepEqual(b))
}

func TestAddEventSortAndLimit(t *testing.T) {
	store := NewKubeStoreImpl().(*KubeStoreImpl)
	uid := "test-uid"
	store.resources[uid] = &Resource{UID: uid}

	now := time.Now()
	// Add 3 events; cap at 2 — should keep the 2 most recent
	for _, e := range []Event{
		{UID: "a", Name: "old", LastObserved: now.Add(-2 * time.Hour), ResourceUID: uid},
		{UID: "b", Name: "newest", LastObserved: now, ResourceUID: uid},
		{UID: "c", Name: "middle", LastObserved: now.Add(-1 * time.Hour), ResourceUID: uid},
	} {
		store.AddEvent(uid, e, EventTTL, 2)
	}

	events := store.GetEventsByResourceUID(uid)
	assert.Len(t, events, 2)
	names := []string{events[0].Name, events[1].Name}
	assert.Contains(t, names, "newest")
	assert.Contains(t, names, "middle")
}
