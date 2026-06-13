package kubernetes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
)

// metadata helpers

func setUID(obj map[string]interface{}, uid string) {
	obj["metadata"].(map[string]interface{})["uid"] = uid
}

func setGeneration(obj map[string]interface{}, gen int64) {
	obj["metadata"].(map[string]interface{})["generation"] = gen
}

func setDeletionTimestamp(obj map[string]interface{}, ts string) {
	obj["metadata"].(map[string]interface{})["deletionTimestamp"] = ts
}

func setLabels(obj map[string]interface{}, labels map[string]interface{}) {
	obj["metadata"].(map[string]interface{})["labels"] = labels
}

func setAnnotations(obj map[string]interface{}, ann map[string]interface{}) {
	obj["metadata"].(map[string]interface{})["annotations"] = ann
}

func setOwnerRefs(obj map[string]interface{}, refs []interface{}) {
	obj["metadata"].(map[string]interface{})["ownerReferences"] = refs
}

// ── Basic field mapping ───────────────────────────────────────────────────────

func TestToResource_BasicFields(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ConfigMap", "v1", "my-cm", "default")
	setUID(obj.Object, "uid-abc")
	setLabels(obj.Object, map[string]interface{}{"app": "test"})
	setAnnotations(obj.Object, map[string]interface{}{"note": "hello"})

	res := mapper.ToResource(*obj, "configmaps")

	assert.Equal(t, "ConfigMap", res.Kind)
	assert.Equal(t, "my-cm", res.Name)
	assert.Equal(t, "default", res.Namespace)
	assert.Equal(t, "uid-abc", res.UID)
	assert.Equal(t, "configmaps", res.Resource)
	assert.Equal(t, "v1", res.Version)
	assert.Equal(t, "test", res.Labels["app"])
	assert.Equal(t, "hello", res.Annotations["note"])
	assert.False(t, res.CreatedAt.IsZero())
	assert.Equal(t, kube.StatusUnknown, res.Status)
}

func TestToResource_OwnerRefs(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ReplicaSet", "apps/v1", "my-rs", "default")
	setUID(obj.Object, "rs-uid")
	setOwnerRefs(obj.Object, []interface{}{
		map[string]interface{}{
			"uid":        "deploy-uid",
			"name":       "my-deploy",
			"kind":       "Deployment",
			"apiVersion": "apps/v1",
		},
	})

	res := mapper.ToResource(*obj, "replicasets")

	assert.Equal(t, []string{"deploy-uid"}, res.ParentIDs)
	assert.Len(t, res.ParentRefs, 1)
	assert.Contains(t, res.ParentRefs[0], "my-deploy")
}

func TestToResource_DeletionTimestamp(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "dying-pod", "default")
	setDeletionTimestamp(obj.Object, "2024-01-15T10:30:00Z")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{
			map[string]interface{}{"name": "c", "image": "img"},
		},
	}

	res := mapper.ToResource(*obj, "pods")

	assert.False(t, res.DeletedAt.IsZero())
}

// ── Pod ───────────────────────────────────────────────────────────────────────

func TestToResource_Pod_WithContainers(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "my-pod", "default")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{
			map[string]interface{}{"name": "main", "image": "nginx:1.25"},
		},
	}
	obj.Object["status"] = map[string]interface{}{"phase": "Running"}

	res := mapper.ToResource(*obj, "pods")

	assert.Equal(t, "nginx:1.25", res.PodMetadata.Image)
	assert.Equal(t, "Running", res.PodMetadata.Phase)
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Pod_NoContainers(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "init-only", "default")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{},
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "pods")
		assert.Equal(t, "", res.PodMetadata.Image)
	})
}

func TestToResource_Pod_Status_Pending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "p", "default")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{map[string]interface{}{"name": "c"}},
	}
	obj.Object["status"] = map[string]interface{}{"phase": "Pending"}

	res := mapper.ToResource(*obj, "pods")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_Pod_Status_Failed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "p", "default")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{map[string]interface{}{"name": "c"}},
	}
	obj.Object["status"] = map[string]interface{}{"phase": "Failed"}

	res := mapper.ToResource(*obj, "pods")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_Pod_Status_Deleting(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "p", "default")
	setDeletionTimestamp(obj.Object, "2024-01-15T10:30:00Z")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{map[string]interface{}{"name": "c"}},
	}

	res := mapper.ToResource(*obj, "pods")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_Pod_Conditions(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Pod", "v1", "p", "default")
	obj.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{map[string]interface{}{"name": "c"}},
	}
	obj.Object["status"] = map[string]interface{}{
		"phase": "Running",
		"conditions": []interface{}{
			map[string]interface{}{
				"type":    "Ready",
				"status":  "True",
				"reason":  "PodReady",
				"message": "all good",
			},
		},
	}

	res := mapper.ToResource(*obj, "pods")
	assert.Len(t, res.Conditions, 1)
	assert.Equal(t, "Ready", res.Conditions[0].Type)
}

// ── PVC ───────────────────────────────────────────────────────────────────────

func TestToResource_PVC_Happy(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolumeClaim", "v1", "my-pvc", "default")
	obj.Object["spec"] = map[string]interface{}{
		"storageClassName": "fast",
		"volumeMode":       "Filesystem",
		"volumeName":       "pv-123",
	}
	obj.Object["status"] = map[string]interface{}{"phase": "Bound"}

	res := mapper.ToResource(*obj, "persistentvolumeclaims")

	assert.Equal(t, "fast", res.PVCMetadata.StorageClass)
	assert.Equal(t, "Filesystem", res.PVCMetadata.VolumeMode)
	assert.Equal(t, "pv-123", res.PVCMetadata.VolumeName)
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_PVC_NilStorageClass(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolumeClaim", "v1", "my-pvc", "default")
	obj.Object["spec"] = map[string]interface{}{
		"volumeMode": "Filesystem",
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "persistentvolumeclaims")
		assert.Equal(t, "", res.PVCMetadata.StorageClass)
	})
}

func TestToResource_PVC_NilVolumeMode(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolumeClaim", "v1", "my-pvc", "default")
	obj.Object["spec"] = map[string]interface{}{
		"storageClassName": "standard",
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "persistentvolumeclaims")
		assert.Equal(t, "", res.PVCMetadata.VolumeMode)
	})
}

