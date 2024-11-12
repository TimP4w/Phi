package kubernetes

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	kube "github.com/timp4w/phi/internal/core/kubernetes"
	"github.com/timp4w/phi/internal/core/utils"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

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

func (k *KubeServiceImpl) FindAllApis() (*kube.ResourceMap, error) {
	start := time.Now()
	resList, err := k.discoveryClient.ServerPreferredResources()
	if err != nil {
		log.Printf("failed to fetch api groups from kubernetes: %v", err)
		return nil, err
	}
	log.Printf("queried api discovery in %v", time.Since(start))
	log.Printf("found %d items (groups) in server-preferred APIResourceList", len(resList))

	rm := &kube.ResourceMap{}
	var wg sync.WaitGroup
	for _, group := range resList {
		wg.Add(1)
		go func(group *metav1.APIResourceList) {
			defer wg.Done()

			gv, err := schema.ParseGroupVersion(group.GroupVersion)
			if err != nil {
				log.Printf("failed to parse groupversion %q: %v", group.GroupVersion, err)
				return
			}

			for _, apiRes := range group.APIResources {
				if !utils.Contains(apiRes.Verbs, "list") {
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
				for _, name := range names {
					rm.M.Store(name, append(rm.Lookup(name), api))
				}
				rm.List = append(rm.List, api)
			}
		}(group)
	}
	wg.Wait()
	log.Printf("Found %d APIs", len(rm.List))
	return rm, nil
}

func (k *KubeServiceImpl) FindAllResources(rm *kube.ResourceMap) (map[string]*kube.Resource, error) {
	var mu sync.Mutex
	var wg sync.WaitGroup
	out := make(map[string]*kube.Resource)

	start := time.Now()
	var errResult error
	for _, api := range rm.Resources() {
		wg.Add(1)
		go func(a kube.ApiResource) {
			defer wg.Done()
			log.Printf("[query api] start: %s", k.groupVersionResource(api))
			v, err := k.listResourcesByApi(a)
			if err != nil {
				log.Printf("[query api] error querying: %s, error=%v", k.groupVersionResource(api), err)
				errResult = err
				return
			}
			mu.Lock()
			for _, el := range v {
				out[string(el.UID)] = &el
			}
			mu.Unlock()
			log.Printf("[query api]  done: %s, found %d apis", k.groupVersionResource(api), len(v))
		}(api)
	}

	log.Printf("fired up all goroutines to query APIs")
	wg.Wait()
	log.Printf("all goroutines have returned in %v", time.Since(start))
	log.Printf("query result: error=%v, objects=%d", errResult, len(out))

	return out, errResult
}

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

func (k *KubeServiceImpl) listResourcesByApi(api kube.ApiResource) ([]kube.Resource, error) {
	var out []kube.Resource
	var next string

	for {
		intf := k.dynamicClient.Resource(k.groupVersionResource(api))
		resp, err := intf.List(context.TODO(), metav1.ListOptions{
			Limit:    250,
			Continue: next,
		})
		if err != nil {
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
	return out, nil
}
