package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"amoon-eclipse/server/internal/auth"
)

func Auth(db *sql.DB, jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			tokenStr := ""

			if strings.HasPrefix(header, "Bearer ") {
				tokenStr = strings.TrimPrefix(header, "Bearer ")
			} else if t := r.URL.Query().Get("token"); t != "" {
				// WebSocket upgrade không dùng được header → dùng query param
				tokenStr = t
			}

			if tokenStr == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "missing token"})
				return
			}

			claims, err := auth.VerifyJWT(tokenStr, jwtSecret)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid token"})
				return
			}
			currentVersion, err := auth.CurrentTokenVersion(r.Context(), db, claims.UserID)
			if err != nil || currentVersion != claims.TokenVersion {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "token revoked"})
				return
			}

			ctx := context.WithValue(r.Context(), auth.ContextKeyUserID, claims.UserID)
			ctx = context.WithValue(ctx, auth.ContextKeyUsername, claims.Username)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
