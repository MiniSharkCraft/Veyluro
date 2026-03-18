package blocks

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"amoon-eclipse/server/internal/auth"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	db *sql.DB
}

func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Post("/{userId}", h.block)
	r.Delete("/{userId}", h.unblock)
	return r
}

type blockedUserResp struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	CreatedAt int64  `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT u.id, u.username, ub.created_at
		FROM user_blocks ub
		JOIN users u ON u.id = ub.blocked_id
		WHERE ub.blocker_id = ?
		ORDER BY ub.created_at DESC
	`, userID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var blocked []blockedUserResp
	for rows.Next() {
		var b blockedUserResp
		rows.Scan(&b.ID, &b.Username, &b.CreatedAt)
		blocked = append(blocked, b)
	}
	if blocked == nil {
		blocked = []blockedUserResp{}
	}
	jsonOK(w, blocked)
}

func (h *Handler) block(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	targetID := chi.URLParam(r, "userId")

	if targetID == userID {
		jsonError(w, "không thể tự chặn mình", http.StatusBadRequest)
		return
	}

	var cnt int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE id=?`, targetID).Scan(&cnt)
	if cnt == 0 {
		jsonError(w, "user không tồn tại", http.StatusNotFound)
		return
	}

	h.db.ExecContext(r.Context(),
		`INSERT IGNORE INTO user_blocks(blocker_id,blocked_id) VALUES(?,?)`, userID, targetID)
	jsonOK(w, map[string]string{"status": "blocked"})
}

func (h *Handler) unblock(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	targetID := chi.URLParam(r, "userId")

	h.db.ExecContext(r.Context(),
		`DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?`, userID, targetID)
	jsonOK(w, map[string]string{"status": "unblocked"})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