func TestToResource_PVC_Status_Pending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolumeClaim", "v1", "p", "default")
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{"phase": "Pending"}

	res := mapper.ToResource(*obj, "persistentvolumeclaims")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_PVC_Status_Lost(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolumeClaim", "v1", "p", "default")
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{"phase": "Lost"}

	res := mapper.ToResource(*obj, "persistentvolumeclaims")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

// ── PV ────────────────────────────────────────────────────────────────────────

func TestToResource_PV_Bound(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolume", "v1", "pv-123", "")
	obj.Object["spec"] = map[string]interface{}{
		"claimRef": map[string]interface{}{
			"name":       "my-pvc",
			"namespace":  "default",
			"kind":       "PersistentVolumeClaim",
			"apiVersion": "v1",
		},
	}
	obj.Object["status"] = map[string]interface{}{"phase": "Bound"}

	res := mapper.ToResource(*obj, "persistentvolumes")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Len(t, res.ParentRefs, 1)
	assert.Contains(t, res.ParentRefs[0], "my-pvc")
}

func TestToResource_PV_Unbound(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolume", "v1", "pv-free", "")
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{"phase": "Available"}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "persistentvolumes")
		assert.Equal(t, kube.StatusSuccess, res.Status)
		assert.Empty(t, res.ParentRefs)
	})
}

func TestToResource_PV_Status_Released(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolume", "v1", "pv", "")
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{"phase": "Released"}

	res := mapper.ToResource(*obj, "persistentvolumes")
	assert.Equal(t, kube.StatusWarning, res.Status)
}

func TestToResource_PV_Status_Failed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("PersistentVolume", "v1", "pv", "")
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{"phase": "Failed"}

	res := mapper.ToResource(*obj, "persistentvolumes")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

// ── Longhorn Volume ───────────────────────────────────────────────────────────

func newLonghornVolume(name string) *unstructured.Unstructured {
	return newUnstructuredResource("Volume", "longhorn.io/v1beta2", name, "longhorn-system")
}

func TestToResource_LonghornVolume_Healthy(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("pvc-abc")
	obj.Object["spec"] = map[string]interface{}{
		"size":             "10737418240", // 10Gi, serialised as a string
		"numberOfReplicas": int64(3),
		"frontend":         "blockdev",
		"accessMode":       "rwo",
	}
	obj.Object["status"] = map[string]interface{}{
		"state":         "attached",
		"robustness":    "healthy",
		"actualSize":    int64(5368709120), // 5Gi, serialised as a number
		"currentNodeID": "node-1",
	}

	res := mapper.ToResource(*obj, "volumes")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, "attached", res.LonghornVolumeMetadata.State)
	assert.Equal(t, "healthy", res.LonghornVolumeMetadata.Robustness)
	assert.Equal(t, int64(10737418240), res.LonghornVolumeMetadata.Size)
	assert.Equal(t, int64(5368709120), res.LonghornVolumeMetadata.ActualSize)
	assert.Equal(t, int64(3), res.LonghornVolumeMetadata.NumberOfReplicas)
	assert.Equal(t, "node-1", res.LonghornVolumeMetadata.NodeID)
	assert.Equal(t, "blockdev", res.LonghornVolumeMetadata.Frontend)
	assert.Equal(t, "rwo", res.LonghornVolumeMetadata.AccessMode)
	// Shares its name with the backing PersistentVolume.
	assert.Len(t, res.ParentRefs, 1)
	assert.Contains(t, res.ParentRefs[0], "pvc-abc")
}

func TestToResource_LonghornVolume_Degraded(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	obj.Object["spec"] = map[string]interface{}{"size": int64(1024)}
	obj.Object["status"] = map[string]interface{}{"state": "attached", "robustness": "degraded"}

	res := mapper.ToResource(*obj, "volumes")
	assert.Equal(t, kube.StatusWarning, res.Status)
	assert.Equal(t, int64(1024), res.LonghornVolumeMetadata.Size)
}

func TestToResource_LonghornVolume_Faulted(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	obj.Object["status"] = map[string]interface{}{"state": "detached", "robustness": "faulted"}

	res := mapper.ToResource(*obj, "volumes")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_LonghornVolume_HealthyDetached(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	obj.Object["status"] = map[string]interface{}{"state": "detached", "robustness": "healthy"}

	res := mapper.ToResource(*obj, "volumes")
	// Robustness drives readiness: healthy is ready regardless of attachment.
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_LonghornVolume_DetachedUnknown(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	// Longhorn reports "unknown" robustness for an idle, detached volume.
	obj.Object["status"] = map[string]interface{}{"state": "detached", "robustness": "unknown"}

	res := mapper.ToResource(*obj, "volumes")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_LonghornVolume_Attaching(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	obj.Object["status"] = map[string]interface{}{"state": "attaching", "robustness": "unknown"}

	res := mapper.ToResource(*obj, "volumes")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_LonghornVolume_Conditions(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")
	obj.Object["status"] = map[string]interface{}{
		"state":      "attached",
		"robustness": "healthy",
		"conditions": []interface{}{
			map[string]interface{}{
				"type":    "Scheduled",
				"status":  "True",
				"reason":  "",
				"message": "volume scheduled",
			},
		},
	}

	res := mapper.ToResource(*obj, "volumes")
	assert.Len(t, res.Conditions, 1)
	assert.Equal(t, "Scheduled", res.Conditions[0].Type)
	assert.Equal(t, "True", res.Conditions[0].Status)
}

func TestToResource_LonghornVolume_Empty(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newLonghornVolume("v")

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "volumes")
		// No status yet (no robustness, no state) reads as a benign idle volume.
		assert.Equal(t, kube.StatusSuccess, res.Status)
		assert.Equal(t, int64(0), res.LonghornVolumeMetadata.Size)
	})
}

// ── Longhorn Node ─────────────────────────────────────────────────────────────

func TestToResource_LonghornNode_DiskAggregation(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Node", "longhorn.io/v1beta2", "node-1", "longhorn-system")
	obj.Object["spec"] = map[string]interface{}{
		"allowScheduling": true,
		"disks": map[string]interface{}{
			"disk-a": map[string]interface{}{
				"storageReserved": int64(10),
				"allowScheduling": true,
			},
			"disk-b": map[string]interface{}{
				"storageReserved": int64(0),
				"allowScheduling": false, // disabled disk
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"diskStatus": map[string]interface{}{
			"disk-a": map[string]interface{}{
				"storageMaximum":   int64(100),
				"storageAvailable": int64(70),
				"storageScheduled": int64(40),
			},
			"disk-b": map[string]interface{}{
				"storageMaximum":   int64(50),
				"storageAvailable": int64(50),
				"storageScheduled": int64(0),
			},
		},
		"conditions": []interface{}{
			map[string]interface{}{"type": "Ready", "status": "True"},
			map[string]interface{}{"type": "Schedulable", "status": "True"},
		},
	}

	res := mapper.ToResource(*obj, "nodes")
	m := res.LonghornNodeMetadata

	// Enabled disk-a partitions: reserved 10 + used 40 + schedulable 50 = 100 (its max).
	assert.Equal(t, int64(150), m.StorageMaximum)    // 100 + 50
	assert.Equal(t, int64(40), m.StorageUsed)        // disk-a storageScheduled
	assert.Equal(t, int64(10), m.StorageReserved)    // only enabled disk-a
	assert.Equal(t, int64(50), m.StorageSchedulable) // disk-a: 100 - 10 reserved - 40 scheduled
	assert.Equal(t, int64(50), m.StorageDisabled)    // disk-b max
	assert.True(t, m.Ready)
	assert.True(t, m.Schedulable)
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_LonghornNode_NotReady(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Node", "longhorn.io/v1beta2", "node-2", "longhorn-system")
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{"type": "Ready", "status": "False"},
		},
	}

	res := mapper.ToResource(*obj, "nodes")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_CoreNode_Untouched(t *testing.T) {
	mapper := NewKubeMapper()
	// A core v1 Node must not be treated as a Longhorn node.
	obj := newUnstructuredResource("Node", "v1", "worker-1", "")

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "nodes")
		assert.Equal(t, int64(0), res.LonghornNodeMetadata.StorageMaximum)
	})
}

