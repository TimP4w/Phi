package kubernetes

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/timp4w/phi/internal/core/kubernetes"

	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestCrdToApiResource(t *testing.T) {
	crd := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata":   map[string]interface{}{"name": "widgets.example.com"},
			"spec": map[string]interface{}{
				"group": "example.com",
				"names": map[string]interface{}{
					"plural":   "widgets",
					"singular": "widget",
					"kind":     "Widget",
				},
				"versions": []interface{}{
					map[string]interface{}{"name": "v1alpha1", "served": true, "storage": false},
					map[string]interface{}{"name": "v1", "served": true, "storage": true},
				},
			},
		},
	}

	api, err := crdToApiResource(crd)

	assert.NoError(t, err)
	assert.Equal(t, "example.com", api.Group)
	assert.Equal(t, "v1", api.Version)
	assert.Equal(t, "widgets", api.Name)
	assert.Equal(t, "Widget", api.Kind)
}

func TestCrdToApiResource_MissingSpec(t *testing.T) {
	crd := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata":   map[string]interface{}{"name": "broken"},
		},
	}

	_, err := crdToApiResource(crd)

	assert.Error(t, err)
}

func normalizeYAML(yaml string) string {
	re := regexp.MustCompile(`(?m)^\s*creationTimestamp:.*\n?`)
	yaml = re.ReplaceAllString(yaml, "")
	yaml = strings.ReplaceAll(yaml, "\t", "  ")
	lines := strings.Split(yaml, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " ")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func TestKubeServiceImplGetResourceYAML(t *testing.T) {
	podName := "test"
	namespace := "test-ns"

	expectedYaml := normalizeYAML(describePodYAML(podName, namespace))
	podResource := NewPod(podName, namespace)

	// Setup mocks
	unstructuredPod := newUnstructuredPod("test", "test-ns")
	service := newTestKubeServiceImpl(unstructuredPod)

	yaml, err := service.GetResourceYAML(podResource)

	assert.NoError(t, err)
	assert.Equal(t, expectedYaml, normalizeYAML(string(yaml)))
}

func TestKubeServiceImplGetResourceYAMLRedactsSecret(t *testing.T) {
	name := "db-credentials"
	namespace := "test-ns"

	unstructuredSecret := newUnstructuredResource("Secret", "v1", name, namespace)
	unstructuredSecret.Object["data"] = map[string]interface{}{
		"username": "YWRtaW4=",
		"password": "c3VwZXItc2VjcmV0",
	}
	unstructuredSecret.Object["stringData"] = map[string]interface{}{
		"token": "plaintext-token",
	}
	metadata := unstructuredSecret.Object["metadata"].(map[string]interface{})
	metadata["annotations"] = map[string]interface{}{
		lastAppliedConfigAnnotation: `{"data":{"password":"c3VwZXItc2VjcmV0"}}`,
	}

	service := newTestKubeServiceImpl(unstructuredSecret)

	secretResource := kubernetes.Resource{
		Kind:      "Secret",
		Name:      name,
		Namespace: namespace,
		Version:   "v1",
		Group:     "",
		Resource:  "secrets",
	}

	out, err := service.GetResourceYAML(secretResource)

	assert.NoError(t, err)
	yamlStr := string(out)
	// Keys are preserved, values are redacted.
	assert.Contains(t, yamlStr, "username")
	assert.Contains(t, yamlStr, "password")
	assert.Contains(t, yamlStr, "token")
	assert.Contains(t, yamlStr, redactedValue)
	// No secret value or full-object annotation leaks through.
	assert.NotContains(t, yamlStr, "YWRtaW4=")
	assert.NotContains(t, yamlStr, "c3VwZXItc2VjcmV0")
	assert.NotContains(t, yamlStr, "plaintext-token")
	assert.NotContains(t, yamlStr, lastAppliedConfigAnnotation)
}

func TestKubeServiceImplGetResourceYAMLResourceNotFound(t *testing.T) {
	service := newTestKubeServiceImpl()

	podResource := NewPod("test", "default")

	_, err := service.GetResourceYAML(podResource)

	assert.Error(t, err)
	assert.Equal(t, err.Error(), "failed to get resource: pods \"test\" not found")
}

func TestKubeServiceImplWatchLogs(t *testing.T) {
	namespace := "default"
	podName := "test"
	containerName := "test-container"

	unstructuredPod := newUnstructuredPod(podName, namespace)

	service := newTestKubeServiceImpl(unstructuredPod)

	podResource := NewPod(podName, namespace)

	var logs []kubernetes.KubeLog
	err := service.WatchLogs(podResource, context.Background(), func(log kubernetes.KubeLog) {
		logs = append(logs, log)
	})

	assert.NoError(t, err)
	assert.Len(t, logs, 1)
	assert.Equal(t, "fake logs", logs[0].Message) // Can't change this https://github.com/kubernetes/kubernetes/issues/125590
	assert.Equal(t, containerName, logs[0].Container)
}

func TestKubeServiceImplWatchLogsResourceNotAPod(t *testing.T) {
	unstructuredPod := newUnstructuredResource("Deployment", "V1", "test-deployment", "test-ns")
	podResource := NewResource("Deployment", "test-deployment", "test-ns", "v1", "", "deployments")

	service := newTestKubeServiceImpl(unstructuredPod)

	var logs []kubernetes.KubeLog
	err := service.WatchLogs(podResource, context.Background(), func(log kubernetes.KubeLog) {
		logs = append(logs, log)
	})

	assert.Error(t, err)
	assert.Equal(t, err.Error(), "resource is not a pod")
}

func TestKubeServiceImplWatchResources(t *testing.T) {
	namespace := "default"
	podName := "test"
	existingPodName := "pre-existing"

	unstructuredPod := newUnstructuredPod(podName, namespace)

	// A pod that exists before the informers start must be delivered as an add
	// event during the initial cache sync (the store is populated this way).
	service := newTestKubeServiceImpl(newUnstructuredPod(existingPodName, namespace))

	apis := []kubernetes.ApiResource{{Name: "pods", Version: "v1", Group: "", Kind: "Pod"}}

	addCh := make(chan kubernetes.Resource, 8)
	updateCh := make(chan kubernetes.Resource, 8)
	deleteCh := make(chan kubernetes.Resource, 8)

	addFunc := func(r kubernetes.Resource) {
		addCh <- r
	}
	updateFunc := func(oldEl, newEl kubernetes.Resource) {
		updateCh <- newEl
	}
	deleteFunc := func(r kubernetes.Resource) {
		deleteCh <- r
	}

	// Blocks until the initial cache sync is complete.
	service.WatchResources(apis, addFunc, updateFunc, deleteFunc)

	select {
	case r := <-addCh:
		assert.Equal(t, existingPodName, r.Name)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for initial-sync add event")
	}

	gvr := service.gvrFromResource(kubernetes.Resource{
		Group:    "",
		Version:  "v1",
		Resource: "pods",
	})

	// Simulate add event
	_, err := service.dynamicClient.Resource(gvr).Namespace(namespace).Create(context.Background(), unstructuredPod, metav1.CreateOptions{})
	assert.NoError(t, err)

	select {
	case r := <-addCh:
		assert.Equal(t, podName, r.Name)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for add event")
	}

	// Simulate update event
	unstructuredPod.SetLabels(map[string]string{"updated": "true"})
	_, err = service.dynamicClient.Resource(gvr).Namespace(namespace).Update(context.Background(), unstructuredPod, metav1.UpdateOptions{})
	assert.NoError(t, err)

	select {
	case r := <-updateCh:
		assert.Equal(t, "true", r.Labels["updated"])
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for update event")
	}

	// Simulate delete event
	err = service.dynamicClient.Resource(gvr).Namespace(namespace).Delete(context.Background(), podName, metav1.DeleteOptions{})
	assert.NoError(t, err)

	select {
	case r := <-deleteCh:
		assert.Equal(t, podName, r.Name)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for delete event")
	}

}

func endpointsDiscovery(withEndpointSlices bool) []*metav1.APIResourceList {
	resList := []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", SingularName: "pod", Kind: "Pod", Verbs: metav1.Verbs{"list", "watch"}},
				{Name: "endpoints", SingularName: "endpoints", Kind: "Endpoints", Verbs: metav1.Verbs{"list", "watch"}},
			},
		},
	}
	if withEndpointSlices {
		resList = append(resList, &metav1.APIResourceList{
			GroupVersion: "discovery.k8s.io/v1",
			APIResources: []metav1.APIResource{
				{Name: "endpointslices", SingularName: "endpointslice", Kind: "EndpointSlice", Verbs: metav1.Verbs{"list", "watch"}},
			},
		})
	}
	return resList
}

