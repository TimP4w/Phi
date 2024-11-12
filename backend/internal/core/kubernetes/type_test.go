package kubernetes

import (
	"reflect"
	"testing"
	"time"
)

func createSampleResource() Resource {
	return Resource{
		Kind:       "SampleKind",
		Version:    "v1",
		Namespace:  "default",
		Name:       "sample-name",
		Resource:   "sample-resource",
		ParentIDs:  []string{"parent1", "parent2"},
		ParentRefs: []string{"ref1", "ref2"},
		UID:        "sample-uid",
		Labels:     map[string]string{"key": "value"},
		Group:      "sample-group",
		Status:     "Active",
		Conditions: []Condition{{Type: "condition1", Status: "True"}},
		//Children:             []string{"child1", "child2"},
		CreatedAt:     time.Date(2024, 01, 01, 0, 0, 0, 0, time.UTC),
		DeletedAt:     time.Date(2024, 02, 01, 0, 0, 0, 0, time.UTC),
		IsFluxManaged: true,
	}
}

func TestCopy(t *testing.T) {
	original := createSampleResource()
	copy := Resource{}

	copy.Copy(original)

	if !reflect.DeepEqual(copy, original) {
		t.Errorf("Copy() failed, expected %v, got %v", original, copy)
	}

	if copy.Events != nil {
		t.Errorf("Copy() failed, Events field should not be copied")
	}
}
