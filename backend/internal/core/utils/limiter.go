package utils

import (
	"sync"
	"time"
)

type RateLimiter struct {
	mu          sync.Mutex
	lastCall    time.Time
	cooldown    time.Duration
	skippedCall func()
}

func NewRateLimiter(cooldown time.Duration) *RateLimiter {
	return &RateLimiter{
		cooldown: cooldown,
	}
}

func (r *RateLimiter) Execute(f func()) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if time.Since(r.lastCall) >= r.cooldown {
		r.lastCall = time.Now()
		f()
	} else {
		r.skippedCall = f
		go r.callSkippedAfterCooldown()
	}
}

func (r *RateLimiter) callSkippedAfterCooldown() {
	time.Sleep(r.cooldown - time.Since(r.lastCall))
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.skippedCall != nil {
		r.lastCall = time.Now()
		r.skippedCall()
		r.skippedCall = nil
	}
}
