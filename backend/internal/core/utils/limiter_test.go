package utils

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestRateLimiter_ExecutesImmediately(t *testing.T) {
	rl := NewRateLimiter(100 * time.Millisecond)

	done := make(chan struct{})
	rl.Execute(func() { close(done) }, "key")

	select {
	case <-done:
	case <-time.After(50 * time.Millisecond):
		t.Fatal("first call should execute immediately")
	}
}

func TestRateLimiter_RateLimits_SecondCall(t *testing.T) {
	rl := NewRateLimiter(200 * time.Millisecond)

	var count int32
	rl.Execute(func() { atomic.AddInt32(&count, 1) }, "key")
	time.Sleep(5 * time.Millisecond) // let first goroutine finish

	// Second call within cooldown should not execute immediately
	secondDone := make(chan struct{})
	rl.Execute(func() {
		atomic.AddInt32(&count, 1)
		close(secondDone)
	}, "key")

	// Should not have fired yet
	select {
	case <-secondDone:
		t.Fatal("second call should not execute immediately within cooldown")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestRateLimiter_ExecutesLastCallAfterCooldown(t *testing.T) {
	rl := NewRateLimiter(50 * time.Millisecond)

	first := make(chan struct{})
	rl.Execute(func() { close(first) }, "key")
	<-first

	// Second call: rate-limited, should fire after cooldown
	second := make(chan struct{})
	rl.Execute(func() { close(second) }, "key")

	select {
	case <-second:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("queued call did not fire after cooldown")
	}
}

func TestRateLimiter_MultipleKeys_Independent(t *testing.T) {
	rl := NewRateLimiter(500 * time.Millisecond)

	keyA := make(chan struct{})
	keyB := make(chan struct{})

	rl.Execute(func() { close(keyA) }, "A")
	rl.Execute(func() { close(keyB) }, "B")

	select {
	case <-keyA:
	case <-time.After(50 * time.Millisecond):
		t.Fatal("key A did not execute")
	}

	select {
	case <-keyB:
	case <-time.After(50 * time.Millisecond):
		t.Fatal("key B did not execute independently")
	}

	assert.Equal(t, 2, len(rl.entries))
}
