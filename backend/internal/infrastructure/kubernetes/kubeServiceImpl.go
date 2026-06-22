package kubernetes

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/shared"

	"gopkg.in/yaml.v2"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	clientset "k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
)

const (
	// informerResyncPeriod is how often the informer re-lists all resources from
	// the API server to reconcile any missed watch events.
	informerResyncPeriod = 15 * time.Minute
	// informerSyncTimeout bounds how long WatchResources blocks waiting for the
	// initial cache sync of all informers; types that have not synced by then keep
	// syncing in the background.
	informerSyncTimeout = 2 * time.Minute
)

type KubeServiceImpl struct {
	discoveryClient   discovery.DiscoveryInterface
	dynamicClient     dynamic.Interface
	clientSet         clientset.Interface
	mu                sync.RWMutex
	mapper            *KubeMapper
	factory           dynamicinformer.DynamicSharedInformerFactory
	informersChannels map[string]chan struct{}
}

var _ kube.KubeService = (*KubeServiceImpl)(nil)

type KubeClientLogger struct{}

func (l KubeClientLogger) HandleWarningHeader(code int, agent, text string) {
	logging.Logger().WithFields(map[string]any{
		"code":  code,
		"agent": agent,
	}).Warn(text)
}

func NewKubeServiceImpl() kube.KubeService {
	logger := logging.Logger()
	logger.Debug("Creating new KubeServiceImpl")

	var restConfig *rest.Config
	var err error

	cf := genericclioptions.NewConfigFlags(false)

	isDev := os.Getenv(shared.ENV_PHI_DEV)

	if isDev == "true" {
		kubeconfigPath := os.Getenv(shared.ENV_PHI_KUBE_CONFIG_PATH)
		kubeconfigPathCopy := kubeconfigPath // ensure the pointer is to a variable that outlives the block
		cf.KubeConfig = &kubeconfigPathCopy
		restConfig, err = cf.ToRESTConfig()
	} else {
		restConfig, err = rest.InClusterConfig()
	}

	if err != nil {
		if isDev == "true" {
			logging.Logger().WithError(err).Fatal("Error loading kubeconfig (dev mode)")
		} else {
			logging.Logger().WithError(err).Fatal("Error creating in-cluster config")
		}
	}

	restConfig.WarningHandler = KubeClientLogger{}

	qps := 1000
	burst := 1000
	if qpsEnv := os.Getenv(shared.PHI_KUBE_QPS); qpsEnv != "" {
		if parsedQPS, err := strconv.Atoi(qpsEnv); err == nil {
			qps = parsedQPS
		}
	}
	if burstEnv := os.Getenv(shared.PHI_KUBE_BURST); burstEnv != "" {
		if parsedBurst, err := strconv.Atoi(burstEnv); err == nil {
			burst = parsedBurst
		}
	}
	restConfig.QPS = float32(qps)
	restConfig.Burst = burst

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		logging.Logger().WithError(err).Fatal("Failed to construct dynamic client")
	}

	discoveryClient, err := cf.ToDiscoveryClient()
	if err != nil {
		logging.Logger().WithError(err).Fatal("Failed to construct discovery client")
	}

	clientSet, err := clientset.NewForConfig(restConfig)
	if err != nil {
		logging.Logger().WithError(err).Fatal("Failed to construct clientset")
	}

	service := &KubeServiceImpl{
		discoveryClient:   discoveryClient,
		dynamicClient:     dynamicClient,
		clientSet:         clientSet,
		mapper:            NewKubeMapper(),
		informersChannels: make(map[string]chan struct{}),
	}

	return service
}

func (k *KubeServiceImpl) GetResourceYAML(resource kube.Resource) ([]byte, error) {
	unstructuredObj, err := k.findKubeResource(resource)
	if err != nil {
		return nil, err
	}

	// Strip secret values before serialising
	redactSecretData(&unstructuredObj)

	// Convert to YAML
	yamlData, err := yaml.Marshal(unstructuredObj)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal resource to YAML: %v", err)
	}

	return yamlData, nil
}

