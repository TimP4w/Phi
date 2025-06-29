package tree

import (
	"testing"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
)

func makeTestResource(uid, name, kind, namespace, group, version, resource string, children ...kube.Resource) kube.Resource {
	return kube.Resource{
		UID:       uid,
		Name:      name,
		Kind:      kind,
		Namespace: namespace,
		Group:     group,
		Version:   version,
		Resource:  resource,
		Children:  children,
	}
}

func TestSetTreeAndGetTree(t *testing.T) {
	ts := NewTreeService().(*TreeServiceImpl)
	root := makeTestResource("uid1", "root", "RootKind", "ns", "core", "v1", "roots")
	ts.SetTree(root)
	tree := ts.GetTree()
	assert.NotNil(t, tree)
	assert.Equal(t, "uid1", tree.Root.UID)
}

func TestGetTreeNil(t *testing.T) {
	ts := NewTreeService().(*TreeServiceImpl)
	tree := ts.GetTree()
	assert.Nil(t, tree)
}

func TestFindNodeByUID(t *testing.T) {
	child := makeTestResource("uid2", "child", "ChildKind", "ns", "core", "v1", "children")
	root := makeTestResource("uid1", "root", "RootKind", "ns", "core", "v1", "roots", child)
	ts := NewTreeService().(*TreeServiceImpl)
	ts.SetTree(root)

	node := ts.FindNodeByUID("uid2")
	assert.NotNil(t, node)
	assert.Equal(t, "uid2", node.UID)

	notFound := ts.FindNodeByUID("not-exist")
	assert.Nil(t, notFound)
}

func TestGetUniqueResourceAPIRefs(t *testing.T) {
	grandchild := makeTestResource("uid3", "grandchild", "GrandChildKind", "ns", "core", "v1", "grandchildren")
	child := makeTestResource("uid2", "child", "ChildKind", "ns", "core", "v1", "children", grandchild)
	root := makeTestResource("uid1", "root", "RootKind", "ns", "core", "v1", "roots", child)
	ts := NewTreeService().(*TreeServiceImpl)
	ts.SetTree(root)

	refs := ts.GetUniqueResourceAPIRefs()
	assert.Contains(t, refs, "roots_v1_core")
	assert.Contains(t, refs, "children_v1_core")
	assert.Contains(t, refs, "grandchildren_v1_core")
}
