package kubernetes

import (
	"fmt"
	"time"

	"github.com/timp4w/phi/internal/core/kubernetes"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	fakeDiscovery "k8s.io/client-go/discovery/fake"
	fakeDynamic "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func newUnstructuredResource(kind, version, name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": version,
			"kind":       kind,
			"metadata": map[string]interface{}{
				"name":              name,
				"namespace":         namespace,
				"creationTimestamp": time.Now().Format(time.RFC3339),
			},
		},
	}
}

func newUnstructuredPod(name, namespace string) *unstructured.Unstructured {
	pod := newUnstructuredResource("Pod", "v1", name, namespace)
	pod.Object["spec"] = map[string]interface{}{
		"containers": []interface{}{
			map[string]interface{}{
				"name": "test-container",
			},
		},
	}
	return pod
}

func describePodYAML(name, namespace string) string {
	return fmt.Sprintf(`object:
  apiVersion: v1
  kind: Pod
  metadata:
    creationTimestamp: "2025-07-01T19:15:24+02:00"
    name: %s
    namespace: %s
  spec:
    containers:
    - name: test-container
`, name, namespace)
}

type mockDiscoveryClient struct {
	*fakeDiscovery.FakeDiscovery
}

func newTestKubeServiceImpl(objects ...runtime.Object) *KubeServiceImpl {
	scheme := runtime.NewScheme()

	_ = corev1.AddToScheme(scheme)

	return &KubeServiceImpl{
		discoveryClient:   &mockDiscoveryClient{FakeDiscovery: &fakeDiscovery.FakeDiscovery{}},
		dynamicClient:     fakeDynamic.NewSimpleDynamicClient(scheme, objects...),
		clientSet:         k8sfake.NewClientset(),
		mapper:            NewKubeMapper(),
		informersChannels: make(map[string]chan struct{}),
	}
}

func NewPod(name, namespace string) kubernetes.Resource {
	return kubernetes.Resource{
		Kind:      "Pod",
		Name:      name,
		Namespace: namespace,
		Version:   "v1",
		Group:     "",
		Resource:  "pods",
	}
}

func NewResource(kind, name, namespace, version, group, resource string) kubernetes.Resource {
	return kubernetes.Resource{
		Kind:      kind,
		Name:      name,
		Namespace: namespace,
		Version:   "v1",
		Group:     "",
		Resource:  "pods",
	}
}