const redactedValue = "[REDACTED]"

// lastAppliedConfigAnnotation mirrors the full applied object, so it is dropped from Secret objects.
const lastAppliedConfigAnnotation = "kubectl.kubernetes.io/last-applied-configuration"

// redactSecretData masks sensitive values on Secret objects in place
func redactSecretData(obj *unstructured.Unstructured) {
	if obj == nil || !strings.EqualFold(obj.GetKind(), "Secret") {
		return
	}

	for _, field := range []string{"data", "stringData"} {
		if m, found, _ := unstructured.NestedMap(obj.Object, field); found {
			for key := range m {
				m[key] = redactedValue
			}
			_ = unstructured.SetNestedMap(obj.Object, m, field)
		}
	}

	if annotations := obj.GetAnnotations(); annotations != nil {
		if _, ok := annotations[lastAppliedConfigAnnotation]; ok {
			delete(annotations, lastAppliedConfigAnnotation)
			obj.SetAnnotations(annotations)
		}
	}
}

func (k *KubeServiceImpl) WatchLogs(pod kube.Resource, ctx context.Context, onLog func(kube.KubeLog)) error {
	if pod.Kind != "Pod" {
		return fmt.Errorf("resource is not a pod")
	}
	count := int64(100)

	podResource, err := k.findKubeResource(pod)
	if err != nil {
		return fmt.Errorf("failed to get pod resource: %v", err)
	}

	podR := &corev1.Pod{}
	err = runtime.DefaultUnstructuredConverter.FromUnstructured(podResource.UnstructuredContent(), podR)
	if err != nil {
		return fmt.Errorf("failed to convert pod resource: %v", err)
	}

	var wg sync.WaitGroup
	for _, container := range podR.Spec.Containers {
		wg.Add(1)
		go func(containerName string) {
			defer wg.Done()
			opts := &corev1.PodLogOptions{
				Container:  containerName,
				Follow:     true,
				Timestamps: true,
				TailLines:  &count,
			}
			req := k.clientSet.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, opts)
			stream, err := req.Stream(ctx)
			if err != nil {
				logging.Logger().WithError(err).WithField("container", containerName).Warn("Failed to open log stream")
				return
			}
			defer stream.Close()

			sc := bufio.NewScanner(stream)
			for sc.Scan() {
				if ctx.Err() != nil {
					return
				}
				text := sc.Text()
				for _, chunk := range chunks(text, 1000) {
					timestamp, message := parseMessage(chunk)
					onLog(kube.KubeLog{
						Timestamp: timestamp,
						Message:   message,
						Container: containerName,
					})
				}
			}
		}(container.Name)
	}
	wg.Wait()
	return nil
}

func (k *KubeServiceImpl) WatchResources(apis []kube.ApiResource, addFunc func(kube.Resource), updateFunc func(oldEl, newEl kube.Resource), deleteFunc func(kube.Resource)) {
	handlers := resourceHandlers{add: addFunc, update: updateFunc, delete: deleteFunc}

	var synced []cache.InformerSynced
	for _, api := range apis {
		if informer := k.startInformer(api, handlers); informer != nil {
			synced = append(synced, informer.HasSynced)
		}
	}

	// Block until the informer caches have delivered their initial state (as add
	// events) so the store reflects the full cluster before startup completes.
	timeout := make(chan struct{})
	timer := time.AfterFunc(informerSyncTimeout, func() { close(timeout) })
	defer timer.Stop()
	if !cache.WaitForCacheSync(timeout, synced...) {
		logging.Logger().Warn("Some informer caches did not sync within timeout; they continue syncing in the background")
		return
	}
	logging.Logger().WithField("informer_count", len(synced)).Info("Informer caches synced")
}