// ── Kustomization ─────────────────────────────────────────────────────────────

func TestToResource_Kustomization(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Kustomization", "kustomize.toolkit.fluxcd.io/v1", "my-ks", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"path":    "./clusters/prod",
		"suspend": false,
		"sourceRef": map[string]interface{}{
			"kind":      "GitRepository",
			"name":      "my-repo",
			"namespace": "flux-system",
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"lastAppliedRevision":   "main@sha1:abc123",
		"lastAttemptedRevision": "main@sha1:abc123",
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "ReconciliationSucceeded",
				"message":            "Applied revision",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "kustomizations")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, "./clusters/prod", res.KustomizationMetadata.Path)
	assert.Equal(t, "main@sha1:abc123", res.KustomizationMetadata.LastAppliedRevision)
	assert.Equal(t, "GitRepository", res.KustomizationMetadata.SourceRef.Kind)
	assert.Equal(t, "my-repo", res.KustomizationMetadata.SourceRef.Name)
	assert.Len(t, res.Conditions, 1)
}

func TestToResource_Kustomization_Failed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Kustomization", "kustomize.toolkit.fluxcd.io/v1", "my-ks", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"path": "./clusters/prod", "sourceRef": map[string]interface{}{"kind": "GitRepository", "name": "r"}}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "False",
				"reason":             "ReconciliationFailed",
				"message":            "error",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "kustomizations")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

// ── HelmRelease ───────────────────────────────────────────────────────────────

func TestToResource_HelmRelease_NoHistory(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmRelease", "helm.toolkit.fluxcd.io/v2", "my-hr", "default")
	obj.Object["spec"] = map[string]interface{}{
		"suspend": false,
		"chart": map[string]interface{}{
			"spec": map[string]interface{}{
				"sourceRef": map[string]interface{}{
					"kind":      "HelmRepository",
					"name":      "my-repo",
					"namespace": "flux-system",
				},
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "InstallSucceeded",
				"message":            "ok",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "helmreleases")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, "unknown", res.HelmReleaseMetadata.ChartVersion)
	assert.Equal(t, "HelmRepository", res.HelmReleaseMetadata.SourceRef.Kind)
}

// ── GitRepository ─────────────────────────────────────────────────────────────

func TestToResource_GitRepository(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("GitRepository", "source.toolkit.fluxcd.io/v1", "my-repo", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"url":     "https://github.com/org/repo",
		"suspend": false,
		"ref": map[string]interface{}{
			"branch": "main",
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "Succeeded",
				"message":            "ok",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "gitrepositories")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, "https://github.com/org/repo", res.GitRepositoryMetadata.URL)
	assert.Equal(t, "main", res.GitRepositoryMetadata.Branch)
}

// ── Deployment ────────────────────────────────────────────────────────────────

func TestToResource_Deployment_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Deployment", "apps/v1", "my-deploy", "default")
	setGeneration(obj.Object, 1)
	obj.Object["spec"] = map[string]interface{}{
		"replicas": int64(2),
		"template": map[string]interface{}{
			"spec": map[string]interface{}{
				"containers": []interface{}{
					map[string]interface{}{"name": "app", "image": "myapp:1.0"},
				},
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration": int64(1),
		"replicas":           int64(2),
		"readyReplicas":      int64(2),
		"updatedReplicas":    int64(2),
		"availableReplicas":  int64(2),
	}

	res := mapper.ToResource(*obj, "deployments")

	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, int32(2), res.DeploymentMetadata.Replicas)
	assert.Equal(t, int32(2), res.DeploymentMetadata.ReadyReplicas)
	assert.Equal(t, []string{"myapp:1.0"}, res.DeploymentMetadata.Images)
}

func TestToResource_Deployment_Pending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Deployment", "apps/v1", "my-deploy", "default")
	setGeneration(obj.Object, 2)
	obj.Object["spec"] = map[string]interface{}{
		"replicas": int64(3),
		"template": map[string]interface{}{"spec": map[string]interface{}{"containers": []interface{}{}}},
	}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration": int64(1), // behind generation → Pending
		"replicas":           int64(3),
		"readyReplicas":      int64(3),
	}

	res := mapper.ToResource(*obj, "deployments")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_Deployment_Unavailable(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Deployment", "apps/v1", "my-deploy", "default")
	setGeneration(obj.Object, 1)
	obj.Object["spec"] = map[string]interface{}{
		"replicas": int64(3),
		"template": map[string]interface{}{"spec": map[string]interface{}{"containers": []interface{}{}}},
	}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration":  int64(1),
		"replicas":            int64(3),
		"readyReplicas":       int64(2),
		"unavailableReplicas": int64(1),
	}

	res := mapper.ToResource(*obj, "deployments")
	assert.Equal(t, kube.StatusWarning, res.Status)
}

