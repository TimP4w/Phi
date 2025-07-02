package kubernetes

import (
	"strings"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"

	helmv2 "github.com/fluxcd/helm-controller/api/v2"
	kustomizev1 "github.com/fluxcd/kustomize-controller/api/v1"
	sourcev1 "github.com/fluxcd/source-controller/api/v1"
	sourcev1beta2 "github.com/fluxcd/source-controller/api/v1beta2"
	appsV1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
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
		Kind:        obj.GetKind(),
		Version:     obj.GetAPIVersion(),
		Namespace:   obj.GetNamespace(),
		Name:        obj.GetName(),
		Resource:    resource,
		UID:         string(obj.GetUID()),
		Labels:      obj.GetLabels(),
		Annotations: obj.GetAnnotations(),
		Group:       obj.GetObjectKind().GroupVersionKind().Group,
		Status:      kube.StatusUnknown,
		Conditions:  []kube.Condition{},
		Events:      []kube.Event{},
		Children:    []kube.Resource{},
		CreatedAt:   obj.GetCreationTimestamp().Time,
		ParentRefs:  []string{},
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
	case "Kustomization":
		mapKustomizationData(&el, obj)
	case "HelmRelease":
		mapHelmReleaseData(&el, obj)
	case "GitRepository":
		mapGitRepositoryData(&el, obj)
	case "HelmChart":
		mapHelmChartData(&el, obj)
	case "HelmRepository":
		mapHelmRepositoryData(&el, obj)
	case "OCIRepository":
		mapOciRepositoryData(&el, obj)
	// case "Bucket":
	case "Pod": // TODO: these should be consts...
		mapPodData(&el, obj)
	case "Deployment":
		mapDeploymentData(&el, obj)
	case "PersistentVolumeClaim":
		mapPVCData(&el, obj)
	case "PersistentVolume":
		mapPVData(&el, obj)
	case "Volume": // TODO: here we need to double check that this is indeed a longhorn Volume and not another driver that also calls them "Volume"
		mapLonghornVolume(&el, obj)
	case "Ingress":
		mapIngressData(&el, obj)
	case "StatefulSet":
		mapStatefulSetData(&el, obj)
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

func mapFluxMetadata(el *kube.Resource, annotations map[string]string, lastReconcileTimeStr string, isSuspended bool, conditions []metav1.Condition) {
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

	var lastSyncAt time.Time
	for _, cond := range conditions {
		if cond.Type == "Ready" {
			t, err := time.Parse(time.RFC3339Nano, cond.LastTransitionTime.Format(time.RFC3339Nano))
			if err == nil {
				lastSyncAt = t
			}
			break
		}
	}

	el.FluxMetadata = kube.FluxMetadata{
		IsReconciling:          isReconciling,
		IsSuspended:            isSuspended,
		LastHandledReconcileAt: lastReconcileTime,
		LastSyncAt:             lastSyncAt,
	}
}

func mapHelmChartData(el *kube.Resource, obj unstructured.Unstructured) {
	helmChart := &sourcev1.HelmChart{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmChart)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to HelmChart")
		return
	}
	el.Status = mapFluxResourceStatusForCondition(&helmChart.Status.Conditions)

	mapConditions(el, helmChart.Status.Conditions)
	mapFluxMetadata(el, helmChart.GetAnnotations(), helmChart.Status.LastHandledReconcileAt, helmChart.Spec.Suspend, helmChart.Status.Conditions)
}

func mapGitRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	gitRepository := &sourcev1.GitRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), gitRepository)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to GitRepository")
		return
	}

	mapConditions(el, gitRepository.Status.Conditions)
	mapFluxMetadata(el, gitRepository.GetAnnotations(), gitRepository.Status.LastHandledReconcileAt, gitRepository.Spec.Suspend, gitRepository.Status.Conditions)

	el.Status = mapFluxResourceStatusForCondition(&gitRepository.Status.Conditions)

	el.GitRepositoryMetadata = kube.GitRepositoryMetadata{
		URL:    gitRepository.Spec.URL,
		Branch: gitRepository.Spec.Reference.Branch,
		Tag:    gitRepository.Spec.Reference.Tag,
		Semver: gitRepository.Spec.Reference.SemVer,
		Name:   gitRepository.Spec.Reference.Name,
		Commit: gitRepository.Spec.Reference.Commit,
	}

}

func checkInList(s string, list []string) bool {
	for _, item := range list {
		if s == item {
			return true
		}
	}
	return false
}