func (k *KubeServiceImpl) GetEvents() ([]kube.Event, error) {
	kubeEvents, err := k.clientSet.CoreV1().Events("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return []kube.Event{}, err
	}

	var events []kube.Event = make([]kube.Event, 0)
	for _, e := range kubeEvents.Items {
		event := k.mapper.ToEvent(&e)
		events = append(events, event)
	}

	return events, nil
}

func (k *KubeServiceImpl) WatchEvents(onEvent func(*kube.Event)) {
	logger := logging.Logger()

	go func() {
		backoff := time.Second

		for {
			watch, err := k.clientSet.CoreV1().Events("").Watch(context.Background(), metav1.ListOptions{})
			if err != nil {
				logger.WithError(err).Error("Error creating event watch")
				time.Sleep(backoff)
				if backoff < 30*time.Second {
					backoff *= 2
				}
				continue
			}

			backoff = time.Second
			logger.Info("Started watching Kubernetes events")

			channel := watch.ResultChan()
			for event := range channel {
				event, ok := event.Object.(*corev1.Event)
				if !ok {
					logger.Warn("Received unexpected type in event watch")
					continue
				}
				mapped := k.mapper.ToEvent(event)
				onEvent(&mapped)
			}

			watch.Stop()
			logger.Warn("Kubernetes event watch closed, restarting...")
			time.Sleep(backoff)
			if backoff < 30*time.Second {
				backoff *= 2
			}
		}
	}()
}

// resourceHandlers bundles the callbacks informer events are forwarded to.
type resourceHandlers struct {
	add    func(kube.Resource)
	update func(oldEl, newEl kube.Resource)
	delete func(kube.Resource)
}

// startInformer creates and runs an informer for the given API resource, unless one
// is already running for it. It returns the informer, or nil if it was already
// being watched. Informers are keyed by resource name + group (version excluded):
// all versions of a resource serve the same objects, and the version started via
// discovery may differ from a CRD's storage version.
func (k *KubeServiceImpl) startInformer(api kube.ApiResource, handlers resourceHandlers) cache.SharedIndexInformer {
	key := api.Name + "." + api.Group

	k.mu.Lock()
	if _, exists := k.informersChannels[key]; exists {
		k.mu.Unlock()
		return nil
	}
	stopCh := make(chan struct{})
	k.informersChannels[key] = stopCh
	if k.factory == nil {
		k.factory = dynamicinformer.NewFilteredDynamicSharedInformerFactory(k.dynamicClient, informerResyncPeriod, "", nil)
	}
	factory := k.factory
	k.mu.Unlock()

	gvr := schema.GroupVersionResource{Group: api.Group, Version: api.Version, Resource: api.Name}
	informer := factory.ForResource(gvr).Informer()
	informer.AddEventHandler(k.resourceEventHandler(api.Name, handlers))
	go informer.Run(stopCh)

	logging.Logger().WithFields(map[string]any{
		"resource": api.Name,
		"version":  api.Version,
		"group":    api.Group,
	}).Debug("Started informer")
	return informer
}

func (k *KubeServiceImpl) resourceEventHandler(resource string, handlers resourceHandlers) cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			u, ok := obj.(*unstructured.Unstructured)
			if !ok {
				return
			}
			handlers.add(k.mapper.ToResource(*u, resource))
			k.watchNewCRDKind(u, handlers)
		},
		UpdateFunc: func(oldObj, newObj any) {
			oldU, okOld := oldObj.(*unstructured.Unstructured)
			newU, okNew := newObj.(*unstructured.Unstructured)
			if !okOld || !okNew {
				return
			}
			handlers.update(k.mapper.ToResource(*oldU, resource), k.mapper.ToResource(*newU, resource))
		},
		DeleteFunc: func(obj any) {
			u, ok := obj.(*unstructured.Unstructured)
			if !ok {
				tombstone, isTombstone := obj.(cache.DeletedFinalStateUnknown)
				if !isTombstone {
					return
				}
				if u, ok = tombstone.Obj.(*unstructured.Unstructured); !ok {
					return
				}
			}
			handlers.delete(k.mapper.ToResource(*u, resource))
		},
	}
}