func discoveredNames(apis []kubernetes.ApiResource) []string {
	names := make([]string, 0, len(apis))
	for _, api := range apis {
		names = append(names, api.Name)
	}
	return names
}

func TestDiscoverApisSkipsDeprecatedEndpointsWhenEndpointSlicesServed(t *testing.T) {
	svc := newTestKubeServiceImplWithApis(endpointsDiscovery(true))

	apis, err := svc.DiscoverApis()

	assert.NoError(t, err)
	names := discoveredNames(apis)
	assert.NotContains(t, names, "endpoints")
	assert.Contains(t, names, "endpointslices")
	assert.Contains(t, names, "pods")
}

func TestDiscoverApisKeepsEndpointsWithoutEndpointSlices(t *testing.T) {
	svc := newTestKubeServiceImplWithApis(endpointsDiscovery(false))

	apis, err := svc.DiscoverApis()

	assert.NoError(t, err)
	names := discoveredNames(apis)
	assert.Contains(t, names, "endpoints")
	assert.Contains(t, names, "pods")
}

func TestGetEventsErrorReturnsEmptyList(t *testing.T) {
	svc := newTestKubeServiceImpl()
	fakeClientset, ok := svc.clientSet.(*k8sfake.Clientset)
	if !ok {
		t.Fatalf("svc.clientSet is not a *fake.Clientset")
	}

	fakeClientset.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("some error")
	})

	events, err := svc.GetEvents()
	assert.Error(t, err)
	assert.Empty(t, events)
}

func TestGetEventsEventsExistReturnsMapped(t *testing.T) {
	fakeKubeEvent := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "foo",
			Namespace: "bar",
		},
		InvolvedObject: corev1.ObjectReference{
			Kind:      "Pod",
			Name:      "foo-pod",
			Namespace: "bar",
		},
		Message: "test message",
		Reason:  "test reason",
		Type:    "Normal",
	}

	svc := newTestKubeServiceImpl()

	fakeClientset, ok := svc.clientSet.(*k8sfake.Clientset)
	if !ok {
		t.Fatalf("svc.clientSet is not a *fake.Clientset")
	}

	_, err := fakeClientset.CoreV1().Events("bar").Create(context.Background(), fakeKubeEvent, metav1.CreateOptions{})
	assert.NoError(t, err)

	events, err := svc.GetEvents()

	assert.NoError(t, err)
	if assert.Len(t, events, 1) {
		assert.Equal(t, "foo-pod", events[0].Name)
		assert.Equal(t, "bar", events[0].Namespace)
		assert.Equal(t, "test message", events[0].Message)
		assert.Equal(t, "test reason", events[0].Reason)
		assert.Equal(t, "Normal", events[0].Type)
	}
}
