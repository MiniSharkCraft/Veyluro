package messages

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"amoon-eclipse/server/internal/auth"
	"amoon-eclipse/server/internal/moderation"
	"amoon-eclipse/server/internal/r2"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Hub interface để tránh circular import
type Hub interface {
	BroadcastToRoom(roomID string, data []byte)
	BroadcastToRoomMemberGlobals(roomID string, data []byte)
}

type Handler struct {
	db  *sql.DB
	hub Hub
	r2  *r2.Client
}

const maxImageAttachmentBytes = 50 * 1024 * 1024

func NewHandler(db *sql.DB, hub Hub, r2Client *r2.Client) *Handler {
	return &Handler{db: db, hub: hub, r2: r2Client}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/{roomId}/attachments", h.uploadAttachment)
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

type attachmentResp struct {
	Kind     string `json:"kind"`
	URL      string `json:"url"`
	ThumbURL string `json:"thumbUrl,omitempty"`
	Key      string `json:"key"`
	Mime     string `json:"mime"`
	Size     int64  `json:"size"`
	Name     string `json:"name,omitempty"`
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

		roomEvent, _ := json.Marshal(map[string]any{
			"type":      "room-updated",
			"roomId":    roomID,
			"senderId":  userID,
			"createdAt": now,
		})
		go h.hub.BroadcastToRoomMemberGlobals(roomID, roomEvent)
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

// POST /api/messages/{roomId}/attachments — multipart field "image" hoặc "file", max 50MB.
func (h *Handler) uploadAttachment(w http.ResponseWriter, r *http.Request) {
	if h.r2 == nil {
		jsonError(w, "R2 chưa cấu hình", http.StatusServiceUnavailable)
		return
	}
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")
	if !isMember(h.db, r, roomID, userID) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if banned, until := moderation.CheckBanned(h.db, userID); banned {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]any{
			"error":       "bạn đang bị hạn chế chat",
			"bannedUntil": until,
		})
		return
	}

	log.Printf("[attachment] upload start user=%s room=%s contentLength=%d contentType=%q", userID, roomID, r.ContentLength, r.Header.Get("Content-Type"))
	if err := r.ParseMultipartForm(maxImageAttachmentBytes + 1024*1024); err != nil {
		log.Printf("[attachment] multipart parse failed user=%s room=%s err=%v", userID, roomID, err)
		jsonError(w, "ảnh quá lớn hoặc multipart không hợp lệ", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		file, header, err = r.FormFile("file")
	}
	if err != nil {
		jsonError(w, "thiếu file ảnh", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > maxImageAttachmentBytes {
		jsonError(w, "ảnh tối đa 50MB", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxImageAttachmentBytes+1))
	if err != nil {
		jsonError(w, "không đọc được file", http.StatusBadRequest)
		return
	}
	if len(data) == 0 {
		jsonError(w, "file rỗng", http.StatusBadRequest)
		return
	}
	if len(data) > maxImageAttachmentBytes {
		jsonError(w, "ảnh tối đa 50MB", http.StatusRequestEntityTooLarge)
		return
	}
	allowed, usage, limit, quotaErr := h.r2.CanUpload(r.Context(), int64(len(data)))
	if quotaErr != nil {
		log.Printf("[attachment] quota check failed user=%s room=%s err=%v", userID, roomID, quotaErr)
		jsonError(w, "quota check failed", http.StatusServiceUnavailable)
		return
	}
	if !allowed {
		log.Printf("[attachment] blocked by quota user=%s room=%s size=%d usage=%d limit=%d", userID, roomID, len(data), usage, limit)
		jsonError(w, "bucket gần đầy, tạm khóa upload", http.StatusInsufficientStorage)
		return
	}
	contentType, ext, ok := detectImageAttachmentType(data, header.Header.Get("Content-Type"), header.Filename)
	if !ok {
		jsonError(w, "chỉ hỗ trợ JPEG, PNG, WebP hoặc GIF", http.StatusBadRequest)
		return
	}

	key := fmt.Sprintf("attachments/%s/%s/%s%s", roomID, userID, uuid.NewString(), ext)
	url, err := h.r2.PutObject(r.Context(), key, contentType, data)
	if err != nil {
		log.Printf("[attachment] R2 upload failed user=%s room=%s key=%s type=%s size=%d err=%v", userID, roomID, key, contentType, len(data), err)
		jsonError(w, "upload R2 thất bại", http.StatusBadGateway)
		return
	}
	log.Printf("[attachment] upload ok user=%s room=%s key=%s type=%s size=%d", userID, roomID, key, contentType, len(data))
	jsonOK(w, attachmentResp{
		Kind:     "image",
		URL:      url,
		ThumbURL: h.r2.TransformURL(key, 720, 720),
		Key:      key,
		Mime:     contentType,
		Size:     int64(len(data)),
		Name:     header.Filename,
	})
}

func detectImageAttachmentType(data []byte, declaredType, filename string) (contentType string, ext string, ok bool) {
	detected := http.DetectContentType(data)
	switch detected {
	case "image/jpeg":
		return detected, ".jpg", true
	case "image/png":
		return detected, ".png", true
	case "image/gif":
		return detected, ".gif", true
	}
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp", ".webp", true
	}
	declaredType = strings.ToLower(strings.TrimSpace(strings.Split(declaredType, ";")[0]))
	lowerName := strings.ToLower(filename)
	if declaredType == "image/heic" || declaredType == "image/heif" || strings.HasSuffix(lowerName, ".heic") || strings.HasSuffix(lowerName, ".heif") {
		if declaredType == "" {
			declaredType = "image/heic"
		}
		return declaredType, ".heic", true
	}
	return "", "", false
}

func isMember(db *sql.DB, r *http.Request, roomID, userID string) bool {
	var cnt int
	db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM room_members WHERE room_id=? AND user_id=?`, roomID, userID,
	).Scan(&cnt)
	if cnt > 0 {
		return true
	}
	recovered, err := recoverDMMembership(db, r, roomID, userID)
	if err != nil {
		log.Printf("[room_members] recover failed room=%s user=%s err=%v", roomID, userID, err)
		return false
	}
	return recovered
}

func recoverDMMembership(db *sql.DB, r *http.Request, roomID, userID string) (bool, error) {
	var roomType, roomName string
	if err := db.QueryRowContext(r.Context(),
		`SELECT type, name FROM rooms WHERE id=? LIMIT 1`, roomID,
	).Scan(&roomType, &roomName); err != nil {
		return false, err
	}
	if roomType != "dm" {
		return false, nil
	}

	var username string
	if err := db.QueryRowContext(r.Context(), `SELECT username FROM users WHERE id=? LIMIT 1`, userID).Scan(&username); err != nil {
		return false, err
	}

	canRecover := false
	for _, part := range strings.Split(roomName, ",") {
		if strings.TrimSpace(part) == username {
			canRecover = true
			break
		}
	}
	if !canRecover {
		var sentCount int
		if err := db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM messages WHERE room_id=? AND sender_id=? LIMIT 1`, roomID, userID,
		).Scan(&sentCount); err != nil {
			return false, err
		}
		canRecover = sentCount > 0
	}
	if !canRecover {
		return false, nil
	}

	if _, err := db.ExecContext(r.Context(),
		`INSERT IGNORE INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, userID,
	); err != nil {
		return false, err
	}

	log.Printf("[room_members] recovered dm membership room=%s user=%s", roomID, userID)
	return true, nil
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
