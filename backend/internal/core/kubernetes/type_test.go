package kubernetes

import (
	"reflect"
	"testing"
	"time"
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
		Events:        []Event{{UID: "event-uid", Message: "event-message"}},
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

	original.Events = []Event{
		{UID: "event-uid-1", Message: "event-message-1"},
		{UID: "event-uid-2", Message: "event-message-2"},
	}

	copy := Resource{
		Events: []Event{
			{UID: "event-uid-2", Message: "event-message-2"}, // duplicate
			{UID: "event-uid-3", Message: "event-message-3"}, // unique
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