func mapFluxResourceStatusForCondition(conditions *[]metav1.Condition) kube.Status {
	// https://github.com/fluxcd/source-controller/blob/main/api/v1/condition_types.go

	for _, condition := range *conditions {
		if condition.Type == "Ready" {
			switch condition.Status {
			case metav1.ConditionTrue:
				return kube.StatusSuccess
			case metav1.ConditionFalse:
				return kube.StatusFailed
			case metav1.ConditionUnknown:
				return kube.StatusPending
			}
		}
	}
	return kube.StatusPending
}

func mapOciRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	ociRepository := &sourcev1beta2.OCIRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), ociRepository)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to OCIRepository")
		return
	}

	mapConditions(el, ociRepository.Status.Conditions)
	mapFluxMetadata(el, ociRepository.GetAnnotations(), ociRepository.Status.LastHandledReconcileAt, ociRepository.Spec.Suspend, ociRepository.Status.Conditions)
	el.Status = mapFluxResourceStatusForCondition(&ociRepository.Status.Conditions)

	el.OCIRepositoryMetadata = kube.OCIRepositoryMetadata{
		URL:          ociRepository.Spec.URL,
		Digest:       ociRepository.Spec.Reference.Digest,
		Tag:          ociRepository.Spec.Reference.Tag,
		Semver:       ociRepository.Spec.Reference.SemVer,
		SemverFilter: ociRepository.Spec.Reference.SemverFilter,
	}

}

func mapHelmRepositoryData(el *kube.Resource, obj unstructured.Unstructured) {
	helmRepository := &sourcev1.HelmRepository{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmRepository)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to HelmRepository")
		return
	}
	mapConditions(el, helmRepository.Status.Conditions)
	el.Status = mapFluxResourceStatusForCondition(&helmRepository.Status.Conditions)

	mapFluxMetadata(el, helmRepository.GetAnnotations(), helmRepository.Status.LastHandledReconcileAt, helmRepository.Spec.Suspend, helmRepository.Status.Conditions)
}

func mapPodData(el *kube.Resource, obj unstructured.Unstructured) {
	pod := &v1.Pod{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pod)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Pod")
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

	mapPodStatus := func(pod *v1.Pod) kube.Status {
		if pod.DeletionTimestamp != nil {
			return kube.StatusPending
		}
		switch pod.Status.Phase {
		case v1.PodRunning, v1.PodSucceeded:
			return kube.StatusSuccess
		case v1.PodPending:
			return kube.StatusPending
		case v1.PodFailed:
			return kube.StatusFailed
		default:
			return kube.StatusWarning
		}
	}
	el.Status = mapPodStatus(pod)

	el.PodMetadata = kube.PodMetadata{
		Phase: string(pod.Status.Phase),
		Image: pod.Spec.Containers[0].Image,
	}

}

func mapPVCData(el *kube.Resource, obj unstructured.Unstructured) {
	pvc := &v1.PersistentVolumeClaim{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pvc)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to PVC")
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

	mapPVCStatus := func(pvc *v1.PersistentVolumeClaim) kube.Status {
		if pvc.DeletionTimestamp != nil {
			return kube.StatusPending
		}
		switch pvc.Status.Phase {
		case v1.ClaimBound:
			return kube.StatusSuccess
		case v1.ClaimPending:
			return kube.StatusPending
		case v1.ClaimLost:
			return kube.StatusFailed
		default:
			return kube.StatusWarning
		}
	}

	el.Status = mapPVCStatus(pvc)
}

func mapPVData(el *kube.Resource, obj unstructured.Unstructured) {
	pv := &v1.PersistentVolume{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pv)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to PV")
		return
	}

	mapPVStatus := func(pv *v1.PersistentVolume) kube.Status {
		if pv.DeletionTimestamp != nil {
			return kube.StatusPending
		}
		switch pv.Status.Phase {
		case v1.VolumeAvailable, v1.VolumeBound:
			return kube.StatusSuccess
		case v1.VolumeReleased:
			return kube.StatusWarning
		case v1.VolumeFailed:
			return kube.StatusFailed
		default:
			return kube.StatusPending
		}
	}

	el.Status = mapPVStatus(pv)

	el.ParentRefs = append(el.ParentRefs, pv.Spec.ClaimRef.Name+"_"+pv.Spec.ClaimRef.Namespace+"_"+pv.Spec.ClaimRef.Kind+"_"+GetRefVersion(pv.Spec.ClaimRef.APIVersion))
}

func mapLonghornVolume(el *kube.Resource, obj unstructured.Unstructured) {
	volume := &unstructured.Unstructured{}
	volume.Object = obj.UnstructuredContent()

	pvName := obj.GetName()
	parentRef := pvName + "__PersistentVolume_v1" // PV is cluster-scoped, so namespace is omitted or set to "_"

	el.ParentRefs = append(el.ParentRefs, parentRef)
}

