package kubernetes

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestKubeStore_ConcurrentReadWrite hammers the store from many goroutines while
// readers iterate the snapshots they receive. It is meaningless without `-race`:
// its job is to surface data races between writers mutating stored resources and
// readers that hold references handed back by the read APIs. If GetResources /
// GetResourceByUID leak pointers into the store's own structs, the race detector
// trips here.
func TestKubeStore_ConcurrentReadWrite(t *testing.T) {
	s := newStore()

	const resourceCount = 20
	for i := 0; i < resourceCount; i++ {
		uid := fmt.Sprintf("uid-%d", i)
		r := makeResource(uid, fmt.Sprintf("pod-%d", i), "default", "Pod", "v1", "")
		r.Labels["seed"] = "true"
		s.UpdateResource(r)
	}

	var wg sync.WaitGroup
	stop := make(chan struct{})

	// Writers: continuously re-write existing resources, mutating their maps and
	// slices so any aliased read observes a torn write.
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for n := 0; ; n++ {
				select {
				case <-stop:
					return
				default:
				}
				uid := fmt.Sprintf("uid-%d", n%resourceCount)
				r := makeResource(uid, "pod", "default", "Pod", "v1", "")
				r.Labels[fmt.Sprintf("w%d", worker)] = fmt.Sprintf("%d", n)
				r.Conditions = append(r.Conditions, Condition{Type: "Ready", Status: "True"})
				s.UpdateResource(r)
			}
		}(w)
	}

	// Readers: take snapshots and actually read through them (range the maps and
	// slices), which is where an aliased pointer races the writer's mutation.
	for r := 0; r < 4; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				for _, res := range s.GetResources() {
					for k, v := range res.Labels {
						_ = k + v
					}
					for _, c := range res.Conditions {
						_ = c.Type
					}
				}
				if got := s.GetResourceByUID("uid-1"); got != nil {
					for k := range got.Labels {
						_ = k
					}
				}
			}
		}()
	}

	time.Sleep(150 * time.Millisecond)
	close(stop)
	wg.Wait()
}

// TestKubeStore_GetResources_SnapshotIsolatedFromWrites asserts the stronger
// property the old "ReturnsCopy" test missed: mutating the resource a caller
// received must not bleed into the store, and a later store write must not bleed
// into the snapshot the caller already holds. Both require deep, not aliased,
// copies.
func TestKubeStore_GetResources_SnapshotIsolatedFromWrites(t *testing.T) {
	s := newStore()
	r := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	r.Labels["app"] = "original"
	s.UpdateResource(r)

	// 1. A caller mutating its snapshot must not corrupt the store.
	snapshot := s.GetResources()["uid-1"]
	snapshot.Name = "tampered"
	snapshot.Labels["app"] = "tampered"
	snapshot.Conditions = append(snapshot.Conditions, Condition{Type: "Hacked"})

	stored := s.GetResourceByUID("uid-1")
	assert.Equal(t, "pod", stored.Name, "store name must be unaffected by snapshot mutation")
	assert.Equal(t, "original", stored.Labels["app"], "store label must be unaffected by snapshot mutation")
	assert.Empty(t, stored.Conditions, "store conditions must be unaffected by snapshot mutation")

	// 2. A store write must not retroactively change a snapshot already handed out.
	before := s.GetResourceByUID("uid-1")
	updated := makeResource("uid-1", "pod", "default", "Pod", "v1", "")
	updated.Labels["app"] = "v2"
	s.UpdateResource(updated)
	assert.Equal(t, "original", before.Labels["app"], "previously returned snapshot must not see later writes")
}
