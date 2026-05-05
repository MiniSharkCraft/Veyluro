package messages

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"amoon-eclipse/server/internal/auth"
	"amoon-eclipse/server/internal/moderation"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Hub interface để tránh circular import
type Hub interface {
	BroadcastToRoom(roomID string, data []byte)
}

type Handler struct {
	db  *sql.DB
	hub Hub
}

func NewHandler(db *sql.DB, hub Hub) *Handler {
	return &Handler{db: db, hub: hub}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/{roomId}", h.list)
	r.Post("/{roomId}", h.send)
	return r
}

type msgResp struct {
	ID        string `json:"id"`
	ClientID  string `json:"clientId,omitempty"`
	RoomID    string `json:"roomId"`
	SenderID  string `json:"senderId"`
	Bundle    string `json:"bundle"` // opaque E2EE JSON
	CreatedAt int64  `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	// Auth check
	if !isMember(h.db, r, roomID, userID) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// Pagination: before (created_at) + limit
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	query := `SELECT id, room_id, sender_id, bundle, created_at FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT ?`
	args := []any{roomID, limit}

	if before := r.URL.Query().Get("before"); before != "" {
		if ts, err := strconv.ParseInt(before, 10, 64); err == nil {
			query = `SELECT id, room_id, sender_id, bundle, created_at FROM messages WHERE room_id=? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
			args = []any{roomID, ts, limit}
		}
	}

	rows, err := h.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var msgs []msgResp
	for rows.Next() {
		var m msgResp
		rows.Scan(&m.ID, &m.RoomID, &m.SenderID, &m.Bundle, &m.CreatedAt)
		msgs = append(msgs, m)
	}
	if msgs == nil {
		msgs = []msgResp{}
	}

	// Đảo ngược để gửi theo thứ tự tăng dần
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	jsonOK(w, msgs)
}

type sendReq struct {
	Bundle   string `json:"bundle"`             // MessageBundle JSON từ client
	ClientID string `json:"clientId,omitempty"` // client-generated optimistic ID
}

func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	if !isMember(h.db, r, roomID, userID) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// Check if sender is chat-banned
	if banned, until := moderation.CheckBanned(h.db, userID); banned {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]any{
			"error":       "bạn đang bị hạn chế chat",
			"bannedUntil": until,
		})
		return
	}

	var req sendReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Bundle == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	id := uuid.NewString()
	now := time.Now().Unix()
	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO messages(id,room_id,sender_id,bundle,created_at) VALUES(?,?,?,?,?)`,
		id, roomID, userID, req.Bundle, now,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	// Push realtime via WebSocket to all connected clients in the room
	if h.hub != nil {
		wsMsg, _ := json.Marshal(map[string]any{
			"type":      "message",
			"id":        id,
			"clientId":  req.ClientID,
			"roomId":    roomID,
			"senderId":  userID,
			"bundle":    req.Bundle,
			"createdAt": now,
		})
		go h.hub.BroadcastToRoom(roomID, wsMsg)
	}

	// Track harassment: find the other member in DM room and track
	go func() {
		var otherUserID string
		h.db.QueryRow(`
			SELECT user_id FROM room_members WHERE room_id=? AND user_id!=? LIMIT 1
		`, roomID, userID).Scan(&otherUserID)
		if otherUserID != "" {
			// Reset tracking if other person is also sending (mutual convo)
			var otherLastMsg int64
			h.db.QueryRow(`
				SELECT MAX(created_at) FROM messages
				WHERE room_id=? AND sender_id=? AND created_at > ?
			`, roomID, otherUserID, time.Now().Unix()-3600).Scan(&otherLastMsg)

			if otherLastMsg > 0 {
				moderation.ResetHarassment(h.db, userID, otherUserID)
			} else {
				moderation.TrackHarassment(h.db, userID, otherUserID)
			}
		}
	}()

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": id, "clientId": req.ClientID})
}

func isMember(db *sql.DB, r *http.Request, roomID, userID string) bool {
	var cnt int
	db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM room_members WHERE room_id=? AND user_id=?`, roomID, userID,
	).Scan(&cnt)
	return cnt > 0
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
