package kubernetes

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/logging"
	"github.com/timp4w/phi/internal/core/shared"
	"github.com/timp4w/phi/internal/core/utils"

	"gopkg.in/yaml.v2"

	corev1 "k8s.io/api/core/v1"
	v1 "k8s.io/api/core/v1"
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

type KubeServiceImpl struct {
	discoveryClient   discovery.DiscoveryInterface
	dynamicClient     dynamic.Interface
	clientSet         clientset.Interface
	mu                sync.RWMutex
	mapper            *KubeMapper
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

	// Convert to YAML
	yamlData, err := yaml.Marshal(unstructuredObj)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal resource to YAML: %v", err)
	}

	return yamlData, nil
}

func (k *KubeServiceImpl) WatchLogs(pod kube.Resource, ctx context.Context, onLog func(kubernetes.KubeLog)) error {
	if pod.Kind != "Pod" {
		return fmt.Errorf("resource is not a pod")
	}
	count := int64(100)

	podLogOpts := &corev1.PodLogOptions{
		Follow:     true,
		Timestamps: true,
		TailLines:  &count,
	}

	podResource, err := k.findKubeResource(pod)
	if err != nil {
		return fmt.Errorf("failed to get pod resource: %v", err)
	}

	podR := &v1.Pod{}
	err = runtime.DefaultUnstructuredConverter.FromUnstructured(podResource.UnstructuredContent(), podR)
	if err != nil {
		return fmt.Errorf("failed to convert pod resource: %v", err)
	}

	for _, container := range podR.Spec.Containers {
		podLogOpts.Container = container.Name
		req := k.clientSet.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, podLogOpts)
		stream, err := req.Stream(ctx)
		if err != nil {
			return fmt.Errorf("failed to open stream: %v", err)
		}
		defer stream.Close()

		sc := bufio.NewScanner(stream)
		for sc.Scan() {
			text := sc.Text()
			chunks := chunks(text, 1000)
			for _, chunk := range chunks {
				timestamp, message := parseMessage(chunk)
				logMessage := kubernetes.KubeLog{
					Timestamp: timestamp,
					Message:   message,
					Container: container.Name,
				}
				onLog(logMessage)
			}
		}

	}
	return nil
}

func (k *KubeServiceImpl) WatchResources(resourceApiRefsSet map[string]struct{}, addFunc func(kube.Resource), updateFunc func(oldEl, newEl kube.Resource), deleteFunc func(kube.Resource)) {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(k.dynamicClient, time.Minute*15, "", nil) // TODO: make resync period configurable
	for encodedResourceApiRef := range resourceApiRefsSet {
		resource, version, group, err := k.decodeResourceApiRef(encodedResourceApiRef)
		if err != nil {
			logging.Logger().WithFields(map[string]interface{}{
				"encoded_resource_api_ref": encodedResourceApiRef,
				"error":                    err,
			}).Error("Error decoding resource api ref")
			continue
		}
		gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
		informer := factory.ForResource(gvr).Informer()
		informer.AddEventHandler(k.defaultResourceEventHandler(resource, addFunc, updateFunc, deleteFunc))
		go k.runInformer(encodedResourceApiRef, resource, version, informer)
	}
}

func (k *KubeServiceImpl) GetEvents() ([]kube.Event, error) {
	kubeEvents, err := k.clientSet.CoreV1().Events("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		return []kubernetes.Event{}, err
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

func (k *KubeServiceImpl) defaultResourceEventHandler(resource string, addFunc func(kube.Resource), updateFunc func(oldEl, newEl kube.Resource), deleteFunc func(kube.Resource)) cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj any) {
			if time.Since(obj.(*unstructured.Unstructured).GetCreationTimestamp().Time) <= 2*time.Minute { // ignore old resources since we already have them
				el := k.mapper.ToResource(*obj.(*unstructured.Unstructured), resource)
				addFunc(el)
			}
		},
		UpdateFunc: func(oldObj, newObj any) {
			newEl := k.mapper.ToResource(*newObj.(*unstructured.Unstructured), resource)
			oldEl := k.mapper.ToResource(*oldObj.(*unstructured.Unstructured), resource)

			updateFunc(oldEl, newEl)
		},
		DeleteFunc: func(obj any) {
			if (obj.(*unstructured.Unstructured)).GetDeletionTimestamp() == nil || time.Since(obj.(*unstructured.Unstructured).GetDeletionTimestamp().Time) <= 2*time.Minute { // ignore old resources since we already have them
				el := k.mapper.ToResource(*obj.(*unstructured.Unstructured), resource)
				deleteFunc(el)
			}
		},
	}
}

