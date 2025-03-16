package kubernetes

import (
	"log"
	"strings"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"

	helmv2 "github.com/fluxcd/helm-controller/api/v2"
	kustomizev1 "github.com/fluxcd/kustomize-controller/api/v1"
	sourcev1 "github.com/fluxcd/source-controller/api/v1"
	sourcev1beta2 "github.com/fluxcd/source-controller/api/v1beta2"
	appsV1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

type KubeMapper struct {
}

func NewKubeMapper() *KubeMapper {
	return &KubeMapper{}
}

func GetRefVersion(version string) string {
	versionParts := strings.Split(version, "/")
	if len(versionParts) > 1 {
		return versionParts[1]
	}
	return version
}

func (mapper *KubeMapper) ToResource(obj unstructured.Unstructured, resource string) kube.Resource {
	el := kube.Resource{
		Kind:       obj.GetKind(),
		Version:    obj.GetAPIVersion(),
		Namespace:  obj.GetNamespace(),
		Name:       obj.GetName(),
		Resource:   resource,
		UID:        string(obj.GetUID()),
		Labels:     obj.GetLabels(),
		Group:      obj.GetObjectKind().GroupVersionKind().Group,
		Status:     kube.StatusUnknown,
		Conditions: []kube.Condition{},
		Events:     []kube.Event{},
		Children:   []kube.Resource{},
		CreatedAt:  obj.GetCreationTimestamp().Time,
		ParentRefs: []string{},
	}

	if obj.GetDeletionTimestamp() != nil {
		el.DeletedAt = obj.GetDeletionTimestamp().Time
	}

	for _, ownerRef := range obj.GetOwnerReferences() {
		el.ParentIDs = append(el.ParentIDs, string(ownerRef.UID))
	}

	for _, ownerRef := range obj.GetOwnerReferences() {
		ref := ownerRef.Name + "_" + obj.GetNamespace() + "_" + ownerRef.Kind + "_" + GetRefVersion(ownerRef.APIVersion)
		el.ParentRefs = append(el.ParentRefs, ref)
	}

	switch el.Kind {
	case "Pod":
		getPodData(&el, obj)
	case "Deployment":
		getDeploymentData(&el, obj)
	case "Kustomization":
		getKustomizationData(&el, obj)
	case "HelmRelease":
		getHelmReleaseData(&el, obj)
	case "GitRepository":
		getGitRepositoryData(&el, obj)
	case "HelmChart":
		getHelmChartData(&el, obj)
	case "HelmRepository":
		getHelmRepositoryData(&el, obj)
	case "OCIRepository":
		getOciRepositoryData(&el, obj)
	case "PersistentVolumeClaim":
		getPVCData(&el, obj)
	case "PersistentVolume":
		getPVData(&el, obj)
	// case "Bucket":
	default:
		// do nothing
	}

	return el
}

func (mapper *KubeMapper) ToEvent(k8event *v1.Event) kube.Event {
	return kube.Event{
		UID:           k8event.UID,
		Kind:          k8event.InvolvedObject.Kind,
		Name:          k8event.InvolvedObject.Name,
		Namespace:     k8event.InvolvedObject.Namespace,
		Reason:        k8event.Reason,
		Message:       k8event.Message,
		Source:        k8event.Source.Component,
		ResourceUID:   string(k8event.InvolvedObject.UID),
		Type:          k8event.Type,
		FirstObserved: k8event.FirstTimestamp.Time,
		LastObserved:  k8event.LastTimestamp.Time,
		Count:         k8event.Count,
	}
}

type KubeResourceWithConditions struct {
}

func mapConditions(el *kube.Resource, conditions []metav1.Condition) []kube.Condition {
	for _, condition := range conditions {
		el.Conditions = append(el.Conditions, kube.Condition{
			Message:            condition.Message,
			Reason:             condition.Reason,
			Status:             string(condition.Status),
			Type:               string(condition.Type),
			LastTransitionTime: condition.LastTransitionTime.Time,
		})
	}

	return el.Conditions
}

func mapFluxMetadata(el *kube.Resource, annotations map[string]string, lastReconcileTimeStr string, isSuspended bool) {
	isReconciling := false
	didManuallyReconcile, exists := annotations["reconcile.fluxcd.io/requestedAt"]
	didManuallyReconcileTime, err := time.Parse(time.RFC3339Nano, didManuallyReconcile)
	var lastReconcileTime time.Time
	if err == nil {
		lastReconcileTime, err = time.Parse(time.RFC3339Nano, lastReconcileTimeStr)
		if err == nil {
			isReconciling = exists && lastReconcileTime.Before(didManuallyReconcileTime)
		}
	}

	el.FluxMetadata = kube.FluxMetadata{
		IsReconciling:          isReconciling,
		IsSuspended:            isSuspended,
		LastHandledReconcileAt: lastReconcileTime,
	}
}

func getHelmChartData(el *kube.Resource, obj unstructured.Unstructured) {
	helmChart := &sourcev1.HelmChart{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmChart)
	if err != nil {
		log.Default().Printf("Error converting unstructured to HelmChart: %v", err)
		return
	}

	mapConditions(el, helmChart.Status.Conditions)
	mapFluxMetadata(el, helmChart.GetAnnotations(), helmChart.Status.LastHandledReconcileAt, helmChart.Spec.Suspend)
}

func getGitRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	gitRepository := &sourcev1.GitRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), gitRepository)
	if err != nil {
		log.Default().Printf("Error converting unstructured to GitRepository: %v", err)
		return
	}

	mapConditions(el, gitRepository.Status.Conditions)
	mapFluxMetadata(el, gitRepository.GetAnnotations(), gitRepository.Status.LastHandledReconcileAt, gitRepository.Spec.Suspend)

	el.GitRepositoryMetadata = kube.GitRepositoryMetadata{
		URL:    gitRepository.Spec.URL,
		Branch: gitRepository.Spec.Reference.Branch,
		Tag:    gitRepository.Spec.Reference.Tag,
		Semver: gitRepository.Spec.Reference.SemVer,
		Name:   gitRepository.Spec.Reference.Name,
		Commit: gitRepository.Spec.Reference.Commit,
	}

}

func getOciRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	ociRepository := &sourcev1beta2.OCIRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), ociRepository)
	if err != nil {
		log.Default().Printf("Error converting unstructured to OCIRepository: %v", err)
		return
	}

	mapConditions(el, ociRepository.Status.Conditions)
	mapFluxMetadata(el, ociRepository.GetAnnotations(), ociRepository.Status.LastHandledReconcileAt, ociRepository.Spec.Suspend)

	el.OCIRepositoryMetadata = kube.OCIRepositoryMetadata{
		URL:          ociRepository.Spec.URL,
		Digest:       ociRepository.Spec.Reference.Digest,
		Tag:          ociRepository.Spec.Reference.Tag,
		Semver:       ociRepository.Spec.Reference.SemVer,
		SemverFilter: ociRepository.Spec.Reference.SemverFilter,
	}

}

func getHelmRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	helmRepository := &sourcev1.HelmRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmRepository)
	if err != nil {
		log.Default().Printf("Error converting unstructured to HelmRepository: %v", err)
		return
	}
	mapConditions(el, helmRepository.Status.Conditions)
	mapFluxMetadata(el, helmRepository.GetAnnotations(), helmRepository.Status.LastHandledReconcileAt, helmRepository.Spec.Suspend)
}

func getPodData(el *kube.Resource, obj unstructured.Unstructured) {
	pod := &v1.Pod{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pod)
	if err != nil {
		log.Default().Printf("Error converting unstructured to Pod: %v", err)
		return
	}

	for _, condition := range pod.Status.Conditions {
		el.Conditions = append(el.Conditions, kube.Condition{
			Message:            condition.Message,
			Reason:             condition.Reason,
			Status:             string(condition.Status),
			Type:               string(condition.Type),
			LastTransitionTime: condition.LastTransitionTime.Time,
		})
	}

	if (pod.Status.Phase == v1.PodRunning || pod.Status.Phase == v1.PodSucceeded) && pod.DeletionTimestamp == nil {
		el.Status = kube.StatusSuccess
	} else if pod.Status.Phase == v1.PodPending {
		el.Status = kube.StatusPending
	} else if pod.Status.Phase == v1.PodFailed {
		el.Status = kube.StatusFailed
	} else {
		el.Status = kube.StatusWarning
	}

	el.PodMetadata = kube.PodMetadata{
		Phase: string(pod.Status.Phase),
		Image: pod.Spec.Containers[0].Image,
	}

}

