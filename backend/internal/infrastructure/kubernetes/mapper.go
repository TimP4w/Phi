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
	discoveryv1 "k8s.io/api/discovery/v1"
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

func refGroupAndVersion(apiVersion string) (group, version string) {
	parts := strings.Split(apiVersion, "/")
	if len(parts) == 1 {
		return "core", parts[0]
	}
	return parts[0], parts[len(parts)-1]
}

func makeRef(name, namespace, kind, apiVersion string) string {
	group, version := refGroupAndVersion(apiVersion)
	return group + "/" + version + "/" + kind + ":" + namespace + "/" + name
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
		CreatedAt:   obj.GetCreationTimestamp().Time,
		ParentRefs:  []string{},
	}

	if obj.GetDeletionTimestamp() != nil {
		el.DeletedAt = obj.GetDeletionTimestamp().Time
	}

	for _, ownerRef := range obj.GetOwnerReferences() {
		el.ParentIDs = append(el.ParentIDs, string(ownerRef.UID))
		el.ParentRefs = append(el.ParentRefs, makeRef(ownerRef.Name, obj.GetNamespace(), ownerRef.Kind, ownerRef.APIVersion))
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
	case "Bucket":
		mapBucketData(&el, obj)
	case "Alert", "Provider":
		mapGenericFluxData(&el, obj, true)
	case "Receiver", "ImageRepository", "ImagePolicy", "ImageUpdateAutomation":
		mapGenericFluxData(&el, obj, false)
	case "Pod":
		mapPodData(&el, obj)
	case "Deployment":
		mapDeploymentData(&el, obj)
		traefikProxyData(&el, obj)
	case "PersistentVolumeClaim":
		mapPVCData(&el, obj)
	case "PersistentVolume":
		mapPVData(&el, obj)
	case "Volume":
		if el.Group == "longhorn.io" {
			mapLonghornVolume(&el, obj)
		}
	case "Node":
		if el.Group == "longhorn.io" {
			mapLonghornNode(&el, obj)
		}
	case "Service":
		mapServiceData(&el, obj)
	case "Ingress":
		mapIngressData(&el, obj)
	case "EndpointSlice":
		mapEndpointSliceData(&el, obj)
	case "NetworkPolicy":
		mapNetworkPolicyData(&el, obj)
	case "Certificate":
		if el.Group == "cert-manager.io" {
			mapCertificateData(&el, obj)
		}
	case "Gateway":
		if el.Group == "gateway.networking.k8s.io" {
			mapGatewayData(&el, obj)
		}
	case "HTTPRoute", "TCPRoute", "GRPCRoute", "TLSRoute", "UDPRoute":
		if el.Group == "gateway.networking.k8s.io" {
			mapGatewayRouteData(&el, obj)
		}
	case "IngressRoute":
		if strings.HasPrefix(el.Group, "traefik.") {
			mapTraefikIngressRouteData(&el, obj)
		}
	case "StatefulSet":
		mapStatefulSetData(&el, obj)
	case "DaemonSet":
		// Proxy workloads (e.g. Traefik) are often DaemonSets; the provider
		// no-ops for non-proxy workloads.
		traefikProxyData(&el, obj)
	case "VulnerabilityReport", "ConfigAuditReport", "ExposedSecretReport", "RbacAssessmentReport":
		if el.Group == trivyGroup {
			mapTrivyReport(&el, obj, trivyReportTypes[el.Kind])
		}
	default:
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

	if !isReconciling {
		for _, cond := range conditions {
			if cond.Type == "Reconciling" && cond.Status == metav1.ConditionTrue {
				isReconciling = true
				break
			}
		}
	}

	var lastSyncAt time.Time
	for _, cond := range conditions {
		if cond.Type == "Ready" {
			lastSyncAt = cond.LastTransitionTime.Time
			break
		}
	}

	el.FluxMetadata = kube.FluxMetadata{
		IsReconciling:          isReconciling,
		IsSuspended:            isSuspended,
		LastHandledReconcileAt: lastReconcileTime,
		LastSyncAt:             lastSyncAt,
	}

	if isSuspended {
		el.Status = kube.StatusSuspended
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
	el.Status = mapFluxResourceStatusForCondition(&gitRepository.Status.Conditions)
	mapFluxMetadata(el, gitRepository.GetAnnotations(), gitRepository.Status.LastHandledReconcileAt, gitRepository.Spec.Suspend, gitRepository.Status.Conditions)

	el.GitRepositoryMetadata = kube.GitRepositoryMetadata{
		URL:    gitRepository.Spec.URL,
		Branch: gitRepository.Spec.Reference.Branch,
		Tag:    gitRepository.Spec.Reference.Tag,
		Semver: gitRepository.Spec.Reference.SemVer,
		Name:   gitRepository.Spec.Reference.Name,
		Commit: gitRepository.Spec.Reference.Commit,
	}

}

func mapFluxResourceStatusForCondition(conditions *[]metav1.Condition) kube.Status {
	// https://github.com/fluxcd/source-controller/blob/main/api/v1/condition_types.go

	for _, condition := range *conditions {
		if condition.Type == "Ready" {
			switch condition.Status {
			case metav1.ConditionTrue:
				return kube.StatusSuccess
			case metav1.ConditionFalse:
				// DependencyNotReady means waiting on a dependency, not a failure
				if condition.Reason == "DependencyNotReady" {
					return kube.StatusPending
				}
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
	el.Status = mapFluxResourceStatusForCondition(&ociRepository.Status.Conditions)
	mapFluxMetadata(el, ociRepository.GetAnnotations(), ociRepository.Status.LastHandledReconcileAt, ociRepository.Spec.Suspend, ociRepository.Status.Conditions)

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

	// OCI helm repos don't emit conditions -> absence of conditions means valid config
	if helmRepository.Spec.Type == "oci" && len(helmRepository.Status.Conditions) == 0 {
		el.Status = kube.StatusSuccess
	}

	mapFluxMetadata(el, helmRepository.GetAnnotations(), helmRepository.Status.LastHandledReconcileAt, helmRepository.Spec.Suspend, helmRepository.Status.Conditions)
}

func mapBucketData(el *kube.Resource, obj unstructured.Unstructured) {
	bucket := &sourcev1beta2.Bucket{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), bucket)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Bucket")
		return
	}
	mapConditions(el, bucket.Status.Conditions)
	el.Status = mapFluxResourceStatusForCondition(&bucket.Status.Conditions)
	mapFluxMetadata(el, bucket.GetAnnotations(), bucket.Status.LastHandledReconcileAt, bucket.Spec.Suspend, bucket.Status.Conditions)
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

		for _, cond := range pod.Status.Conditions {
			if cond.Type == "Ready" && cond.Reason == "ContainersNotReady" {
				return kube.StatusPending
			}
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

	image := ""
	if len(pod.Spec.Containers) > 0 {
		image = pod.Spec.Containers[0].Image
	}
	el.PodMetadata = kube.PodMetadata{
		Phase: string(pod.Status.Phase),
		Image: image,
	}

}

func mapPVCData(el *kube.Resource, obj unstructured.Unstructured) {
	pvc := &v1.PersistentVolumeClaim{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), pvc)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to PVC")
		return
	}

	storageClass := ""
	if pvc.Spec.StorageClassName != nil {
		storageClass = *pvc.Spec.StorageClassName
	}
	volumeMode := ""
	if pvc.Spec.VolumeMode != nil {
		volumeMode = string(*pvc.Spec.VolumeMode)
	}
	el.PVCMetadata = kube.PVCMetadata{
		StorageClass: storageClass,
		VolumeName:   pvc.Spec.VolumeName,
		VolumeMode:   volumeMode,
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

	if req, ok := pvc.Spec.Resources.Requests[v1.ResourceStorage]; ok {
		el.PVCMetadata.Requested = req.Value()
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

	meta := kube.PVMetadata{
		StorageClass:  pv.Spec.StorageClassName,
		ReclaimPolicy: string(pv.Spec.PersistentVolumeReclaimPolicy),
		Phase:         string(pv.Status.Phase),
	}
	if storage, ok := pv.Spec.Capacity[v1.ResourceStorage]; ok {
		meta.Capacity = storage.Value()
	}
	if pv.Spec.VolumeMode != nil {
		meta.VolumeMode = string(*pv.Spec.VolumeMode)
	}
	for _, accessMode := range pv.Spec.AccessModes {
		meta.AccessModes = append(meta.AccessModes, string(accessMode))
	}
	if pv.Spec.CSI != nil {
		meta.Driver = pv.Spec.CSI.Driver
	}
	el.PVMetadata = meta

	// Driver-specific attributes (NFS, …) are read by their providers; no-ops
	// for drivers they don't recognise.
	mapCSIDriverData(&el.PVMetadata, pv)

	if pv.Spec.ClaimRef != nil {
		el.ParentRefs = append(el.ParentRefs, makeRef(
			pv.Spec.ClaimRef.Name,
			pv.Spec.ClaimRef.Namespace,
			pv.Spec.ClaimRef.Kind,
			pv.Spec.ClaimRef.APIVersion,
		))
	}
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
			if cond.Type == appsV1.DeploymentAvailable && cond.Status == v1.ConditionFalse {
				return kube.StatusWarning
			}
		}

		if deploy.Status.ObservedGeneration < deploy.Generation {
			return kube.StatusPending
		}

		if deploy.Status.UnavailableReplicas > 0 {
			return kube.StatusWarning
		}

		if deploy.Spec.Replicas != nil && deploy.Status.ReadyReplicas == *deploy.Spec.Replicas {
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
	el.Status = mapFluxResourceStatusForCondition(&kustomization.Status.Conditions)
	mapFluxMetadata(el, kustomization.GetAnnotations(), kustomization.Status.LastHandledReconcileAt, kustomization.Spec.Suspend, kustomization.Status.Conditions)

	var dependsOnRefs []string
	for _, dep := range kustomization.Spec.DependsOn {
		dependsOnRefs = append(dependsOnRefs, dep.Name)
	}

	el.KustomizationMetadata = kube.KustomizationMetadata{
		Path:          kustomization.Spec.Path,
		IsReconciling: el.FluxMetadata.IsReconciling, // deprecated
		IsSuspended:   el.FluxMetadata.IsSuspended,   // deprecated
		DependsOn:     dependsOnRefs,

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
	el.Status = mapFluxResourceStatusForCondition(&helmRelease.Status.Conditions)
	mapFluxMetadata(el, helmRelease.GetAnnotations(), helmRelease.Status.LastHandledReconcileAt, helmRelease.Spec.Suspend, helmRelease.Status.Conditions)

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

func mapServiceData(el *kube.Resource, obj unstructured.Unstructured) {
	svc := &v1.Service{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), svc)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to Service")
		return
	}

	meta := kube.ServiceMetadata{
		Type:       string(svc.Spec.Type),
		ClusterIPs: append([]string(nil), svc.Spec.ClusterIPs...),
		Selector:   svc.Spec.Selector,
	}

	for _, port := range svc.Spec.Ports {
		meta.Ports = append(meta.Ports, kube.ServicePort{
			Name:       port.Name,
			Protocol:   string(port.Protocol),
			Port:       port.Port,
			TargetPort: port.TargetPort.String(),
			NodePort:   port.NodePort,
		})
	}

	// ExternalIPs reflect the address an LB controller (e.g. MetalLB) assigned,
	// plus any statically configured spec.externalIPs.
	seenIP := map[string]bool{}
	addIP := func(ip string) {
		if ip == "" || seenIP[ip] {
			return
		}
		seenIP[ip] = true
		meta.ExternalIPs = append(meta.ExternalIPs, ip)
	}
	for _, ing := range svc.Status.LoadBalancer.Ingress {
		if ing.IP != "" {
			addIP(ing.IP)
		} else {
			addIP(ing.Hostname)
		}
	}
	for _, ip := range svc.Spec.ExternalIPs {
		addIP(ip)
	}

	el.ServiceMetadata = meta

	if svc.Spec.Type == v1.ServiceTypeLoadBalancer && len(meta.ExternalIPs) == 0 {
		el.Status = kube.StatusPending
	} else {
		el.Status = kube.StatusSuccess
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

	route := kube.RouteMetadata{}
	if ing.Spec.IngressClassName != nil {
		route.Class = *ing.Spec.IngressClassName
	}

	for _, lb := range ing.Status.LoadBalancer.Ingress {
		if lb.IP != "" {
			route.Addresses = append(route.Addresses, lb.IP)
		} else if lb.Hostname != "" {
			route.Addresses = append(route.Addresses, lb.Hostname)
		}
	}

	// A tls block means the route terminates TLS even when it names no secret
	// (the proxy then supplies a default/wildcard certificate).
	if len(ing.Spec.TLS) > 0 {
		route.TLSEnabled = true
	}
	for _, tls := range ing.Spec.TLS {
		if tls.SecretName != "" {
			route.TLSSecretRefs = append(route.TLSSecretRefs, ing.Namespace+"/"+tls.SecretName)
		}
	}

	// Controller-specific annotations (Traefik, …) are read by their providers.
	// These no-op when the annotations are absent, so non-Traefik Ingresses are
	// unaffected.
	route.EntryPoints = append(route.EntryPoints, traefikIngressEntrypoints(ing.Annotations)...)
	route.MiddlewareRefs = append(route.MiddlewareRefs, traefikIngressMiddlewares(ing.Annotations)...)

	addBackend := func(svc *networkingv1.IngressServiceBackend) {
		if svc == nil {
			return
		}
		route.BackendRefs = append(route.BackendRefs, kube.BackendRef{
			Kind:      "Service",
			Name:      svc.Name,
			Namespace: ing.Namespace,
			Port:      svc.Port.Number,
		})
	}

	if ing.Spec.DefaultBackend != nil {
		addBackend(ing.Spec.DefaultBackend.Service)
	}
	for _, rule := range ing.Spec.Rules {
		if rule.Host != "" {
			route.Hostnames = append(route.Hostnames, rule.Host)
		}
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			addBackend(path.Backend.Service)
		}
	}

	el.RouteMetadata = route
}

func mapNetworkPolicyData(el *kube.Resource, obj unstructured.Unstructured) {
	np := &networkingv1.NetworkPolicy{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), np)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to NetworkPolicy")
		return
	}

	meta := kube.NetworkPolicyMetadata{
		IngressRules: len(np.Spec.Ingress),
		EgressRules:  len(np.Spec.Egress),
	}
	if np.Spec.PodSelector.MatchLabels != nil {
		meta.PodSelector = np.Spec.PodSelector.MatchLabels
	}
	for _, pt := range np.Spec.PolicyTypes {
		meta.PolicyTypes = append(meta.PolicyTypes, string(pt))
	}

	el.NetworkPolicyMetadata = meta
}

func mapEndpointSliceData(el *kube.Resource, obj unstructured.Unstructured) {
	es := &discoveryv1.EndpointSlice{}
	err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), es)
	if err != nil {
		logging.Logger().WithError(err).Error("Error converting unstructured to EndpointSlice")
		return
	}

	meta := kube.EndpointSliceMetadata{
		ServiceName: es.Labels[discoveryv1.LabelServiceName],
	}

	for _, ep := range es.Endpoints {
		target := kube.EndpointTarget{
			Ready: ep.Conditions.Ready != nil && *ep.Conditions.Ready,
		}
		if ep.TargetRef != nil {
			target.TargetKind = ep.TargetRef.Kind
			target.TargetName = ep.TargetRef.Name
			target.TargetUID = string(ep.TargetRef.UID)
		}
		meta.Endpoints = append(meta.Endpoints, target)
	}

	el.EndpointSliceMetadata = meta
}

