package utils

import (
	"sync"
	"time"

	"github.com/timp4w/phi/internal/core/logging"
)

type rateLimitEntry struct {
	lastCall time.Time
	timer    *time.Timer
	lastFunc func()
}

type RateLimiter struct {
	mu       sync.Mutex
	cooldown time.Duration
	entries  map[string]*rateLimitEntry
}

func NewRateLimiter(cooldown time.Duration) *RateLimiter {
	logger := logging.Logger().WithField("cooldown_ms", cooldown.Milliseconds())
	logger.Debug("Creating new rate limiter")
	return &RateLimiter{
		cooldown: cooldown,
		entries:  make(map[string]*rateLimitEntry),
	}
}

func (r *RateLimiter) Execute(f func(), name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry, exists := r.entries[name]
	now := time.Now()
	if !exists {
		entry = &rateLimitEntry{}
		r.entries[name] = entry
	}

	timeSinceLastCall := now.Sub(entry.lastCall)
	logger := logging.Logger().WithField("time_since_last_call_ms", timeSinceLastCall.Milliseconds()).WithField("name", name)

	if timeSinceLastCall >= r.cooldown {
		logger.Debug("Executing immediately")
		entry.lastCall = now
		go f()
		if entry.timer != nil {
			entry.timer.Stop()
			entry.timer = nil
		}
		entry.lastFunc = nil
	} else {
		logger.Debug("Rate limited, will send last message after cooldown")
		entry.lastFunc = f
		if entry.timer == nil {
			waitTime := r.cooldown - timeSinceLastCall
			entry.timer = time.AfterFunc(waitTime, func() {
				r.mu.Lock()
				defer r.mu.Unlock()
				e := r.entries[name]
				if e != nil && e.lastFunc != nil {
					logging.Logger().WithField("name", name).Debug("Executing last queued call")
					e.lastCall = time.Now()
					go e.lastFunc()
					e.lastFunc = nil
					e.timer = nil
				}
			})
		}
	}
}