func getPVCData(el *kube.Resource, obj unstructured.Unstructured) {
	pvc := &v1.PersistentVolumeClaim{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pvc)
	if err != nil {
		log.Default().Printf("Error converting unstructured to PVC: %v", err)
		return
	}

	el.PVCMetadata = kube.PVCMetadata{
		StorageClass: *pvc.Spec.StorageClassName,
		VolumeName:   pvc.Spec.VolumeName,
		VolumeMode:   string(*pvc.Spec.VolumeMode),
		AccessModes:  []string{},
		Capacity:     map[string]string{},
		Phase:        string(pvc.Status.Phase),
	}

	for _, accessMode := range pvc.Spec.AccessModes {
		el.PVCMetadata.AccessModes = append(el.PVCMetadata.AccessModes, string(accessMode))
	}

	for key, value := range pvc.Status.Capacity {
		el.PVCMetadata.Capacity[string(key)] = value.String()
	}

	switch pvc.Status.Phase {
	case v1.ClaimBound:
		el.Status = kube.StatusSuccess
	case v1.ClaimPending:
		el.Status = kube.StatusPending
	case v1.ClaimLost:
		el.Status = kube.StatusFailed
	}
}

func getPVData(el *kube.Resource, obj unstructured.Unstructured) {
	pv := &v1.PersistentVolume{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pv)
	if err != nil {
		log.Default().Printf("Error converting unstructured to PV: %v", err)
		return
	}

	el.ParentRefs = append(el.ParentRefs, pv.Spec.ClaimRef.Name+"_"+pv.Spec.ClaimRef.Namespace+"_"+pv.Spec.ClaimRef.Kind+"_"+GetRefVersion(pv.Spec.ClaimRef.APIVersion))
}

func getDeploymentData(el *kube.Resource, obj unstructured.Unstructured) {
	deployment := &appsV1.Deployment{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), deployment)
	if err != nil {
		log.Default().Printf("Error converting unstructured to Deployment: %v", err)
		return
	}

	for _, condition := range deployment.Status.Conditions {
		el.Conditions = append(el.Conditions, kube.Condition{
			Message:            condition.Message,
			Reason:             condition.Reason,
			Status:             string(condition.Status),
			Type:               string(condition.Type),
			LastTransitionTime: condition.LastTransitionTime.Time,
		})

		if condition.Type == "Progressing" && condition.Status == "True" {
			switch condition.Reason {
			case "NewReplicaSetCreated", "FoundNewReplicaSet", "ReplicaSetUpdated":
				el.Status = kube.StatusPending
			case "NewReplicaSetAvailable":
				el.Status = kube.StatusSuccess
			}
		} else if condition.Type == "Progressing" && condition.Status == "False" && condition.Reason == "ProgressDeadlineExceeded" {
			el.Status = kube.StatusFailed
		} else if condition.Type == "StateError" && condition.Status == "True" {
			el.Status = kube.StatusFailed
		}
	}

	el.DeploymentMetadata = kube.DeploymentMetadata{
		Replicas:          deployment.Status.Replicas,
		ReadyReplicas:     deployment.Status.ReadyReplicas,
		UpdatedReplicas:   deployment.Status.UpdatedReplicas,
		AvailableReplicas: deployment.Status.AvailableReplicas,
	}

}