func nestedString(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func nestedInt32(m map[string]any, key string) int32 {
	if v, ok := m[key].(int64); ok {
		return int32(v)
	}
	return 0
}

func nestedMap(m map[string]any, key string) map[string]any {
	if v, ok := m[key].(map[string]any); ok {
		return v
	}
	return map[string]any{}
}

func mapCertificateData(el *kube.Resource, obj unstructured.Unstructured) {
	meta := kube.CertificateMetadata{}
	meta.SecretName, _, _ = unstructured.NestedString(obj.Object, "spec", "secretName")
	meta.Issuer, _, _ = unstructured.NestedString(obj.Object, "spec", "issuerRef", "name")
	meta.NotAfter, _, _ = unstructured.NestedString(obj.Object, "status", "notAfter")
	if dns, found, _ := unstructured.NestedStringSlice(obj.Object, "spec", "dnsNames"); found {
		meta.DNSNames = dns
	}

	var readyReason string
	if conds, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions"); found {
		for _, c := range conds {
			cm, ok := c.(map[string]any)
			if !ok {
				continue
			}
			if nestedString(cm, "type") == "Ready" {
				meta.Ready = nestedString(cm, "status") == "True"
				readyReason = nestedString(cm, "reason")
			}
		}
	}

	el.CertificateMetadata = meta
	switch {
	case meta.Ready:
		el.Status = kube.StatusSuccess
	case readyReason == "Failed":
		el.Status = kube.StatusFailed
	default:
		// Not ready and not permanently failed: still issuing.
		el.Status = kube.StatusPending
	}
}

