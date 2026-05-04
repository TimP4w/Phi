package kubernetes

import (
	"testing"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
		"lastAppliedRevision":  "main@sha1:abc123",
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
		"suspend": false,
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

func TestGetRefVersion(t *testing.T) {
	assert.Equal(t, "v1", GetRefVersion("v1"))
	assert.Equal(t, "v1", GetRefVersion("apps/v1"))
}
