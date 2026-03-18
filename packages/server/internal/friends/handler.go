package friends

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
	r.Get("/", h.listFriends)
	r.Get("/requests", h.listRequests)
	r.Post("/request", h.sendRequest)
	r.Post("/{id}/accept", h.accept)
	r.Delete("/{id}", h.remove)
	return r
}

type friendResp struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	PublicKey   string `json:"publicKey,omitempty"`
	FriendRowID string `json:"friendId"`
}

// GET /api/friends — list accepted friends
func (h *Handler) listFriends(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT f.id, u.id, u.username, COALESCE(u.public_key,'')
		FROM friends f
		JOIN users u ON u.id = CASE WHEN f.from_id=? THEN f.to_id ELSE f.from_id END
		WHERE (f.from_id=? OR f.to_id=?) AND f.status='accepted'
		ORDER BY u.username
	`, me, me, me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []friendResp
	for rows.Next() {
		var fr friendResp
		rows.Scan(&fr.FriendRowID, &fr.ID, &fr.Username, &fr.PublicKey)
		list = append(list, fr)
	}
	if list == nil {
		list = []friendResp{}
	}
	jsonOK(w, list)
}

type requestResp struct {
	ID        string `json:"id"`
	FromID    string `json:"fromId"`
	Username  string `json:"username"`
	PublicKey string `json:"publicKey,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

// GET /api/friends/requests — incoming pending requests
func (h *Handler) listRequests(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT f.id, f.from_id, u.username, COALESCE(u.public_key,''), f.created_at
		FROM friends f JOIN users u ON u.id=f.from_id
		WHERE f.to_id=? AND f.status='pending'
		ORDER BY f.created_at DESC
	`, me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []requestResp
	for rows.Next() {
		var rr requestResp
		rows.Scan(&rr.ID, &rr.FromID, &rr.Username, &rr.PublicKey, &rr.CreatedAt)
		list = append(list, rr)
	}
	if list == nil {
		list = []requestResp{}
	}
	jsonOK(w, list)
}

// POST /api/friends/request — send friend request { username }
func (h *Handler) sendRequest(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var req struct{ Username string `json:"username"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var toID string
	err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE username=?`, req.Username).Scan(&toID)
	if err != nil {
		jsonError(w, "user không tồn tại", http.StatusNotFound)
		return
	}
	if toID == me {
		jsonError(w, "không thể kết bạn chính mình", http.StatusBadRequest)
		return
	}

	// Check if already exists
	var existingStatus string
	h.db.QueryRowContext(r.Context(), `
		SELECT status FROM friends
		WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
	`, me, toID, toID, me).Scan(&existingStatus)

	if existingStatus == "accepted" {
		jsonError(w, "đã là bạn bè", http.StatusConflict)
		return
	}
	if existingStatus == "pending" {
		jsonError(w, "lời mời đã gửi hoặc đang chờ", http.StatusConflict)
		return
	}

	id := uuid.NewString()
	_, err = h.db.ExecContext(r.Context(),
		`INSERT INTO friends(id,from_id,to_id,status) VALUES(?,?,?,'pending')`, id, me, toID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": id, "status": "pending"})
}

// POST /api/friends/{id}/accept
func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	id := chi.URLParam(r, "id")
	res, err := h.db.ExecContext(r.Context(),
		`UPDATE friends SET status='accepted' WHERE id=? AND to_id=? AND status='pending'`, id, me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "accepted"})
}

// DELETE /api/friends/{id}
func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	id := chi.URLParam(r, "id")
	h.db.ExecContext(r.Context(),
		`DELETE FROM friends WHERE id=? AND (from_id=? OR to_id=?)`, id, me, me)
	jsonOK(w, map[string]string{"status": "removed"})
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