func mapGatewayData(el *kube.Resource, obj unstructured.Unstructured) {
	meta := kube.GatewayMetadata{}

	if class, found, _ := unstructured.NestedString(obj.Object, "spec", "gatewayClassName"); found {
		meta.GatewayClassName = class
	}

	if listeners, found, _ := unstructured.NestedSlice(obj.Object, "spec", "listeners"); found {
		for _, l := range listeners {
			lm, ok := l.(map[string]any)
			if !ok {
				continue
			}
			meta.Listeners = append(meta.Listeners, kube.GatewayListener{
				Name:     nestedString(lm, "name"),
				Protocol: nestedString(lm, "protocol"),
				Hostname: nestedString(lm, "hostname"),
				Port:     nestedInt32(lm, "port"),
			})
			certRefs, ok := nestedMap(lm, "tls")["certificateRefs"].([]any)
			if !ok {
				continue
			}
			for _, cr := range certRefs {
				crm, ok := cr.(map[string]any)
				if !ok {
					continue
				}
				name := nestedString(crm, "name")
				if name == "" {
					continue
				}
				ns := el.Namespace
				if n := nestedString(crm, "namespace"); n != "" {
					ns = n
				}
				meta.TLSSecretRefs = append(meta.TLSSecretRefs, ns+"/"+name)
			}
		}
	}

	if addresses, found, _ := unstructured.NestedSlice(obj.Object, "status", "addresses"); found {
		for _, a := range addresses {
			am, ok := a.(map[string]any)
			if !ok {
				continue
			}
			if v := nestedString(am, "value"); v != "" {
				meta.Addresses = append(meta.Addresses, v)
			}
		}
	}

	el.GatewayMetadata = meta
	if len(meta.Addresses) == 0 {
		el.Status = kube.StatusPending
	} else {
		el.Status = kube.StatusSuccess
	}
}