func getKustomizationData(el *kube.Resource, obj unstructured.Unstructured) {
	// Convert the unstructured object to a Kustomization object
	kustomization := &kustomizev1.Kustomization{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), kustomization)
	if err != nil {
		log.Default().Printf("Error converting unstructured to Kustomization: %v", err)
		return
	}

	mapConditions(el, kustomization.Status.Conditions)
	mapFluxMetadata(el, kustomization.GetAnnotations(), kustomization.Status.LastHandledReconcileAt, kustomization.Spec.Suspend)

	status := kube.StatusSuccess
	for _, condition := range kustomization.Status.Conditions {
		if condition.Type == "Ready" && condition.Status != "True" {
			if condition.Reason == "Progressing" || condition.Reason == "Suspended" || condition.Reason == "DependencyNotReady" {
				status = kube.StatusPending
			} else if condition.Reason == "ProgressingWithRetry" {
				status = kube.StatusWarning
			} else {
				status = kube.StatusFailed
			}
		} else if condition.Type == "Stalled" {
			status = kube.StatusWarning
		}
		// "Reconciling", "Healthy" can be ignored to evaluate status
	}
	el.Status = status

	el.KustomizationMetadata = kube.KustomizationMetadata{
		Path:          kustomization.Spec.Path,
		IsReconciling: el.FluxMetadata.IsReconciling, // deprecated
		IsSuspended:   el.FluxMetadata.IsSuspended,   // deprecated
		SourceRef: kube.SourceRef{
			Kind:      kustomization.Spec.SourceRef.Kind,
			Name:      kustomization.Spec.SourceRef.Name,
			Namespace: kustomization.Spec.SourceRef.Namespace,
		},
		LastAppliedRevision:    kustomization.Status.LastAppliedRevision,
		LastAttemptedRevision:  kustomization.Status.LastAttemptedRevision,
		LastHandledReconcileAt: el.FluxMetadata.LastHandledReconcileAt, // deprecated
	}

}

func getHelmReleaseData(el *kube.Resource, obj unstructured.Unstructured) {
	helmRelease := &helmv2.HelmRelease{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmRelease)
	if err != nil {
		log.Default().Printf("Error converting unstructured to HelmRelease: %v", err)
		return
	}
	mapConditions(el, helmRelease.Status.Conditions)
	mapFluxMetadata(el, helmRelease.GetAnnotations(), helmRelease.Status.LastHandledReconcileAt, helmRelease.Spec.Suspend)

	// Status
	status := kube.StatusSuccess
	for _, condition := range helmRelease.Status.Conditions {
		// https://github.com/fluxcd/helm-controller/blob/e05c4ffc4b2141f6f918329496df70e2c5ac1e6e/api/v2/condition_types.go#L37
		if condition.Type == "Ready" && condition.Status != "True" {
			if condition.Reason == "Progressing" || condition.Reason == "Suspended" {
				status = kube.StatusPending
			} else if condition.Reason == "ProgressingWithRetry" {
				status = kube.StatusWarning
			} else {
				status = kube.StatusFailed
			}
		} else if condition.Type == "TestSuccess" {
			if condition.Status != "True" {
				status = kube.StatusFailed
			}
		} else if condition.Type == "Remediate" {
			if condition.Status != "True" {
				status = kube.StatusFailed
			} else {
				status = kube.StatusPending
			}

		}
	}

	el.Status = status

	el.HelmReleaseMetadata = kube.HelmReleaseMetadata{
		ChartName:     helmRelease.GetHelmChartName(),
		IsReconciling: el.FluxMetadata.IsReconciling, // deprecated
		IsSuspended:   el.FluxMetadata.IsSuspended,   // deprecated
		SourceRef: kube.SourceRef{
			Kind:      helmRelease.Spec.Chart.Spec.SourceRef.Kind,
			Name:      helmRelease.Spec.Chart.Spec.SourceRef.Name,
			Namespace: helmRelease.Spec.Chart.Spec.SourceRef.Namespace,
		},
	}

	if helmRelease.Status.History.Len() > 0 {
		el.HelmReleaseMetadata.ChartVersion = helmRelease.Status.History.Latest().ChartVersion
	} else {
		el.HelmReleaseMetadata.ChartVersion = "unknown"
	}

}
