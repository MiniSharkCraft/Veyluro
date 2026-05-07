package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders adds hardening headers to every response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-XSS-Protection", "1; mode=block")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
		// Remove server fingerprint
		h.Del("Server")
		h.Del("X-Powered-By")
		next.ServeHTTP(w, r)
	})
}

// MaxBodySize limits request body to prevent large payload attacks.
// auth endpoints: 64KB, general API: 512KB, avatar upload: 25MB file + multipart overhead.
func MaxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip for WebSocket upgrades
			if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
				next.ServeHTTP(w, r)
				return
			}
			limit := maxBytes
			if r.URL.Path == "/api/users/me/avatar" {
				limit = 26 * 1024 * 1024
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}
