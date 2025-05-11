package kubernetes

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/fluxcd/pkg/apis/meta"
	"github.com/timp4w/phi/internal/core/kubernetes"
	kube "github.com/timp4w/phi/internal/core/kubernetes"

	helmv2 "github.com/fluxcd/helm-controller/api/v2"
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
	clientSet         *clientset.Clientset
	mu                sync.RWMutex
	mapper            *KubeMapper
	informersChannels map[string]chan struct{}
}

var _ kube.KubeService = (*KubeServiceImpl)(nil)

func NewKubeServiceImpl() kube.KubeService {
	var restConfig *rest.Config
	var err error

	cf := genericclioptions.NewConfigFlags(false)
	flag.Set("v", "1")
	flag.Parse()

	isDev := os.Getenv("PHI_DEV")

	if isDev == "true" {
		kubeconfigPath := os.Getenv("PHI_KUBE_CONFIG_PATH")
		cf.KubeConfig = &kubeconfigPath
		restConfig, err = cf.ToRESTConfig()
	} else {
		restConfig, err = rest.InClusterConfig()
	}

	if err != nil {
		fmt.Printf("Error creating in-cluster config: %s\n", err.Error())
		os.Exit(1)
	}

	restConfig.WarningHandler = rest.NoWarnings{}
	restConfig.QPS = 1000
	restConfig.Burst = 1000

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		log.Fatal("failed to construct dynamic client:", err)
	}

	discoveryClient, err := cf.ToDiscoveryClient()
	if err != nil {
		log.Fatal("failed to construct discovery client:", err)
	}

	clientSet, err := clientset.NewForConfig(restConfig)
	if err != nil {
		log.Fatal("failed to construct clientset:", err)
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
		return nil, fmt.Errorf("failed to get resource: %v", err)
	}

	// Convert to YAML
	yamlData, err := yaml.Marshal(unstructuredObj)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal resource to YAML: %v", err)
	}

	return yamlData, nil
}

/*
Copyright 2024 gimlet-io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
Original version: https://github.com/gimlet-io/capacitor/blob/12b1b8d48edbda8f0b71a7442163352064fe793c/pkg/logs/logs.go
*/
func chunks(str string, size int) []string {
	if len(str) <= size {
		return []string{str}
	}
	return append([]string{string(str[0:size])}, chunks(str[size:], size)...)
}

func parseMessage(chunk string) (time.Time, string) {
	parts := strings.SplitN(chunk, " ", 2)

	if len(parts) != 2 {
		return time.Time{}, parts[0]
	}

	timestamp, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, parts[0]
	}
	return timestamp, parts[1]
}

// ^^ End of the copied code ^^

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