func mapDeploymentData(el *kube.Resource, obj unstructured.Unstructured) {
	deployment := &appsV1.Deployment{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), deployment)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Deployment")
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
	}

	mapDeploymentStatus := func(deploy *appsV1.Deployment) kube.Status {
		if deploy.DeletionTimestamp != nil {
			return kube.StatusPending
		}

		for _, cond := range deploy.Status.Conditions {
			if cond.Type == appsV1.DeploymentProgressing && cond.Reason == "ProgressDeadlineExceeded" && cond.Status == v1.ConditionFalse {
				return kube.StatusFailed
			}
			if cond.Type == appsV1.DeploymentReplicaFailure && cond.Status == v1.ConditionTrue {
				return kube.StatusFailed
			}
		}

		if deploy.Status.ObservedGeneration < deploy.Generation {
			return kube.StatusPending
		}

		if deploy.Status.UnavailableReplicas > 0 {
			return kube.StatusWarning
		}

		if deploy.Status.ReadyReplicas == *deploy.Spec.Replicas {
			return kube.StatusSuccess
		}

		return kube.StatusPending
	}

	el.Status = mapDeploymentStatus(deployment)

	var images []string
	for _, container := range deployment.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	el.DeploymentMetadata = kube.DeploymentMetadata{
		Replicas:          deployment.Status.Replicas,
		ReadyReplicas:     deployment.Status.ReadyReplicas,
		UpdatedReplicas:   deployment.Status.UpdatedReplicas,
		AvailableReplicas: deployment.Status.AvailableReplicas,
		Images:            images,
	}

}

func mapKustomizationData(el *kube.Resource, obj unstructured.Unstructured) {
	// Convert the unstructured object to a Kustomization object
	kustomization := &kustomizev1.Kustomization{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), kustomization)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Kustomization")
		return
	}

	mapConditions(el, kustomization.Status.Conditions)
	mapFluxMetadata(el, kustomization.GetAnnotations(), kustomization.Status.LastHandledReconcileAt, kustomization.Spec.Suspend, kustomization.Status.Conditions)

	el.Status = mapFluxResourceStatusForCondition(&kustomization.Status.Conditions)

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

func mapHelmReleaseData(el *kube.Resource, obj unstructured.Unstructured) {
	helmRelease := &helmv2.HelmRelease{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), helmRelease)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to HelmRelease")
		return
	}
	mapConditions(el, helmRelease.Status.Conditions)
	mapFluxMetadata(el, helmRelease.GetAnnotations(), helmRelease.Status.LastHandledReconcileAt, helmRelease.Spec.Suspend, helmRelease.Status.Conditions)
	el.Status = mapFluxResourceStatusForCondition(&helmRelease.Status.Conditions)

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

func mapIngressData(el *kube.Resource, obj unstructured.Unstructured) {
	ing := &networkingv1.Ingress{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), ing)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Ingress")
		return
	}

	mapIngressStatus := func(ing *networkingv1.Ingress) kube.Status {
		if ing.DeletionTimestamp != nil {
			return kube.StatusPending
		}
		if len(ing.Status.LoadBalancer.Ingress) == 0 {
			return kube.StatusPending
		}
		return kube.StatusSuccess
	}

	el.Status = mapIngressStatus(ing)
}

func mapStatefulSetData(el *kube.Resource, obj unstructured.Unstructured) {
	ss := &appsV1.StatefulSet{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), ss)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to StatefulSet")
		return
	}

	for _, condition := range ss.Status.Conditions {
		el.Conditions = append(el.Conditions, kube.Condition{
			Message:            condition.Message,
			Reason:             condition.Reason,
			Status:             string(condition.Status),
			Type:               string(condition.Type),
			LastTransitionTime: condition.LastTransitionTime.Time,
		})
	}

	mapStatefulSetStatus := func(ss *appsV1.StatefulSet) kube.Status {
		if ss.DeletionTimestamp != nil {
			return kube.StatusPending
		}
		if ss.Status.ObservedGeneration < ss.Generation {
			return kube.StatusPending
		}
		if ss.Status.ReadyReplicas == *ss.Spec.Replicas {
			return kube.StatusSuccess
		}
		if ss.Status.CurrentReplicas < *ss.Spec.Replicas {
			return kube.StatusPending
		}
		return kube.StatusWarning
	}

	el.Status = mapStatefulSetStatus(ss)
}
