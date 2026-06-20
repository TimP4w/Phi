package kubernetes

import (
	kube "github.com/timp4w/phi/internal/core/kubernetes"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// mapperFunc enriches a Resource with kind-specific metadata from the object.
type mapperFunc func(el *kube.Resource, obj unstructured.Unstructured)

func gkOf(group, kind string) kube.GroupKind { return kube.GroupKind{Group: group, Kind: kind} }

// Well-known API groups used as registry keys.
const (
	groupCore       = ""
	groupApps       = "apps"
	groupNetworking = "networking.k8s.io"
	groupDiscovery  = "discovery.k8s.io"
	groupFluxKustom = "kustomize.toolkit.fluxcd.io"
	groupFluxHelm   = "helm.toolkit.fluxcd.io"
	groupFluxSource = "source.toolkit.fluxcd.io"
	groupFluxNotif  = "notification.toolkit.fluxcd.io"
	groupFluxImage  = "image.toolkit.fluxcd.io"
	groupCertMgr    = "cert-manager.io"
	groupGatewayAPI = "gateway.networking.k8s.io"
	groupLonghorn   = "longhorn.io"
)

// traefikGroups are the API groups Traefik has used (old + current); add new ones here.
var traefikGroups = []string{"traefik.io", "traefik.containo.us"}

// mapperRegistry dispatches a resource to its metadata mapper by GroupKind; absent kinds use mapGenericData.
var mapperRegistry = buildMapperRegistry()

func buildMapperRegistry() map[kube.GroupKind]mapperFunc {
	r := map[kube.GroupKind]mapperFunc{
		gkOf(groupFluxKustom, "Kustomization"):  mapKustomizationData,
		gkOf(groupFluxHelm, "HelmRelease"):      mapHelmReleaseData,
		gkOf(groupFluxSource, "GitRepository"):  mapGitRepositoryData,
		gkOf(groupFluxSource, "HelmChart"):      mapHelmChartData,
		gkOf(groupFluxSource, "HelmRepository"): mapHelmRepositoryData,
		gkOf(groupFluxSource, "OCIRepository"):  mapOciRepositoryData,
		gkOf(groupFluxSource, "Bucket"):         mapBucketData,

		gkOf(groupFluxNotif, "Alert"):                 fluxData(true),
		gkOf(groupFluxNotif, "Provider"):              fluxData(true),
		gkOf(groupFluxNotif, "Receiver"):              fluxData(false),
		gkOf(groupFluxImage, "ImageRepository"):       fluxData(false),
		gkOf(groupFluxImage, "ImagePolicy"):           fluxData(false),
		gkOf(groupFluxImage, "ImageUpdateAutomation"): fluxData(false),

		gkOf(groupCore, "Pod"):                   mapPodData,
		gkOf(groupCore, "PersistentVolumeClaim"): mapPVCData,
		gkOf(groupCore, "PersistentVolume"):      mapPVData,
		gkOf(groupCore, "Node"):                  mapNodeData,
		gkOf(groupCore, "Service"):               mapServiceData,
		gkOf(groupCore, "Namespace"):             mapNamespaceStatus,

		gkOf(groupApps, "Deployment"):  withTraefikProxy(mapDeploymentData),
		gkOf(groupApps, "DaemonSet"):   withTraefikProxy(mapDaemonSetData),
		gkOf(groupApps, "StatefulSet"): mapStatefulSetData,
		gkOf(groupApps, "ReplicaSet"):  mapReplicaSetStatus,

		gkOf(groupNetworking, "Ingress"):       mapIngressData,
		gkOf(groupNetworking, "NetworkPolicy"): mapNetworkPolicyData,
		gkOf(groupDiscovery, "EndpointSlice"):  mapEndpointSliceData,

		gkOf(groupCertMgr, "Certificate"): mapCertificateData,

		gkOf(groupGatewayAPI, "Gateway"):   mapGatewayData,
		gkOf(groupGatewayAPI, "HTTPRoute"): mapGatewayRouteData,
		gkOf(groupGatewayAPI, "TCPRoute"):  mapGatewayRouteData,
		gkOf(groupGatewayAPI, "GRPCRoute"): mapGatewayRouteData,
		gkOf(groupGatewayAPI, "TLSRoute"):  mapGatewayRouteData,
		gkOf(groupGatewayAPI, "UDPRoute"):  mapGatewayRouteData,

		gkOf(groupLonghorn, "Volume"): mapLonghornVolume,
		gkOf(groupLonghorn, "Node"):   mapLonghornNode,

		gkOf(trivyGroup, "VulnerabilityReport"):  mapTrivyReport,
		gkOf(trivyGroup, "ConfigAuditReport"):    mapTrivyReport,
		gkOf(trivyGroup, "ExposedSecretReport"):  mapTrivyReport,
		gkOf(trivyGroup, "RbacAssessmentReport"): mapTrivyReport,
	}

	for _, g := range traefikGroups {
		r[gkOf(g, "IngressRoute")] = mapTraefikIngressRouteData
	}

	return r
}

// fluxData binds the generic Flux mapper's hasArtifact flag into a mapperFunc.
func fluxData(hasArtifact bool) mapperFunc {
	return func(el *kube.Resource, obj unstructured.Unstructured) {
		mapGenericFluxData(el, obj, hasArtifact)
	}
}

// withTraefikProxy runs the workload's mapper, then adds the Traefik proxy overlay (no-op otherwise).
func withTraefikProxy(base mapperFunc) mapperFunc {
	return func(el *kube.Resource, obj unstructured.Unstructured) {
		base(el, obj)
		traefikProxyData(el, obj)
	}
}