func (k *KubeServiceImpl) GetInformerChannels() map[string]chan struct{} {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.informersChannels
}

// createInformerChannel creates a new channel for a specific resource informer.
// If a channel already exists for the resource, it closes the old channel and creates a new one.
func (k *KubeServiceImpl) createInformerChannel(encodedResourceApiRef string) *chan struct{} {
	k.mu.Lock()
	defer k.mu.Unlock()
	channel, exists := k.informersChannels[encodedResourceApiRef]
	if exists {
		close(channel)
		delete(k.informersChannels, encodedResourceApiRef)
	}
	newChannel := make(chan struct{})
	k.informersChannels[encodedResourceApiRef] = newChannel
	return &newChannel
}

// CleanupInformerChannel closes and removes the informer channel for the given resource.
func (k *KubeServiceImpl) CleanupInformerChannel(encodedResourceApiRef string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if channel, exists := k.informersChannels[encodedResourceApiRef]; exists {
		close(channel)
		delete(k.informersChannels, encodedResourceApiRef)
	}
}

// runInformer starts a Kubernetes informer for a specific resource and version.
func (k *KubeServiceImpl) runInformer(encodedResourceApiRef string, resource string, version string, informer cache.SharedInformer) {
	newChannel := k.createInformerChannel(encodedResourceApiRef)
	defer k.CleanupInformerChannel(encodedResourceApiRef)

	go informer.Run(*newChannel)

	logger := logging.Logger().WithFields(map[string]any{
		"resource": resource,
		"version":  version,
	})

	if !cache.WaitForCacheSync(*newChannel, informer.HasSynced) {
		logger.Warn("Failed to sync cache")
	}

	logger.Debug("Synced cache")
	select {}
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
	version := el.Version
	if parts := strings.SplitN(el.Version, "/", 2); len(parts) == 2 {
		version = parts[1]
	}

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

// decodeResourceApiRef decodes a resource version string into its components: resource, version, and group.
// The expected format is "resource_version_group", e.g., "pods_v1_core".
func (k *KubeServiceImpl) decodeResourceApiRef(encodedResourceApiRef string) (string, string, string, error) {
	parts := strings.SplitN(encodedResourceApiRef, "_", 3)
	if len(parts) < 3 {
		return "", "", "", fmt.Errorf("invalid resourceApiRef format: %s", encodedResourceApiRef)
	}
	resource := parts[0]
	version := parts[1]
	group := parts[2]
	if strings.Contains(version, "/") {
		versionParts := strings.Split(version, "/")
		version = versionParts[1]
	}
	return resource, version, group, nil
}

/*
Copyright 2024 ahmetb

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
Original version: https://github.com/ahmetb/kubectl-tree/blob/8c32ac5fddbb59972a0d42e10f34500592fbacb5/cmd/kubectl-tree/apis.go
*/

func (k *KubeServiceImpl) DiscoverApis() (*kube.ResourceMap, error) {
	logger := logging.Logger()
	start := time.Now()
	resList, err := k.discoveryClient.ServerPreferredResources()
	if err != nil {
		logger.WithError(err).Error("Failed to fetch API groups from Kubernetes")
		return nil, err
	}
	logger.WithField("duration_ms", time.Since(start).Milliseconds()).Debug("Queried API discovery")
	logger.WithField("group_count", len(resList)).Debug("Found server-preferred API resource groups")

	rm := &kube.ResourceMap{}
	var wg sync.WaitGroup
	var mu sync.Mutex // Mutex to protect shared data

	for _, group := range resList {
		wg.Add(1)
		go func(group *metav1.APIResourceList) {
			defer wg.Done()

			gv, err := schema.ParseGroupVersion(group.GroupVersion)
			if err != nil {
				logging.Logger().WithField("group_version", group.GroupVersion).WithError(err).Warn("Failed to parse group version")
				return
			}

			for _, apiRes := range group.APIResources {
				if !utils.Contains(apiRes.Verbs, "list") { // Skip resources that cannot be listed
					continue
				}
				api := kube.ApiResource{
					Group:        gv.Group,
					Version:      gv.Version,
					SingularName: apiRes.SingularName,
					Kind:         apiRes.Kind,
					Name:         apiRes.Name,
					ShortNames:   apiRes.ShortNames,
				}
				names := k.getApiNamesByResource(apiRes, gv)

				// Temporary slice to avoid modifying shared slices concurrently
				var newList []kube.ApiResource
				for _, name := range names {
					mu.Lock()
					rm.M.Store(name, append(rm.Lookup(name), api))
					newList = append(newList, api)
					mu.Unlock()
				}

				mu.Lock()
				rm.List = append(rm.List, newList...)
				mu.Unlock()
			}
		}(group)
	}
	wg.Wait()

	logging.Logger().WithField("api_count", len(rm.List)).Info("API discovery completed")
	return rm, nil
}

func (k *KubeServiceImpl) DiscoverResources(rm *kube.ResourceMap) (map[string]*kube.Resource, error) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	out := make(map[string]*kube.Resource)

	logger := logging.Logger()
	start := time.Now()
	var errResult error
	for _, api := range rm.Resources() {
		wg.Add(1)
		go func(a kube.ApiResource) {
			defer wg.Done()
			apiLogger := logger.WithField("resource_group", k.groupVersionResource(a).String())
			apiLogger.Debug("Starting API resource query")

			v, err := k.listResourcesByApi(a)
			if err != nil {
				apiLogger.WithError(err).Error("Error querying API resource")
				errResult = err
				return
			}
			mu.Lock()
			for _, el := range v {
				out[string(el.UID)] = &el
			}
			mu.Unlock()
			apiLogger.WithField("resource_count", len(v)).Debug("Completed API resource query")
		}(api)
	}

	logger.Debug("Started all API query goroutines")
	wg.Wait()
	logger.WithFields(map[string]interface{}{
		"duration_ms":    time.Since(start).Milliseconds(),
		"error":          errResult != nil,
		"resource_count": len(out),
	}).Info("Completed resource discovery")

	return out, errResult
}

