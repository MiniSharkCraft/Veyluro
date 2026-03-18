package pending

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"amoon-eclipse/server/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ db *sql.DB }

func NewHandler(db *sql.DB) *Handler { return &Handler{db: db} }

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Post("/send/{toUserId}", h.send)
	r.Delete("/{id}", h.dismiss)
	r.Post("/{id}/accept", h.accept)
	return r
}

type pendingMsg struct {
	ID          string `json:"id"`
	FromUserID  string `json:"fromUserId"`
	FromUsername string `json:"fromUsername"`
	Bundle      string `json:"bundle"`
	CreatedAt   int64  `json:"createdAt"`
}

// GET /api/pending — list pending messages for me
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT p.id, p.from_user_id, u.username, p.bundle, p.created_at
		FROM pending_messages p
		JOIN users u ON u.id = p.from_user_id
		WHERE p.to_user_id=?
		ORDER BY p.created_at DESC
		LIMIT 100
	`, me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []pendingMsg
	for rows.Next() {
		var m pendingMsg
		rows.Scan(&m.ID, &m.FromUserID, &m.FromUsername, &m.Bundle, &m.CreatedAt)
		list = append(list, m)
	}
	if list == nil {
		list = []pendingMsg{}
	}
	jsonOK(w, list)
}

// POST /api/pending/send/{toUserId} — send pending message to non-friend
func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	toUserID := chi.URLParam(r, "toUserId")

	var req struct {
		Bundle string `json:"bundle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Bundle == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Check if already friends → no need for pending
	var friendStatus string
	h.db.QueryRowContext(r.Context(), `
		SELECT status FROM friends
		WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
	`, me, toUserID, toUserID, me).Scan(&friendStatus)
	if friendStatus == "accepted" {
		jsonError(w, "đã là bạn bè, dùng DM bình thường", http.StatusConflict)
		return
	}

	// Limit: max 3 pending messages per sender to same receiver
	var count int
	h.db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM pending_messages WHERE from_user_id=? AND to_user_id=?`,
		me, toUserID,
	).Scan(&count)
	if count >= 3 {
		jsonError(w, "đã gửi quá nhiều tin nhắn chờ", http.StatusTooManyRequests)
		return
	}

	id := uuid.NewString()
	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO pending_messages(id,from_user_id,to_user_id,bundle) VALUES(?,?,?,?)`,
		id, me, toUserID, req.Bundle,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"id": id, "status": "sent"})
}

// POST /api/pending/{id}/accept — accept message (add friend + open DM)
func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	id := chi.URLParam(r, "id")

	var fromUserID string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT from_user_id FROM pending_messages WHERE id=? AND to_user_id=?`,
		id, me,
	).Scan(&fromUserID)
	if err == sql.ErrNoRows {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	// Auto-create friend request accepted
	existingFriendID := uuid.NewString()
	h.db.ExecContext(r.Context(),
		`INSERT IGNORE INTO friends(id,from_id,to_id,status) VALUES(?,?,?,'accepted')`,
		existingFriendID, fromUserID, me,
	)
	h.db.ExecContext(r.Context(),
		`UPDATE friends SET status='accepted' WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)`,
		fromUserID, me, me, fromUserID,
	)

	// Delete all pending from this sender
	h.db.ExecContext(r.Context(),
		`DELETE FROM pending_messages WHERE from_user_id=? AND to_user_id=?`,
		fromUserID, me,
	)

	jsonOK(w, map[string]string{"status": "accepted", "fromUserId": fromUserID})
}

// DELETE /api/pending/{id} — dismiss/ignore pending message
func (h *Handler) dismiss(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	id := chi.URLParam(r, "id")
	h.db.ExecContext(r.Context(),
		`DELETE FROM pending_messages WHERE id=? AND to_user_id=?`, id, me,
	)
	jsonOK(w, map[string]string{"status": "dismissed"})
}

// CountPending returns number of pending messages for a user
func CountPending(db *sql.DB, userID string) int {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM pending_messages WHERE to_user_id=?`, userID).Scan(&count)
	return count
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