// watchNewCRDKind starts an informer for the resource type a CustomResourceDefinition
// defines. CRD add events flow through the CRD informer like any other resource, so
// kinds installed after startup are picked up at runtime; CRDs whose resource type is
// already watched are skipped by startInformer.
func (k *KubeServiceImpl) watchNewCRDKind(u *unstructured.Unstructured, handlers resourceHandlers) {
	gvk := u.GroupVersionKind()
	if gvk.Group != "apiextensions.k8s.io" || gvk.Kind != "CustomResourceDefinition" {
		return
	}

	api, err := crdToApiResource(u)
	if err != nil {
		logging.Logger().WithField("crd", u.GetName()).WithError(err).Warn("Could not derive API resource from CRD")
		return
	}
	k.startInformer(api, handlers)
}

// crdToApiResource extracts the storage-version API resource served by a CRD.
func crdToApiResource(u *unstructured.Unstructured) (kube.ApiResource, error) {
	group, _, _ := unstructured.NestedString(u.Object, "spec", "group")
	plural, _, _ := unstructured.NestedString(u.Object, "spec", "names", "plural")
	kind, _, _ := unstructured.NestedString(u.Object, "spec", "names", "kind")
	singular, _, _ := unstructured.NestedString(u.Object, "spec", "names", "singular")

	var version string
	versions, _, _ := unstructured.NestedSlice(u.Object, "spec", "versions")
	for _, v := range versions {
		vm, ok := v.(map[string]any)
		if !ok {
			continue
		}
		if storage, _, _ := unstructured.NestedBool(vm, "storage"); storage {
			version, _, _ = unstructured.NestedString(vm, "name")
			break
		}
	}

	if group == "" || plural == "" || version == "" {
		return kube.ApiResource{}, fmt.Errorf("CRD is missing group, plural name or storage version")
	}

	return kube.ApiResource{
		Group:        group,
		Version:      version,
		Name:         plural,
		Kind:         kind,
		SingularName: singular,
	}, nil
}

func (k *KubeServiceImpl) PatchResource(pr kube.PatchableResource) (*kube.Resource, error) {
	el := pr.ResourceMeta()
	gvr := k.gvrFromResource(el)

	logger := logging.Logger().WithFields(map[string]interface{}{
		"resource_kind":      el.Kind,
		"resource_name":      el.Name,
		"resource_namespace": el.Namespace,
		"resource_uid":       el.UID,
		"gvr":                gvr,
	})

	patchBytes, err := pr.PatchJSON()
	if err != nil {
		logger.WithError(err).Error("Failed to marshal patch JSON")
		return nil, fmt.Errorf("failed to marshal patch JSON: %w", err)
	}

	var resourceInterface dynamic.ResourceInterface
	if el.Namespace != "" {
		resourceInterface = k.dynamicClient.Resource(gvr).Namespace(el.Namespace)
	} else {
		resourceInterface = k.dynamicClient.Resource(gvr)
	}

	patchType := types.PatchType(pr.PatchType())

	logger.WithFields(map[string]interface{}{
		"patch_type": string(patchType),
		"patch_json": string(patchBytes),
		"patch_size": len(patchBytes),
	}).Debug("Sending patch request to Kubernetes API")

	result, err := resourceInterface.Patch(context.TODO(), el.Name, patchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"error":      err.Error(),
			"patch_type": string(patchType),
			"patch_json": string(patchBytes),
		}).Error("Kubernetes API rejected patch request")
		return nil, fmt.Errorf("failed to patch resource: %w", err)
	}

	logger.Debug("Successfully patched resource")
	res := k.mapper.ToResource(*result, el.Resource)
	return &res, nil
}