func mapGatewayRouteData(el *kube.Resource, obj unstructured.Unstructured) {
	route := kube.RouteMetadata{}

	if hostnames, found, _ := unstructured.NestedStringSlice(obj.Object, "spec", "hostnames"); found {
		route.Hostnames = hostnames
	}

	if parentRefs, found, _ := unstructured.NestedSlice(obj.Object, "spec", "parentRefs"); found {
		for _, p := range parentRefs {
			pm, ok := p.(map[string]any)
			if !ok {
				continue
			}
			name := nestedString(pm, "name")
			if name == "" {
				continue
			}
			ns := el.Namespace
			if n := nestedString(pm, "namespace"); n != "" {
				ns = n
			}
			kind := nestedString(pm, "kind")
			if kind == "" {
				kind = "Gateway"
			}
			route.ParentRefs = append(route.ParentRefs, kube.RouteParentRef{
				Group:       nestedString(pm, "group"),
				Kind:        kind,
				Name:        name,
				Namespace:   ns,
				SectionName: nestedString(pm, "sectionName"),
			})
		}
	}

	if rules, found, _ := unstructured.NestedSlice(obj.Object, "spec", "rules"); found {
		for _, r := range rules {
			rm, ok := r.(map[string]any)
			if !ok {
				continue
			}
			backendRefs, ok := rm["backendRefs"].([]any)
			if !ok {
				continue
			}
			for _, b := range backendRefs {
				bm, ok := b.(map[string]any)
				if !ok {
					continue
				}
				name := nestedString(bm, "name")
				if name == "" {
					continue
				}
				ns := el.Namespace
				if n := nestedString(bm, "namespace"); n != "" {
					ns = n
				}
				kind := nestedString(bm, "kind")
				if kind == "" {
					kind = "Service"
				}
				route.BackendRefs = append(route.BackendRefs, kube.BackendRef{
					Group:     nestedString(bm, "group"),
					Kind:      kind,
					Name:      name,
					Namespace: ns,
					Port:      nestedInt32(bm, "port"),
				})
			}
		}
	}

	el.RouteMetadata = route
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
		if ss.Spec.Replicas != nil && ss.Status.ReadyReplicas == *ss.Spec.Replicas {
			return kube.StatusSuccess
		}
		if ss.Spec.Replicas != nil && ss.Status.CurrentReplicas < *ss.Spec.Replicas {
			return kube.StatusPending
		}
		return kube.StatusWarning
	}

	el.Status = mapStatefulSetStatus(ss)
}

