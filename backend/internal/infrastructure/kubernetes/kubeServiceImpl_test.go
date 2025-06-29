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
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/timp4w/phi/internal/core/kubernetes"

	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestKubeServiceImplGetInformerChannelsEmpty(t *testing.T) {
	service := &KubeServiceImpl{informersChannels: make(map[string]chan struct{})}
	channels := service.GetInformerChannels()
	assert.NotNil(t, channels)
	assert.Equal(t, 0, len(channels))
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

	unstructuredPod := newUnstructuredPod(podName, namespace)

	service := newTestKubeServiceImpl()

	resourceKey := "pods_v1_"
	uniqueResources := map[string]struct{}{
		resourceKey: {},
	}

	var added, updated, deleted []kubernetes.Resource
	addCh := make(chan kubernetes.Resource, 1)
	updateCh := make(chan kubernetes.Resource, 1)
	deleteCh := make(chan kubernetes.Resource, 1)

	addFunc := func(r kubernetes.Resource) {
		added = append(added, r)
		addCh <- r
	}
	updateFunc := func(oldEl, newEl kubernetes.Resource) {
		updated = append(updated, newEl)
		updateCh <- newEl
	}
	deleteFunc := func(r kubernetes.Resource) {
		deleted = append(deleted, r)
		deleteCh <- r
	}

	done := make(chan struct{})
	go func() {
		service.WatchResources(uniqueResources, addFunc, updateFunc, deleteFunc)
		close(done)
	}()

	time.Sleep(200 * time.Millisecond) // Wait for informer to start

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
