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

func TestClone(t *testing.T) {
	original := createSampleResource()

	clone := original.Clone()

	if !reflect.DeepEqual(clone, original) {
		t.Errorf("Clone() failed, expected %v, got %v", original, clone)
	}
}

// TestCloneIndependence guards that Clone() copies every reference-typed field
// (slices, maps, and the slices/maps nested in the metadata structs) rather than
// sharing backing storage. A field added to Resource but not to Clone() will
// show up here as a mutation leaking back into the original.
func TestCloneIndependence(t *testing.T) {
	original := Resource{
		ParentIDs:   []string{"p1"},
		ParentRefs:  []string{"r1"},
		Labels:      map[string]string{"k": "v"},
		Annotations: map[string]string{"a": "v"},
		Conditions:  []Condition{{Type: "Ready", Status: "True"}},
		PodMetadata: PodMetadata{Containers: []Container{{Name: "c1"}}},
		DeploymentMetadata: DeploymentMetadata{
			Images: []string{"img:1"},
		},
		KustomizationMetadata: KustomizationMetadata{
			DependsOn: []string{"dep1"},
		},
		PVCMetadata: PVCMetadata{
			AccessModes: []string{"ReadWriteOnce"},
			Capacity:    map[string]string{"storage": "1Gi"},
		},
		PVMetadata:            PVMetadata{AccessModes: []string{"ReadWriteOnce"}},
		ServiceMetadata:       ServiceMetadata{ClusterIPs: []string{"10.0.0.1"}, Selector: map[string]string{"app": "x"}},
		RouteMetadata:         RouteMetadata{Hostnames: []string{"example.com"}},
		EndpointSliceMetadata: EndpointSliceMetadata{Endpoints: []EndpointTarget{{TargetName: "pod1"}}},
		GatewayMetadata:       GatewayMetadata{Addresses: []string{"1.2.3.4"}},
		CertificateMetadata:   CertificateMetadata{DNSNames: []string{"example.com"}},
		NetworkPolicyMetadata: NetworkPolicyMetadata{PodSelector: map[string]string{"app": "x"}, PolicyTypes: []string{"Ingress"}},
		ProxyMetadata:         ProxyMetadata{EntrypointMiddlewares: map[string][]string{"web": {"mw1"}}},
	}
	snapshot := original.Clone()

	clone := original.Clone()
	// Mutate every reference-typed field of the original.
	clone.ParentIDs[0] = "mut"
	clone.ParentRefs[0] = "mut"
	clone.Labels["k"] = "mut"
	clone.Annotations["a"] = "mut"
	clone.Conditions[0].Status = "mut"
	clone.PodMetadata.Containers[0].Name = "mut"
	clone.DeploymentMetadata.Images[0] = "mut"
	clone.KustomizationMetadata.DependsOn[0] = "mut"
	clone.PVCMetadata.AccessModes[0] = "mut"
	clone.PVCMetadata.Capacity["storage"] = "mut"
	clone.PVMetadata.AccessModes[0] = "mut"
	clone.ServiceMetadata.ClusterIPs[0] = "mut"
	clone.ServiceMetadata.Selector["app"] = "mut"
	clone.RouteMetadata.Hostnames[0] = "mut"
	clone.EndpointSliceMetadata.Endpoints[0].TargetName = "mut"
	clone.GatewayMetadata.Addresses[0] = "mut"
	clone.CertificateMetadata.DNSNames[0] = "mut"
	clone.NetworkPolicyMetadata.PodSelector["app"] = "mut"
	clone.NetworkPolicyMetadata.PolicyTypes[0] = "mut"
	clone.ProxyMetadata.EntrypointMiddlewares["web"][0] = "mut"

	if !reflect.DeepEqual(original, snapshot) {
		t.Errorf("Clone() shares backing storage with the original; mutating the clone changed the original.\nexpected %#v\ngot      %#v", snapshot, original)
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