// appendUnstructuredConditions converts an unstructured object's
// status.conditions into domain Conditions and appends them to el. Used by
// providers (e.g. Longhorn) whose CRDs aren't imported as typed Go packages.
func appendUnstructuredConditions(el *kube.Resource, obj unstructured.Unstructured) {
	for _, cond := range extractUnstructuredConditions(obj) {
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		reason, _ := cond["reason"].(string)
		message, _ := cond["message"].(string)
		var lastTransition time.Time
		if ts, ok := cond["lastTransitionTime"].(string); ok {
			lastTransition, _ = time.Parse(time.RFC3339, ts)
		}
		el.Conditions = append(el.Conditions, kube.Condition{
			Type:               condType,
			Status:             condStatus,
			Reason:             reason,
			Message:            message,
			LastTransitionTime: lastTransition,
		})
	}
}

// extractUnstructuredConditions pulls status.conditions from an unstructured object.
func extractUnstructuredConditions(obj unstructured.Unstructured) []map[string]any {
	raw, found, err := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if !found || err != nil {
		return nil
	}
	conditions := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if c, ok := item.(map[string]any); ok {
			conditions = append(conditions, c)
		}
	}
	return conditions
}

// mapFluxResourceStatusFromUnstructured applies the same Ready-condition logic as
// mapFluxResourceStatusForCondition but works on raw unstructured conditions.
// When defaultReady is true and no conditions exist, StatusSuccess is returned
// (used for Alert/Provider which omit conditions when valid).
func mapFluxResourceStatusFromUnstructured(conditions []map[string]any, defaultReady bool) kube.Status {
	for _, cond := range conditions {
		if cond["type"] != "Ready" {
			continue
		}
		reason, _ := cond["reason"].(string)
		switch cond["status"] {
		case "True":
			return kube.StatusSuccess
		case "False":
			if reason == "DependencyNotReady" {
				return kube.StatusPending
			}
			return kube.StatusFailed
		case "Unknown":
			return kube.StatusPending
		}
	}
	if defaultReady && len(conditions) == 0 {
		return kube.StatusSuccess
	}
	return kube.StatusPending
}

