package notes

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"amoon-eclipse/server/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	r.Post("/", h.create)
	r.Delete("/{noteId}", h.delete)
	return r
}

type noteResp struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Content   string `json:"content"`
	ExpiresAt int64  `json:"expiresAt"`
	CreatedAt int64  `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	now := time.Now().Unix()

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, user_id, content, expires_at, created_at
		FROM notes
		WHERE expires_at > ?
		ORDER BY created_at DESC
		LIMIT 50
	`, now)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var notes []noteResp
	for rows.Next() {
		var n noteResp
		rows.Scan(&n.ID, &n.UserID, &n.Content, &n.ExpiresAt, &n.CreatedAt)
		notes = append(notes, n)
	}
	if notes == nil {
		notes = []noteResp{}
	}
	jsonOK(w, notes)
}

type createReq struct {
	Content string `json:"content"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)

	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if len(req.Content) > 500 {
		jsonError(w, "content quá dài (max 500 ký tự)", http.StatusBadRequest)
		return
	}

	// Xóa note cũ của user (mỗi user chỉ có 1 note active)
	h.db.ExecContext(r.Context(), `DELETE FROM notes WHERE user_id=?`, userID)

	id := uuid.NewString()
	expiresAt := time.Now().Add(24 * time.Hour).Unix()

	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO notes(id,user_id,content,expires_at) VALUES(?,?,?,?)`,
		id, userID, req.Content, expiresAt,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]any{
		"id":        id,
		"expiresAt": expiresAt,
	})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	noteID := chi.URLParam(r, "noteId")

	res, err := h.db.ExecContext(r.Context(),
		`DELETE FROM notes WHERE id=? AND user_id=?`, noteID, userID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"status": "deleted"})
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

// CleanupExpired xóa notes hết hạn (chạy bằng ticker ở main)
func CleanupExpired(db *sql.DB) {
	db.Exec(`DELETE FROM notes WHERE expires_at <= ?`, time.Now().Unix())
}
