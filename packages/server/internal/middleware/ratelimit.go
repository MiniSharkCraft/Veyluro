package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"amoon-eclipse/server/internal/redisx"
)

// bucket tracks requests per IP in a sliding window.
type bucket struct {
	count       int
	windowStart time.Time
	mu          sync.Mutex
}

type rateLimiter struct {
	buckets sync.Map
	limit   int           // max requests per window
	window  time.Duration // window size
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{limit: limit, window: window}
	// Cleanup old buckets every minute
	go func() {
		ticker := time.NewTicker(time.Minute)
		for range ticker.C {
			now := time.Now()
			rl.buckets.Range(func(k, v any) bool {
				b := v.(*bucket)
				b.mu.Lock()
				if now.Sub(b.windowStart) > window*2 {
					rl.buckets.Delete(k)
				}
				b.mu.Unlock()
				return true
			})
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	now := time.Now()
	val, _ := rl.buckets.LoadOrStore(ip, &bucket{windowStart: now})
	b := val.(*bucket)
	b.mu.Lock()
	defer b.mu.Unlock()
	if now.Sub(b.windowStart) > rl.window {
		b.count = 0
		b.windowStart = now
	}
	b.count++
	return b.count <= rl.limit
}

// Singletons for different rate limit tiers
var (
	authLimiter = newRateLimiter(20, time.Minute)  // 20 req/min for auth endpoints
	apiLimiter  = newRateLimiter(300, time.Minute) // 300 req/min for API
	wsLimiter   = newRateLimiter(10, time.Minute)  // 10 ws connects/min per IP
	redisClient *redisx.Client
	redisPrefix = "amoon"
)

func SetupRedisRateLimit(c *redisx.Client, prefix string) {
	redisClient = c
	if prefix != "" {
		redisPrefix = prefix
	}
}

func allowWithRedisOrMemory(r *http.Request, kind string, limit int, window time.Duration, fallback *rateLimiter) bool {
	ip := r.RemoteAddr
	if redisClient == nil {
		return fallback.allow(ip)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 800*time.Millisecond)
	defer cancel()
	key := redisPrefix + ":rl:" + kind + ":" + ip
	n, err := redisClient.IncrWithWindow(ctx, key, window)
	if err != nil {
		return fallback.allow(ip)
	}
	return n <= int64(limit)
}

// RateLimitAuth limits auth endpoints (login/register) — prevent brute force.
func RateLimitAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowWithRedisOrMemory(r, "auth", 20, time.Minute, authLimiter) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{"error": "too many requests, slow down"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RateLimitAPI limits general API endpoints.
func RateLimitAPI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowWithRedisOrMemory(r, "api", 300, time.Minute, apiLimiter) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{"error": "rate limit exceeded"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RateLimitWS limits WebSocket connection attempts.
func RateLimitWS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowWithRedisOrMemory(r, "ws", 10, time.Minute, wsLimiter) {
			http.Error(w, "too many connection attempts", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