// mapFluxMetadataFromUnstructured is the unstructured equivalent of mapFluxMetadata,
// used for Flux resource types not imported as typed Go packages.
func mapFluxMetadataFromUnstructured(el *kube.Resource, annotations map[string]string, lastReconcileTimeStr string, isSuspended bool, conditions []map[string]any) {
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

	if !isReconciling {
		for _, cond := range conditions {
			if cond["type"] == "Reconciling" && cond["status"] == "True" {
				isReconciling = true
				break
			}
		}
	}

	var lastSyncAt time.Time
	for _, cond := range conditions {
		if cond["type"] == "Ready" {
			if ts, ok := cond["lastTransitionTime"].(string); ok {
				if t, err := time.Parse(time.RFC3339, ts); err == nil {
					lastSyncAt = t
				}
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

	if isSuspended {
		el.Status = kube.StatusSuspended
	}
}

// mapGenericFluxData handles Flux resource types that carry no type-specific metadata
// beyond status/suspend/reconcile. Used for notification and image automation resources.
// Set defaultReadyWhenNoConditions=true for Alert/Provider (valid config emits no conditions
// in older notification-controller versions).
func mapGenericFluxData(el *kube.Resource, obj unstructured.Unstructured, defaultReadyWhenNoConditions bool) {
	conditions := extractUnstructuredConditions(obj)

	el.Status = mapFluxResourceStatusFromUnstructured(conditions, defaultReadyWhenNoConditions)

	isSuspended := false
	if s, found, err := unstructured.NestedBool(obj.Object, "spec", "suspend"); found && err == nil {
		isSuspended = s
	}

	lastHandledReconcileAt := ""
	if t, found, err := unstructured.NestedString(obj.Object, "status", "lastHandledReconcileAt"); found && err == nil {
		lastHandledReconcileAt = t
	}

	mapFluxMetadataFromUnstructured(el, obj.GetAnnotations(), lastHandledReconcileAt, isSuspended, conditions)
}