// ── Ingress ───────────────────────────────────────────────────────────────────

func TestToResource_Ingress_NoLB(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["status"] = map[string]interface{}{
		"loadBalancer": map[string]interface{}{},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_Ingress_WithLB(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["status"] = map[string]interface{}{
		"loadBalancer": map[string]interface{}{
			"ingress": []interface{}{
				map[string]interface{}{"ip": "1.2.3.4"},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

// ── Service ───────────────────────────────────────────────────────────────────

func TestToResource_Service_LoadBalancer(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Service", "v1", "web", "default")
	obj.Object["spec"] = map[string]interface{}{
		"type":       "LoadBalancer",
		"clusterIPs": []interface{}{"10.96.0.10"},
		"selector":   map[string]interface{}{"app": "web"},
		"ports": []interface{}{
			map[string]interface{}{
				"name":       "http",
				"protocol":   "TCP",
				"port":       int64(80),
				"targetPort": int64(8080),
				"nodePort":   int64(30080),
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"loadBalancer": map[string]interface{}{
			"ingress": []interface{}{
				map[string]interface{}{"ip": "192.168.1.50"},
			},
		},
	}

	res := mapper.ToResource(*obj, "services")

	assert.Equal(t, "LoadBalancer", res.ServiceMetadata.Type)
	assert.Equal(t, []string{"10.96.0.10"}, res.ServiceMetadata.ClusterIPs)
	assert.Equal(t, []string{"192.168.1.50"}, res.ServiceMetadata.ExternalIPs)
	assert.Equal(t, map[string]string{"app": "web"}, res.ServiceMetadata.Selector)
	assert.Len(t, res.ServiceMetadata.Ports, 1)
	assert.Equal(t, "http", res.ServiceMetadata.Ports[0].Name)
	assert.Equal(t, int32(80), res.ServiceMetadata.Ports[0].Port)
	assert.Equal(t, "8080", res.ServiceMetadata.Ports[0].TargetPort)
	assert.Equal(t, int32(30080), res.ServiceMetadata.Ports[0].NodePort)
}

func TestToResource_Service_ClusterIP_NoExternalIP(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Service", "v1", "internal", "default")
	obj.Object["spec"] = map[string]interface{}{
		"type":     "ClusterIP",
		"selector": map[string]interface{}{"app": "internal"},
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "services")
		assert.Equal(t, "ClusterIP", res.ServiceMetadata.Type)
		assert.Empty(t, res.ServiceMetadata.ExternalIPs)
	})
}

func TestToResource_Service_NamedTargetPort_Hostname(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Service", "v1", "web", "default")
	obj.Object["spec"] = map[string]interface{}{
		"type": "LoadBalancer",
		"ports": []interface{}{
			map[string]interface{}{"port": int64(443), "targetPort": "https"},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"loadBalancer": map[string]interface{}{
			"ingress": []interface{}{
				map[string]interface{}{"hostname": "lb.example.com"},
			},
		},
	}

	res := mapper.ToResource(*obj, "services")
	assert.Equal(t, "https", res.ServiceMetadata.Ports[0].TargetPort)
	assert.Equal(t, []string{"lb.example.com"}, res.ServiceMetadata.ExternalIPs)
}

func TestToResource_Ingress_RouteMetadata(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["spec"] = map[string]interface{}{
		"ingressClassName": "traefik",
		"rules": []interface{}{
			map[string]interface{}{
				"host": "app.example.com",
				"http": map[string]interface{}{
					"paths": []interface{}{
						map[string]interface{}{
							"path": "/",
							"backend": map[string]interface{}{
								"service": map[string]interface{}{
									"name": "web",
									"port": map[string]interface{}{"number": int64(80)},
								},
							},
						},
					},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")

	assert.Equal(t, "traefik", res.RouteMetadata.Class)
	assert.Equal(t, []string{"app.example.com"}, res.RouteMetadata.Hostnames)
	assert.Len(t, res.RouteMetadata.BackendRefs, 1)
	assert.Equal(t, "web", res.RouteMetadata.BackendRefs[0].Name)
	assert.Equal(t, "default", res.RouteMetadata.BackendRefs[0].Namespace)
	assert.Equal(t, "Service", res.RouteMetadata.BackendRefs[0].Kind)
	assert.Equal(t, int32(80), res.RouteMetadata.BackendRefs[0].Port)
}

func TestToResource_Ingress_Addresses(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["spec"] = map[string]interface{}{
		"ingressClassName": "traefik",
	}
	obj.Object["status"] = map[string]interface{}{
		"loadBalancer": map[string]interface{}{
			"ingress": []interface{}{
				map[string]interface{}{"ip": "192.168.1.50"},
				map[string]interface{}{"hostname": "lb.example.com"},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, []string{"192.168.1.50", "lb.example.com"}, res.RouteMetadata.Addresses)
}

func TestToResource_Ingress_TLSEnabled_NoSecret(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["spec"] = map[string]interface{}{
		"tls": []interface{}{
			map[string]interface{}{"hosts": []interface{}{"app.example.com"}},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.True(t, res.RouteMetadata.TLSEnabled)
	assert.Empty(t, res.RouteMetadata.TLSSecretRefs)
}

func TestToResource_Certificate_DNSNames(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Certificate", "cert-manager.io/v1", "wildcard", "network")
	obj.Object["spec"] = map[string]interface{}{
		"secretName": "wildcard-tls",
		"dnsNames":   []interface{}{"*.example.com", "example.com"},
	}

	res := mapper.ToResource(*obj, "certificates")
	assert.Equal(t, []string{"*.example.com", "example.com"}, res.CertificateMetadata.DNSNames)
}

func TestToResource_Ingress_DefaultBackend(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["spec"] = map[string]interface{}{
		"defaultBackend": map[string]interface{}{
			"service": map[string]interface{}{
				"name": "fallback",
				"port": map[string]interface{}{"number": int64(8080)},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Len(t, res.RouteMetadata.BackendRefs, 1)
	assert.Equal(t, "fallback", res.RouteMetadata.BackendRefs[0].Name)
	assert.Empty(t, res.RouteMetadata.Hostnames)
}

func TestToResource_Ingress_EntryPoints(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{
		"traefik.ingress.kubernetes.io/router.entrypoints": "websecure-ext, websecure",
	}
	obj.Object["spec"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, []string{"websecure-ext", "websecure"}, res.RouteMetadata.EntryPoints)
}

func TestToResource_TraefikIngressRoute_EntryPoints(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("IngressRoute", "traefik.io/v1alpha1", "r", "default")
	obj.Object["spec"] = map[string]interface{}{
		"entryPoints": []interface{}{"web", "websecure"},
		"routes":      []interface{}{},
	}

	res := mapper.ToResource(*obj, "ingressroutes")
	assert.Equal(t, []string{"web", "websecure"}, res.RouteMetadata.EntryPoints)
}

func TestToResource_Ingress_TLS(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Ingress", "networking.k8s.io/v1", "my-ing", "default")
	obj.Object["spec"] = map[string]interface{}{
		"tls": []interface{}{
			map[string]interface{}{"secretName": "web-tls", "hosts": []interface{}{"app.example.com"}},
		},
	}

	res := mapper.ToResource(*obj, "ingresses")
	assert.Equal(t, []string{"default/web-tls"}, res.RouteMetadata.TLSSecretRefs)
}

// ── cert-manager Certificate ──────────────────────────────────────────────────────

func TestToResource_Certificate_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Certificate", "cert-manager.io/v1", "web-cert", "default")
	obj.Object["spec"] = map[string]interface{}{
		"secretName": "web-tls",
		"issuerRef":  map[string]interface{}{"name": "letsencrypt-prod", "kind": "ClusterIssuer"},
	}
	obj.Object["status"] = map[string]interface{}{
		"notAfter": "2026-09-01T00:00:00Z",
		"conditions": []interface{}{
			map[string]interface{}{"type": "Ready", "status": "True"},
		},
	}

	res := mapper.ToResource(*obj, "certificates")
	assert.Equal(t, "web-tls", res.CertificateMetadata.SecretName)
	assert.True(t, res.CertificateMetadata.Ready)
	assert.Equal(t, "letsencrypt-prod", res.CertificateMetadata.Issuer)
	assert.Equal(t, "2026-09-01T00:00:00Z", res.CertificateMetadata.NotAfter)
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Certificate_Failed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Certificate", "cert-manager.io/v1", "web-cert", "default")
	obj.Object["spec"] = map[string]interface{}{"secretName": "web-tls"}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{"type": "Ready", "status": "False", "reason": "Failed", "message": "issuance failed"},
		},
	}

	res := mapper.ToResource(*obj, "certificates")
	assert.False(t, res.CertificateMetadata.Ready)
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_Certificate_Issuing(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Certificate", "cert-manager.io/v1", "web-cert", "default")
	obj.Object["spec"] = map[string]interface{}{"secretName": "web-tls"}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{"type": "Ready", "status": "False", "reason": "Issuing"},
		},
	}

	res := mapper.ToResource(*obj, "certificates")
	assert.False(t, res.CertificateMetadata.Ready)
	assert.Equal(t, kube.StatusPending, res.Status)
}

// ── Traefik IngressRoute ────────────────────────────────────────────────────────

func TestToResource_TraefikIngressRoute(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("IngressRoute", "traefik.io/v1alpha1", "web-route", "default")
	obj.Object["spec"] = map[string]interface{}{
		"entryPoints": []interface{}{"websecure"},
		"routes": []interface{}{
			map[string]interface{}{
				"match": "Host(`app.example.com`) && PathPrefix(`/`)",
				"kind":  "Rule",
				"services": []interface{}{
					map[string]interface{}{"name": "web", "port": int64(80)},
				},
			},
			map[string]interface{}{
				"match": "Host(`api.example.com`, `alt.example.com`)",
				"services": []interface{}{
					map[string]interface{}{"name": "api", "port": int64(8080), "namespace": "other"},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingressroutes")

	assert.ElementsMatch(t, []string{"app.example.com", "api.example.com", "alt.example.com"}, res.RouteMetadata.Hostnames)
	assert.Len(t, res.RouteMetadata.BackendRefs, 2)
	assert.Equal(t, "web", res.RouteMetadata.BackendRefs[0].Name)
	assert.Equal(t, "default", res.RouteMetadata.BackendRefs[0].Namespace)
	assert.Equal(t, int32(80), res.RouteMetadata.BackendRefs[0].Port)
	assert.Equal(t, "api", res.RouteMetadata.BackendRefs[1].Name)
	assert.Equal(t, "other", res.RouteMetadata.BackendRefs[1].Namespace)
}

func TestToResource_TraefikIngressRoute_Middlewares(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("IngressRoute", "traefik.io/v1alpha1", "web-route", "default")
	obj.Object["spec"] = map[string]interface{}{
		"routes": []interface{}{
			map[string]interface{}{
				"match": "Host(`app.example.com`)",
				"middlewares": []interface{}{
					map[string]interface{}{"name": "auth"},
					map[string]interface{}{"name": "ratelimit", "namespace": "traefik"},
				},
				"services": []interface{}{
					map[string]interface{}{"name": "web", "port": int64(80)},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "ingressroutes")
	assert.Equal(t, []string{"default/auth", "traefik/ratelimit"}, res.RouteMetadata.MiddlewareRefs)
}

func TestToResource_TraefikIngressRoute_NoHost(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("IngressRoute", "traefik.io/v1alpha1", "r", "default")
	obj.Object["spec"] = map[string]interface{}{
		"routes": []interface{}{
			map[string]interface{}{
				"match":    "PathPrefix(`/metrics`)",
				"services": []interface{}{map[string]interface{}{"name": "metrics"}},
			},
		},
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "ingressroutes")
		assert.Empty(t, res.RouteMetadata.Hostnames)
		assert.Len(t, res.RouteMetadata.BackendRefs, 1)
	})
}

// ── EndpointSlice ───────────────────────────────────────────────────────────────

func TestToResource_EndpointSlice(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("EndpointSlice", "discovery.k8s.io/v1", "web-abc", "default")
	obj.Object["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{
		"kubernetes.io/service-name": "web",
	}
	obj.Object["addressType"] = "IPv4"
	obj.Object["endpoints"] = []interface{}{
		map[string]interface{}{
			"addresses":  []interface{}{"10.1.0.5"},
			"conditions": map[string]interface{}{"ready": true},
			"targetRef": map[string]interface{}{
				"kind": "Pod", "name": "web-1", "uid": "pod-uid-1",
			},
		},
		map[string]interface{}{
			"addresses":  []interface{}{"10.1.0.6"},
			"conditions": map[string]interface{}{"ready": false},
			"targetRef": map[string]interface{}{
				"kind": "Pod", "name": "web-2", "uid": "pod-uid-2",
			},
		},
	}

	res := mapper.ToResource(*obj, "endpointslices")

	assert.Equal(t, "web", res.EndpointSliceMetadata.ServiceName)
	assert.Len(t, res.EndpointSliceMetadata.Endpoints, 2)
	assert.Equal(t, "pod-uid-1", res.EndpointSliceMetadata.Endpoints[0].TargetUID)
	assert.Equal(t, "web-1", res.EndpointSliceMetadata.Endpoints[0].TargetName)
	assert.True(t, res.EndpointSliceMetadata.Endpoints[0].Ready)
	assert.False(t, res.EndpointSliceMetadata.Endpoints[1].Ready)
}

func TestToResource_EndpointSlice_NoServiceLabel(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("EndpointSlice", "discovery.k8s.io/v1", "orphan", "default")
	obj.Object["addressType"] = "IPv4"

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "endpointslices")
		assert.Equal(t, "", res.EndpointSliceMetadata.ServiceName)
		assert.Empty(t, res.EndpointSliceMetadata.Endpoints)
	})
}

// ── NetworkPolicy ─────────────────────────────────────────────────────────────────

func TestToResource_NetworkPolicy(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("NetworkPolicy", "networking.k8s.io/v1", "deny-web", "default")
	obj.Object["spec"] = map[string]interface{}{
		"podSelector": map[string]interface{}{
			"matchLabels": map[string]interface{}{"app": "web"},
		},
		"policyTypes": []interface{}{"Ingress", "Egress"},
		"ingress": []interface{}{
			map[string]interface{}{"from": []interface{}{}},
		},
	}

	res := mapper.ToResource(*obj, "networkpolicies")
	assert.Equal(t, map[string]string{"app": "web"}, res.NetworkPolicyMetadata.PodSelector)
	assert.Equal(t, []string{"Ingress", "Egress"}, res.NetworkPolicyMetadata.PolicyTypes)
	assert.Equal(t, 1, res.NetworkPolicyMetadata.IngressRules)
	assert.Equal(t, 0, res.NetworkPolicyMetadata.EgressRules)
}

// ── Gateway API ─────────────────────────────────────────────────────────────────

func TestToResource_Gateway(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Gateway", "gateway.networking.k8s.io/v1", "main", "default")
	obj.Object["spec"] = map[string]interface{}{
		"gatewayClassName": "cilium",
		"listeners": []interface{}{
			map[string]interface{}{
				"name": "http", "protocol": "HTTP", "port": int64(80),
				"hostname": "*.example.com",
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"addresses": []interface{}{
			map[string]interface{}{"type": "IPAddress", "value": "192.168.1.60"},
		},
	}

	res := mapper.ToResource(*obj, "gateways")

	assert.Equal(t, "cilium", res.GatewayMetadata.GatewayClassName)
	assert.Equal(t, []string{"192.168.1.60"}, res.GatewayMetadata.Addresses)
	assert.Len(t, res.GatewayMetadata.Listeners, 1)
	assert.Equal(t, "http", res.GatewayMetadata.Listeners[0].Name)
	assert.Equal(t, int32(80), res.GatewayMetadata.Listeners[0].Port)
	assert.Equal(t, "*.example.com", res.GatewayMetadata.Listeners[0].Hostname)
}

func TestToResource_HTTPRoute(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HTTPRoute", "gateway.networking.k8s.io/v1", "web", "default")
	obj.Object["spec"] = map[string]interface{}{
		"hostnames": []interface{}{"app.example.com"},
		"parentRefs": []interface{}{
			map[string]interface{}{"name": "main", "namespace": "infra", "sectionName": "http"},
		},
		"rules": []interface{}{
			map[string]interface{}{
				"backendRefs": []interface{}{
					map[string]interface{}{"name": "web", "port": int64(80)},
					map[string]interface{}{"name": "web-canary", "port": int64(80), "namespace": "other"},
				},
			},
		},
	}

	res := mapper.ToResource(*obj, "httproutes")

	assert.Equal(t, []string{"app.example.com"}, res.RouteMetadata.Hostnames)
	assert.Len(t, res.RouteMetadata.ParentRefs, 1)
	assert.Equal(t, "main", res.RouteMetadata.ParentRefs[0].Name)
	assert.Equal(t, "infra", res.RouteMetadata.ParentRefs[0].Namespace)
	assert.Equal(t, "http", res.RouteMetadata.ParentRefs[0].SectionName)
	assert.Len(t, res.RouteMetadata.BackendRefs, 2)
	assert.Equal(t, "web", res.RouteMetadata.BackendRefs[0].Name)
	assert.Equal(t, "default", res.RouteMetadata.BackendRefs[0].Namespace)
	assert.Equal(t, "other", res.RouteMetadata.BackendRefs[1].Namespace)
	assert.Equal(t, int32(80), res.RouteMetadata.BackendRefs[0].Port)
}

func TestToResource_HTTPRoute_ParentDefaultNamespace(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HTTPRoute", "gateway.networking.k8s.io/v1", "web", "default")
	obj.Object["spec"] = map[string]interface{}{
		"parentRefs": []interface{}{
			map[string]interface{}{"name": "main"},
		},
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "httproutes")
		assert.Equal(t, "default", res.RouteMetadata.ParentRefs[0].Namespace)
	})
}

// ── StatefulSet ───────────────────────────────────────────────────────────────

func TestToResource_StatefulSet_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("StatefulSet", "apps/v1", "my-ss", "default")
	setGeneration(obj.Object, 1)
	obj.Object["spec"] = map[string]interface{}{"replicas": int64(3)}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration": int64(1),
		"readyReplicas":      int64(3),
		"currentReplicas":    int64(3),
	}

	res := mapper.ToResource(*obj, "statefulsets")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

// ── HelmChart / HelmRepository / OCIRepository ────────────────────────────────

func TestToResource_HelmChart(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmChart", "source.toolkit.fluxcd.io/v1", "my-chart", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"suspend":   false,
		"sourceRef": map[string]interface{}{"kind": "HelmRepository", "name": "stable"},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "Succeeded",
				"message":            "ok",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "helmcharts")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_HelmRepository(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmRepository", "source.toolkit.fluxcd.io/v1", "stable", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "Succeeded",
				"message":            "ok",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "helmrepositories")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_OCIRepository(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("OCIRepository", "source.toolkit.fluxcd.io/v1beta2", "my-oci", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"url":     "oci://ghcr.io/org/repo",
		"suspend": false,
		"ref":     map[string]interface{}{"tag": "latest"},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			map[string]interface{}{
				"type":               "Ready",
				"status":             "True",
				"reason":             "Succeeded",
				"message":            "ok",
				"lastTransitionTime": "2024-01-15T10:30:00Z",
			},
		},
	}

	res := mapper.ToResource(*obj, "ocirepositories")
	assert.Equal(t, kube.StatusSuccess, res.Status)
	assert.Equal(t, "oci://ghcr.io/org/repo", res.OCIRepositoryMetadata.URL)
	assert.Equal(t, "latest", res.OCIRepositoryMetadata.Tag)
}

// ── LonghornVolume ───────────────────────────────────────────────────────────

func TestToResource_LonghornVolume(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Volume", "longhorn.io/v1beta2", "data-vol", "longhorn-system")

	res := mapper.ToResource(*obj, "volumes")

	assert.Len(t, res.ParentRefs, 1)
	assert.Contains(t, res.ParentRefs[0], "PersistentVolume")
}

// ── Unknown kind ─────────────────────────────────────────────────────────────

func TestToResource_UnknownKind(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("CronJob", "batch/v1", "my-job", "default")

	res := mapper.ToResource(*obj, "cronjobs")

	assert.Equal(t, "CronJob", res.Kind)
	assert.Equal(t, kube.StatusUnknown, res.Status)
}

// ── ToEvent ───────────────────────────────────────────────────────────────────

func TestToEvent(t *testing.T) {
	mapper := NewKubeMapper()
	k8event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			UID: types.UID("event-uid-1"),
		},
		InvolvedObject: corev1.ObjectReference{
			Kind:      "Pod",
			Name:      "my-pod",
			Namespace: "default",
			UID:       "pod-uid-1",
		},
		Reason:  "Started",
		Message: "Container started successfully",
		Source:  corev1.EventSource{Component: "kubelet"},
		Type:    "Normal",
		Count:   5,
	}

	event := mapper.ToEvent(k8event)

	assert.Equal(t, types.UID("event-uid-1"), event.UID)
	assert.Equal(t, "Pod", event.Kind)
	assert.Equal(t, "my-pod", event.Name)
	assert.Equal(t, "default", event.Namespace)
	assert.Equal(t, "Started", event.Reason)
	assert.Equal(t, "Container started successfully", event.Message)
	assert.Equal(t, "kubelet", event.Source)
	assert.Equal(t, "pod-uid-1", event.ResourceUID)
	assert.Equal(t, "Normal", event.Type)
	assert.Equal(t, int32(5), event.Count)
}

// ── refGroupAndVersion / makeRef / GetRefVersion ─────────────────────────────

func TestRefGroupAndVersion_CoreGroup(t *testing.T) {
	group, version := refGroupAndVersion("v1")
	assert.Equal(t, "core", group)
	assert.Equal(t, "v1", version)
}

func TestRefGroupAndVersion_CustomGroup(t *testing.T) {
	group, version := refGroupAndVersion("apps/v1")
	assert.Equal(t, "apps", group)
	assert.Equal(t, "v1", version)
}

func TestToResource_Deployment_NilReplicas(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Deployment", "apps/v1", "my-deploy", "default")
	setGeneration(obj.Object, 1)
	obj.Object["spec"] = map[string]interface{}{
		"template": map[string]interface{}{
			"spec": map[string]interface{}{"containers": []interface{}{}},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration": int64(1),
		"readyReplicas":      int64(0),
	}

	assert.NotPanics(t, func() {
		res := mapper.ToResource(*obj, "deployments")
		assert.Equal(t, kube.StatusPending, res.Status)
	})
}

func TestToResource_StatefulSet_NilReplicas(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("StatefulSet", "apps/v1", "my-ss", "default")
	setGeneration(obj.Object, 1)
	obj.Object["spec"] = map[string]interface{}{}
	obj.Object["status"] = map[string]interface{}{
		"observedGeneration": int64(1),
		"readyReplicas":      int64(0),
	}

	assert.NotPanics(t, func() {
		mapper.ToResource(*obj, "statefulsets")
	})
}

func fluxReadyCondition(status, reason string) map[string]interface{} {
	return map[string]interface{}{
		"type":               "Ready",
		"status":             status,
		"reason":             reason,
		"message":            "msg",
		"lastTransitionTime": "2024-01-15T10:30:00Z",
	}
}

func fluxReconcilingCondition() map[string]interface{} {
	return map[string]interface{}{
		"type":               "Reconciling",
		"status":             "True",
		"reason":             "Progressing",
		"message":            "reconciling",
		"lastTransitionTime": "2024-01-15T10:30:00Z",
	}
}

func TestToResource_Kustomization_DependencyNotReady_IsPending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Kustomization", "kustomize.toolkit.fluxcd.io/v1", "my-ks", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"path":      "./clusters/prod",
		"suspend":   false,
		"sourceRef": map[string]interface{}{"kind": "GitRepository", "name": "flux-system"},
		"dependsOn": []interface{}{map[string]interface{}{"name": "longhorn"}},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("False", "DependencyNotReady"),
		},
	}

	res := mapper.ToResource(*obj, "kustomizations")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_Kustomization_Suspended_StatusIsSuspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Kustomization", "kustomize.toolkit.fluxcd.io/v1", "adguard", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"path":      "./k3s/apps/base/adguard",
		"suspend":   true,
		"sourceRef": map[string]interface{}{"kind": "GitRepository", "name": "flux-system"},
	}
	// Ready=True from a previous successful reconciliation — suspend must win
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "ReconciliationSucceeded"),
		},
	}

	res := mapper.ToResource(*obj, "kustomizations")
	assert.Equal(t, kube.StatusSuspended, res.Status)
	assert.True(t, res.FluxMetadata.IsSuspended)
}

func TestToResource_HelmRelease_Suspended_StatusIsSuspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmRelease", "helm.toolkit.fluxcd.io/v2", "my-hr", "default")
	obj.Object["spec"] = map[string]interface{}{
		"suspend": true,
		"chart": map[string]interface{}{
			"spec": map[string]interface{}{
				"sourceRef": map[string]interface{}{"kind": "HelmRepository", "name": "stable"},
			},
		},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "InstallSucceeded"),
		},
	}

	res := mapper.ToResource(*obj, "helmreleases")
	assert.Equal(t, kube.StatusSuspended, res.Status)
	assert.True(t, res.FluxMetadata.IsSuspended)
}

func TestToResource_GitRepository_Suspended_StatusIsSuspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("GitRepository", "source.toolkit.fluxcd.io/v1", "flux-system", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"url":     "https://github.com/org/repo",
		"suspend": true,
		"ref":     map[string]interface{}{"branch": "main"},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "gitrepositories")
	assert.Equal(t, kube.StatusSuspended, res.Status)
}

func TestToResource_OCIRepository_Suspended_StatusIsSuspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("OCIRepository", "source.toolkit.fluxcd.io/v1beta2", "my-oci", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"url":     "oci://ghcr.io/org/repo",
		"suspend": true,
		"ref":     map[string]interface{}{"tag": "latest"},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "ocirepositories")
	assert.Equal(t, kube.StatusSuspended, res.Status)
}

func TestToResource_HelmRepository_OCI_NoConditions_IsSuccess(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmRepository", "source.toolkit.fluxcd.io/v1", "oci-repo", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"type":    "oci",
		"suspend": false,
	}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "helmrepositories")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_HelmRepository_NonOCI_NoConditions_IsPending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("HelmRepository", "source.toolkit.fluxcd.io/v1", "helm-repo", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"suspend": false,
	}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "helmrepositories")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_FluxResource_IsReconcilingFromCondition(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Kustomization", "kustomize.toolkit.fluxcd.io/v1", "my-ks", "flux-system")
	obj.Object["spec"] = map[string]interface{}{
		"path":      "./clusters/prod",
		"suspend":   false,
		"sourceRef": map[string]interface{}{"kind": "GitRepository", "name": "flux-system"},
	}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("Unknown", "Progressing"),
			fluxReconcilingCondition(),
		},
	}

	res := mapper.ToResource(*obj, "kustomizations")
	assert.Equal(t, kube.StatusPending, res.Status)
	assert.True(t, res.FluxMetadata.IsReconciling)
}