// gvrFromResource converts a kube.Resource to a GroupVersionResource.
// It extracts the group, version, and resource name from the kube.Resource.
// If the version contains a slash (e.g., "core/v1"), it splits it to get the actual version.
func (k *KubeServiceImpl) gvrFromResource(el kube.Resource) schema.GroupVersionResource {
	_, version := kube.SplitAPIVersion(el.Version)
	return schema.GroupVersionResource{
		Group:    el.Group,
		Version:  version,
		Resource: el.Resource,
	}
}

// findKubeResource retrieves a Kubernetes resource by its kind, name, and namespace.
func (k *KubeServiceImpl) findKubeResource(el kube.Resource) (unstructured.Unstructured, error) {
	gvr := k.gvrFromResource(el)

	var unstructuredObj *unstructured.Unstructured
	var err error
	if el.Namespace != "" {
		unstructuredObj, err = k.dynamicClient.Resource(gvr).Namespace(el.Namespace).Get(context.TODO(), el.Name, metav1.GetOptions{})
	} else {
		unstructuredObj, err = k.dynamicClient.Resource(gvr).Get(context.TODO(), el.Name, metav1.GetOptions{})
	}
	if err != nil {
		return unstructured.Unstructured{}, fmt.Errorf("failed to get resource: %v", err)
	}

	return *unstructuredObj, nil
}

// hasEndpointSlices reports whether the cluster serves a watchable
// discovery.k8s.io EndpointSlice resource.
func hasEndpointSlices(resList []*metav1.APIResourceList) bool {
	for _, group := range resList {
		gv, err := schema.ParseGroupVersion(group.GroupVersion)
		if err != nil || gv.Group != "discovery.k8s.io" {
			continue
		}
		for _, apiRes := range group.APIResources {
			if apiRes.Name == "endpointslices" && slices.Contains(apiRes.Verbs, "list") && slices.Contains(apiRes.Verbs, "watch") {
				return true
			}
		}
	}
	return false
}

func (k *KubeServiceImpl) DiscoverApis() ([]kube.ApiResource, error) {
	logger := logging.Logger()
	start := time.Now()
	resList, err := k.discoveryClient.ServerPreferredResources()
	if err != nil {
		logger.WithError(err).Error("Failed to fetch API groups from Kubernetes")
		return nil, err
	}
	logger.WithField("duration_ms", time.Since(start).Milliseconds()).Debug("Queried API discovery")
	logger.WithField("group_count", len(resList)).Debug("Found server-preferred API resource groups")

	// core/v1 Endpoints is deprecated since v1.33 in favor of discovery.k8s.io
	// EndpointSlice; watching it triggers API server deprecation warnings. Skip it
	// when the cluster serves EndpointSlice, but keep it on older clusters.
	skipCoreEndpoints := hasEndpointSlices(resList)

	var apis []kube.ApiResource
	for _, group := range resList {
		gv, err := schema.ParseGroupVersion(group.GroupVersion)
		if err != nil {
			logger.WithField("group_version", group.GroupVersion).WithError(err).Warn("Failed to parse group version")
			continue
		}

		for _, apiRes := range group.APIResources {
			if !slices.Contains(apiRes.Verbs, "list") || !slices.Contains(apiRes.Verbs, "watch") { // Skip resources that cannot be listed or watched
				continue
			}
			if skipCoreEndpoints && gv.Group == "" && apiRes.Name == "endpoints" {
				continue
			}
			apis = append(apis, kube.ApiResource{
				Group:        gv.Group,
				Version:      gv.Version,
				SingularName: apiRes.SingularName,
				Kind:         apiRes.Kind,
				Name:         apiRes.Name,
				ShortNames:   apiRes.ShortNames,
			})
		}
	}

	logger.WithField("api_count", len(apis)).Info("API discovery completed")
	return apis, nil
}