// Generates a list of possible API name variants for a given Kubernetes API resource.
func (k *KubeServiceImpl) getApiNamesByResource(a metav1.APIResource, gv schema.GroupVersion) []string {
	var out []string
	singularName := a.SingularName
	if singularName == "" {
		singularName = strings.ToLower(a.Kind)
	}
	names := []string{singularName, a.Name}
	names = append(names, a.ShortNames...)

	for _, n := range names {
		out = append(out,
			n,
			strings.Join([]string{n, gv.Group}, "."),
			strings.Join([]string{n, gv.Version, gv.Group}, "."))
	}
	return out
}

func (k *KubeServiceImpl) groupVersionResource(api kube.ApiResource) schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    api.Group,
		Version:  api.Version,
		Resource: api.Name,
	}
}

// listResourcesByApi retrieves all resources of the specified Kubernetes API resource type
func (k *KubeServiceImpl) listResourcesByApi(api kube.ApiResource) ([]kube.Resource, error) {
	var out []kube.Resource
	var next string

	logger := logging.Logger().WithFields(map[string]interface{}{
		"api_group":    api.Group,
		"api_version":  api.Version,
		"api_resource": api.Name,
	})

	pageCount := 0
	for {
		pageCount++
		intf := k.dynamicClient.Resource(k.groupVersionResource(api))
		resp, err := intf.List(context.TODO(), metav1.ListOptions{
			Limit:    250,
			Continue: next,
		})
		if err != nil {
			logger.WithError(err).Error("Listing resources failed")
			return nil, fmt.Errorf("listing resources failed (%s): %w", k.groupVersionResource(api), err)
		}

		for _, item := range resp.Items {
			out = append(out, k.mapper.ToResource(item, api.Name))
		}

		next = resp.GetContinue()
		if next == "" {
			break
		}
	}

	if pageCount > 1 {
		logger.WithFields(map[string]interface{}{
			"page_count":     pageCount,
			"resource_count": len(out),
		}).Debug("Completed paginated resource listing")
	}

	return out, nil
}

// ^ END OF Copyright 2024 ahmetb CODE ^