// ── New Flux resource types ───────────────────────────────────────────────────

func TestToResource_Alert_NoConditions_IsSuccess(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Alert", "notification.toolkit.fluxcd.io/v1beta3", "my-alert", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "alerts")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Alert_WithReadyCondition_IsSuccess(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Alert", "notification.toolkit.fluxcd.io/v1beta3", "my-alert", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "alerts")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Alert_Failed_IsFailed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Alert", "notification.toolkit.fluxcd.io/v1beta3", "my-alert", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("False", "ValidationFailed"),
		},
	}

	res := mapper.ToResource(*obj, "alerts")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_Alert_Suspended_IsSuspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Alert", "notification.toolkit.fluxcd.io/v1beta3", "my-alert", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": true}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "alerts")
	assert.Equal(t, kube.StatusSuspended, res.Status)
	assert.True(t, res.FluxMetadata.IsSuspended)
}

func TestToResource_Provider_NoConditions_IsSuccess(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Provider", "notification.toolkit.fluxcd.io/v1beta3", "slack", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "providers")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Receiver_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Receiver", "notification.toolkit.fluxcd.io/v1", "github", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "receivers")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_Receiver_NoConditions_IsPending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("Receiver", "notification.toolkit.fluxcd.io/v1", "github", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{}

	res := mapper.ToResource(*obj, "receivers")
	assert.Equal(t, kube.StatusPending, res.Status)
}

