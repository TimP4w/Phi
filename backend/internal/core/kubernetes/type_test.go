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
		Events:        []Event{{UID: "event-uid", Message: "event-message", LastObserved: time.Now().Add(-1 * time.Hour)}},
		Children:      []Resource{{Kind: "ChildKind", Name: "child-name", UID: "child-uid"}},
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
	copy := Resource{}

	copy.Copy(original)

	if !reflect.DeepEqual(copy, original) {
		t.Errorf("Copy() failed, expected %v, got %v", original, copy)
	}
}

func TestCopyEventsMerging(t *testing.T) {
	original := createSampleResource()

	now := time.Now()
	original.Events = []Event{
		{UID: "event-uid-1", Message: "event-message-1", LastObserved: now.Add(-1 * time.Hour)},
		{UID: "event-uid-2", Message: "event-message-2", LastObserved: now.Add(-2 * time.Hour)},
	}

	copy := Resource{
		Events: []Event{
			{UID: "event-uid-2", Message: "event-message-2", LastObserved: now.Add(-2 * time.Hour)}, // duplicate
			{UID: "event-uid-3", Message: "event-message-3", LastObserved: now.Add(-3 * time.Hour)}, // unique
		},
	}

	copy.Copy(original)

	// Expect all unique events by UID:
	expectedUIDs := map[string]bool{
		"event-uid-1": false,
		"event-uid-2": false,
		"event-uid-3": false,
	}
	for _, ev := range copy.Events {
		expectedUIDs[string(ev.UID)] = true
	}
	for uid, found := range expectedUIDs {
		if !found {
			t.Errorf("Expected event with UID %s to be present after Copy", uid)
		}
	}
	if len(copy.Events) != 3 {
		t.Errorf("Expected 3 unique events after Copy, got %d", len(copy.Events))
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

func TestSortAndLimitEvents(t *testing.T) {
	r := &Resource{}
	now := time.Now()
	events := []Event{
		{Name: "old", LastObserved: now.Add(-2 * time.Hour)},
		{Name: "newest", LastObserved: now},
		{Name: "middle", LastObserved: now.Add(-1 * time.Hour)},
	}
	result := r.sortAndLimitEvents(events, 2)
	assert.Len(t, result, 2)
	assert.Equal(t, "newest", result[0].Name)
	assert.Equal(t, "middle", result[1].Name)
}

func TestResourceMap_LookupFound(t *testing.T) {
	rm := &ResourceMap{}
	rm.M.Store("pod", []ApiResource{{Kind: "Pod"}})

	result := rm.Lookup("Pod")
	assert.Len(t, result, 1)
	assert.Equal(t, "Pod", result[0].Kind)
}

func TestResourceMap_LookupNotFound(t *testing.T) {
	rm := &ResourceMap{}
	result := rm.Lookup("Deployment")
	assert.Nil(t, result)
}

func TestResourceMap_Resources(t *testing.T) {
	rm := &ResourceMap{List: []ApiResource{{Kind: "Pod"}, {Kind: "Service"}}}
	assert.Len(t, rm.Resources(), 2)
}