func (k *KubeServiceImpl) WatchResources(uniqueResources map[string]struct{}, addFunc func(kube.Resource), updateFunc func(oldEl, newEl kube.Resource), deleteFunc func(kube.Resource)) {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(k.dynamicClient, time.Minute*15, "", nil) // TODO: make resync period configurable
	for resourceVersion := range uniqueResources {
		resource, version, group, err := k.decodeResourceVersion(resourceVersion)
		if err != nil {
			log.Printf("Error decoding resource version %s: %v", resourceVersion, err)
			continue
		}
		gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
		informer := factory.ForResource(gvr).Informer()
		informer.AddEventHandler(k.defaultResourceEventHandler(resource, addFunc, updateFunc, deleteFunc))
		go k.runInformer(resourceVersion, resource, version, informer)
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
	// TODO: implement a way to stop the channel (cancellable context)
	watch, err := k.clientSet.CoreV1().Events("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Fatalf("Error creating watch: %v", err)
	}

	go func() {
		// Process events
		for event := range watch.ResultChan() {
			e, ok := event.Object.(*corev1.Event)
			if !ok {
				log.Printf("Unexpected type")
				continue
			}
			event := k.mapper.ToEvent(e)
			onEvent(&event)
		}
	}()
}

func (k *KubeServiceImpl) defaultResourceEventHandler(resource string, addFunc func(kube.Resource), updateFunc func(oldEl, newEl kube.Resource), deleteFunc func(kube.Resource)) cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if time.Since(obj.(*unstructured.Unstructured).GetCreationTimestamp().Time) <= 2*time.Minute { // ignore old resources since we already have them
				el := k.mapper.ToResource(*obj.(*unstructured.Unstructured), resource)
				addFunc(el)
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			newEl := k.mapper.ToResource(*newObj.(*unstructured.Unstructured), resource)
			oldEl := k.mapper.ToResource(*oldObj.(*unstructured.Unstructured), resource)
			/*if newEl.DeepEqual(oldEl) {
				// Avoid flooding by checking if there were meaningful changes
				return
			}*/
			updateFunc(oldEl, newEl)
		},
		DeleteFunc: func(obj interface{}) {
			if (obj.(*unstructured.Unstructured)).GetDeletionTimestamp() == nil {
				return // ignore resources that are not deleted
			}
			if time.Since(obj.(*unstructured.Unstructured).GetDeletionTimestamp().Time) <= 2*time.Minute { // ignore old resources since we already have them
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

func (k *KubeServiceImpl) createInformerChannel(encodedResource string) *chan struct{} {
	k.mu.Lock()
	defer k.mu.Unlock()
	channel, exists := k.informersChannels[encodedResource]
	if exists {
		close(channel)
	}
	newChannel := make(chan struct{})
	k.informersChannels[encodedResource] = newChannel
	return &newChannel
}

func (k *KubeServiceImpl) runInformer(encodedResource string, resource string, version string, informer cache.SharedInformer) {
	newChannel := k.createInformerChannel(encodedResource)
	defer close(*newChannel)

	go informer.Run(*newChannel)

	if !cache.WaitForCacheSync(*newChannel, informer.HasSynced) {
		log.Printf("Failed to sync cache for %s/%s", resource, version)
	}
	log.Printf("Synced cache for %s/%s", resource, version)
	select {}

}

func (k *KubeServiceImpl) Suspend(el kube.Resource) (*kube.Resource, error) {
	object, err := k.findKubeResource(el)
	if err != nil {
		return nil, fmt.Errorf("failed to get resource: %v", err)
	}

	if !el.IsSuspendable() {
		return nil, fmt.Errorf("resource is not supported")
	}

	un := object.UnstructuredContent()
	un["spec"].(map[string]interface{})["suspend"] = true
	_, err = k.patchResource(el, unstructured.Unstructured{Object: un})
	if err != nil {
		return nil, fmt.Errorf("failed to suspend resource: %v", err)
	}

	return &el, nil
}

func (k *KubeServiceImpl) Resume(el kube.Resource) (*kube.Resource, error) {
	object, err := k.findKubeResource(el)
	if err != nil {
		return nil, fmt.Errorf("failed to get resource: %v", err)
	}

	if !el.IsSuspendable() {
		return nil, fmt.Errorf("resource is not supported")
	}

	un := object.UnstructuredContent()
	un["spec"].(map[string]interface{})["suspend"] = false
	_, err = k.patchResource(el, unstructured.Unstructured{Object: un})
	if err != nil {
		return nil, fmt.Errorf("failed to resume resource: %v", err)
	}

	return &el, nil
}

func (k *KubeServiceImpl) Reconcile(el kube.Resource) (*kube.Resource, error) {
	// TODO: check if the object is suspended
	// TODO: check if the object is static (? or do we really need this?)

	/*
		 if reconcile.object.isStatic() {
				logger.Successf("reconciliation not supported by the object")
				return nil
			}
			if reconcile.object.isSuspended() {
				return fmt.Errorf("resource is suspended")
			}
	*/

	if !el.IsReconcilable() {
		return nil, fmt.Errorf("resource is not reconcilable")
	}

	object, err := k.findKubeResource(el)

	if err != nil {
		return nil, fmt.Errorf("failed to get resource: %v", err)
	}

	ts := time.Now().Format(time.RFC3339Nano)
	annotations := object.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string, 1)
	}
	annotations[meta.ReconcileRequestAnnotation] = ts
	if el.Kind == "HelmRelease" {
		annotations[helmv2.ForceRequestAnnotation] = ts
	}
	/*
		https://github.com/fluxcd/flux2/blob/main/cmd/flux/reconcile_helmrelease.go#L58
		https://github.com/fluxcd/flux2/blob/437a94367784541695fa68deba7a52b188d97ea8/cmd/flux/reconcile.go#L180
			if element.Kind == "HelmRelease" {
				if rhrArgs.syncReset {
					annotations[helmv2.ResetRequestAnnotation] = ts
				}
			}
	*/
	object.SetAnnotations(annotations)

	_, err = k.patchResource(el, object)
	if err != nil {
		return nil, fmt.Errorf("failed to reconcile resource: %v", err)
	}

	// TODO: Poll until reconciled
	return &el, nil
}

func (k *KubeServiceImpl) patchResource(el kube.Resource, patch unstructured.Unstructured) (*unstructured.Unstructured, error) {
	gvr := k.gvrFromResource(el)

	objectBytes, err := patch.MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal resource to JSON: %v", err)
	}

	result, er := k.dynamicClient.Resource(gvr).Namespace(el.Namespace).Patch(context.TODO(), el.Name, types.MergePatchType, objectBytes, metav1.PatchOptions{})
	if er != nil {
		return nil, fmt.Errorf("failed to patch resource: %v", er)
	}

	return result, nil
}

func (k *KubeServiceImpl) gvrFromResource(el kube.Resource) schema.GroupVersionResource {
	version := el.Version
	if strings.Contains(el.Version, "/") {
		versionParts := strings.Split(el.Version, "/")
		version = versionParts[1]
	}

	gvr := schema.GroupVersionResource{
		Group:    el.Group,
		Version:  version,
		Resource: el.Resource,
	}

	return gvr
}

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

func (k *KubeServiceImpl) decodeResourceVersion(resourceVersion string) (string, string, string, error) {
	parts := strings.SplitN(resourceVersion, "_", 3)
	resource := parts[0]
	version := parts[1]
	group := parts[2]
	if strings.Contains(version, "/") {
		versionParts := strings.Split(version, "/")
		version = versionParts[1]
	}
	return resource, version, group, nil
}