func TestToResource_ImageRepository_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ImageRepository", "image.toolkit.fluxcd.io/v1beta2", "my-image", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "imagerepositories")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_ImageRepository_Suspended(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ImageRepository", "image.toolkit.fluxcd.io/v1beta2", "my-image", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": true}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "imagerepositories")
	assert.Equal(t, kube.StatusSuspended, res.Status)
}

func TestToResource_ImagePolicy_Failed(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ImagePolicy", "image.toolkit.fluxcd.io/v1beta2", "my-policy", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("False", "InvalidPolicy"),
		},
	}

	res := mapper.ToResource(*obj, "imagepolicies")
	assert.Equal(t, kube.StatusFailed, res.Status)
}

func TestToResource_ImageUpdateAutomation_Ready(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ImageUpdateAutomation", "image.toolkit.fluxcd.io/v1beta2", "my-auto", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("True", "Succeeded"),
		},
	}

	res := mapper.ToResource(*obj, "imageupdateautomations")
	assert.Equal(t, kube.StatusSuccess, res.Status)
}

func TestToResource_ImageUpdateAutomation_DependencyNotReady_IsPending(t *testing.T) {
	mapper := NewKubeMapper()
	obj := newUnstructuredResource("ImageUpdateAutomation", "image.toolkit.fluxcd.io/v1beta2", "my-auto", "flux-system")
	obj.Object["spec"] = map[string]interface{}{"suspend": false}
	obj.Object["status"] = map[string]interface{}{
		"conditions": []interface{}{
			fluxReadyCondition("False", "DependencyNotReady"),
		},
	}

	res := mapper.ToResource(*obj, "imageupdateautomations")
	assert.Equal(t, kube.StatusPending, res.Status)
}
