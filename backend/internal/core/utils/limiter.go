package utils

import (
	"sync"
	"time"

	"github.com/timp4w/phi/internal/core/logging"
)

type RateLimiter struct {
	mu          sync.Mutex
	lastCall    time.Time
	cooldown    time.Duration
	skippedCall func()
}

func NewRateLimiter(cooldown time.Duration) *RateLimiter {
	logger := logging.Logger().WithField("cooldown_ms", cooldown.Milliseconds())
	logger.Debug("Creating new rate limiter")
	return &RateLimiter{
		cooldown: cooldown,
	}
}

func (r *RateLimiter) Execute(f func(), name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	timeSinceLastCall := time.Since(r.lastCall)
	logger := logging.Logger().WithField("time_since_last_call_ms", timeSinceLastCall.Milliseconds()).WithField("name", name)

	if timeSinceLastCall >= r.cooldown {
		logger.Debug("Executing immediately")
		r.lastCall = time.Now()
		f()
	} else {
		logger.Debug("Rate limited, scheduling for later execution")
		r.skippedCall = f
		go r.callSkippedAfterCooldown(name)
	}
}

func (r *RateLimiter) callSkippedAfterCooldown(name string) {
	waitTime := r.cooldown - time.Since(r.lastCall)
	logging.Logger().WithField("wait_time_ms", waitTime.Milliseconds()).WithField("name", name).Debug("Waiting before executing skipped call")

	time.Sleep(waitTime)

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.skippedCall != nil {
		logging.Logger().WithField("name", name).Debug("Executing previously skipped call")
		r.lastCall = time.Now()
		r.skippedCall()
		r.skippedCall = nil
	} else {
		logging.Logger().WithField("name", name).Debug("No skipped call to execute")
	}
}
