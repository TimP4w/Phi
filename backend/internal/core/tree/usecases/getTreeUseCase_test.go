package treeusecases

import (
	"testing"

	"github.com/stretchr/testify/assert"
	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/tree"
	mocks "github.com/timp4w/phi/internal/testing/testdata"
)

func TestGetTreeUseCaseExecuteReturnsRoot(t *testing.T) {
	root := kube.Resource{UID: "root-uid", Name: "root"}
	tree := tree.Tree{Root: root}

	mockSvc := &mocks.TreeService{}
	mockSvc.On("GetTree").Return(&tree, nil)

	uc := &GetTreeUseCase{treeService: mockSvc}

	res, err := uc.Execute(GetTreeInput{})
	assert.NoError(t, err)
	assert.NotNil(t, res)
	assert.Equal(t, "root-uid", res.UID)
	assert.Equal(t, "root", res.Name)
}

func TestGetTreeUseCaseExecuteNilTree(t *testing.T) {
	mockSvc := &mocks.TreeService{}
	mockSvc.On("GetTree").Return(nil, assert.AnError)
	uc := &GetTreeUseCase{treeService: mockSvc}

	res, err := uc.Execute(GetTreeInput{})
	assert.Error(t, err)
	assert.Nil(t, res)
}
