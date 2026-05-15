package rooms

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"amoon-eclipse/server/internal/auth"
	"amoon-eclipse/server/internal/r2"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct {
	db *sql.DB
	r2 *r2.Client
}

const maxGroupAvatarBytes = 25 * 1024 * 1024

func NewHandler(db *sql.DB, r2Client *r2.Client) *Handler {
	return &Handler{db: db, r2: r2Client}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Post("/dm", h.startDm)
	r.Post("/group", h.createGroup)
	r.Get("/{roomId}/members", h.members)
	r.Post("/{roomId}/members", h.addMember)
	r.Delete("/{roomId}/members/{userId}", h.removeMember)
	r.Post("/{roomId}/leave", h.leaveGroup)
	r.Delete("/{roomId}", h.deleteGroup)
	r.Post("/{roomId}/avatar", h.uploadGroupAvatar)
	r.Delete("/{roomId}/avatar", h.deleteGroupAvatar)
	return r
}

type roomResp struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	GroupAdminID  string `json:"groupAdminId,omitempty"`
	AvatarURL     string `json:"avatarUrl,omitempty"`
	AvatarThumb   string `json:"avatarThumbUrl,omitempty"`
	MemberCount   int    `json:"memberCount"`
	CreatedAt     int64  `json:"createdAt"`
	LastMessageAt int64  `json:"lastMessageAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	meUsername := ""
	_ = h.db.QueryRowContext(r.Context(), `SELECT COALESCE(username,'') FROM users WHERE id=?`, userID).Scan(&meUsername)
	if err := h.recoverMissingDMMemberships(r, userID); err != nil {
		log.Printf("[room_members] list recover scan failed user=%s err=%v", userID, err)
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.name, r.type, COALESCE(r.group_admin_id,''),
		       COALESCE(
		         CASE WHEN r.type='dm' THEN (
		           SELECT COALESCE(u.avatar_url,'')
		           FROM room_members rm3
		           JOIN users u ON u.id = rm3.user_id
		           WHERE rm3.room_id = r.id AND rm3.user_id <> ?
		           LIMIT 1
		         ) ELSE r.avatar_url END, ''
		       ) AS avatar_url,
		       COALESCE(
		         CASE WHEN r.type='dm' THEN (
		           SELECT COALESCE(u.avatar_key,'')
		           FROM room_members rm3
		           JOIN users u ON u.id = rm3.user_id
		           WHERE rm3.room_id = r.id AND rm3.user_id <> ?
		           LIMIT 1
		         ) ELSE r.avatar_key END, ''
		       ) AS avatar_key,
		       (SELECT COUNT(*) FROM room_members rm2 WHERE rm2.room_id = r.id),
		       r.created_at,
		       COALESCE((SELECT MAX(created_at) FROM messages WHERE room_id = r.id), 0) AS last_message_at
		FROM rooms r
		JOIN room_members rm ON rm.room_id = r.id
		WHERE rm.user_id = ?
		ORDER BY last_message_at DESC, r.created_at DESC
	`, userID, userID, userID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []roomResp
	for rows.Next() {
		var ro roomResp
		var avatarKey string
		rows.Scan(&ro.ID, &ro.Name, &ro.Type, &ro.GroupAdminID, &ro.AvatarURL, &avatarKey, &ro.MemberCount, &ro.CreatedAt, &ro.LastMessageAt)
		// Fallback for legacy/broken memberships: resolve DM avatar from room name.
		if ro.Type == "dm" && strings.TrimSpace(ro.AvatarURL) == "" {
			for _, part := range strings.Split(ro.Name, ",") {
				u := strings.TrimSpace(part)
				if u == "" || strings.EqualFold(u, meUsername) {
					continue
				}
				if err := h.db.QueryRowContext(
					r.Context(),
					`SELECT COALESCE(avatar_url,''), COALESCE(avatar_key,'') FROM users WHERE username=? LIMIT 1`,
					u,
				).Scan(&ro.AvatarURL, &avatarKey); err == nil && strings.TrimSpace(ro.AvatarURL) != "" {
					break
				}
			}
		}
		ro.AvatarThumb = h.avatarThumbURL(avatarKey, ro.AvatarURL)
		rooms = append(rooms, ro)
	}
	if rooms == nil {
		rooms = []roomResp{}
	}
	jsonOK(w, rooms)
}

func (h *Handler) recoverMissingDMMemberships(r *http.Request, userID string) error {
	var username string
	if err := h.db.QueryRowContext(r.Context(), `SELECT username FROM users WHERE id=? LIMIT 1`, userID).Scan(&username); err != nil {
		return err
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name
		FROM rooms
		WHERE type='dm'
		  AND id NOT IN (SELECT room_id FROM room_members WHERE user_id=?)
	`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var roomID, roomName string
		if err := rows.Scan(&roomID, &roomName); err != nil {
			continue
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
			if err := h.db.QueryRowContext(r.Context(),
				`SELECT COUNT(*) FROM messages WHERE room_id=? AND sender_id=? LIMIT 1`, roomID, userID,
			).Scan(&sentCount); err == nil && sentCount > 0 {
				canRecover = true
			}
		}
		if !canRecover {
			continue
		}

		if _, err := h.db.ExecContext(r.Context(),
			`INSERT IGNORE INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, userID,
		); err == nil {
			log.Printf("[room_members] recovered dm membership room=%s user=%s", roomID, userID)
		}
	}
	return rows.Err()
}

type dmReq struct {
	Username string `json:"username"`
}

func (h *Handler) startDm(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)

	var req dmReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Check if blocked by or blocking target
	var blockCnt int
	h.db.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM user_blocks ub
		JOIN users u ON u.username = ?
		WHERE (ub.blocker_id = ? AND ub.blocked_id = u.id)
		   OR (ub.blocker_id = u.id AND ub.blocked_id = ?)
	`, req.Username, userID, userID).Scan(&blockCnt)
	if blockCnt > 0 {
		jsonError(w, "không thể nhắn tin với người này", http.StatusForbidden)
		return
	}

	// Tìm target user
	var targetID, targetUsername string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, username FROM users WHERE username=?`, req.Username,
	).Scan(&targetID, &targetUsername)
	if err != nil {
		jsonError(w, "user không tồn tại", http.StatusNotFound)
		return
	}
	if targetID == userID {
		jsonError(w, "không thể DM chính mình", http.StatusBadRequest)
		return
	}

	// Kiểm tra DM đã tồn tại chưa
	var existingID string
	h.db.QueryRowContext(r.Context(), `
		SELECT r.id FROM rooms r
		JOIN room_members rm1 ON rm1.room_id = r.id AND rm1.user_id = ?
		JOIN room_members rm2 ON rm2.room_id = r.id AND rm2.user_id = ?
		WHERE r.type = 'dm'
		LIMIT 1
	`, userID, targetID).Scan(&existingID)

	if existingID != "" {
		jsonOK(w, map[string]string{"id": existingID, "status": "exists"})
		return
	}

	// Tạo room mới
	myUsername := r.Context().Value(auth.ContextKeyUsername).(string)
	roomName := myUsername + "," + targetUsername
	roomID := uuid.NewString()

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	tx.ExecContext(r.Context(), `INSERT INTO rooms(id,name,type) VALUES(?,?,'dm')`, roomID, roomName)
	tx.ExecContext(r.Context(), `INSERT INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, userID)
	tx.ExecContext(r.Context(), `INSERT INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, targetID)

	if err := tx.Commit(); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": roomID, "status": "created"})
}

type groupReq struct {
	Name    string   `json:"name"`
	Members []string `json:"members"` // usernames (không kể bản thân)
}

func (h *Handler) createGroup(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)

	var req groupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if len(req.Members) == 0 || len(req.Members) > 3 {
		jsonError(w, "nhóm cần 2-4 người (thêm 1-3 thành viên khác)", http.StatusBadRequest)
		return
	}

	roomID := uuid.NewString()

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	tx.ExecContext(r.Context(),
		`INSERT INTO rooms(id,name,type,group_admin_id) VALUES(?,?,'group',?)`,
		roomID, req.Name, userID)
	tx.ExecContext(r.Context(), `INSERT INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, userID)

	for _, username := range req.Members {
		var memberID string
		if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE username=?`, username).Scan(&memberID); err != nil {
			continue
		}
		if memberID == userID {
			continue
		}
		tx.ExecContext(r.Context(), `INSERT IGNORE INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, memberID)
	}

	if err := tx.Commit(); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": roomID, "status": "created"})
}

type memberResp struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
	AvatarThumb string `json:"avatarThumbUrl,omitempty"`
	PublicKey   string `json:"publicKey,omitempty"`
	Fingerprint string `json:"fingerprint,omitempty"`
}

func (h *Handler) members(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	var cnt int
	h.db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM room_members WHERE room_id=? AND user_id=?`, roomID, userID,
	).Scan(&cnt)
	if cnt == 0 {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT u.id, u.username, COALESCE(u.avatar_url,''), COALESCE(u.avatar_key,''), COALESCE(u.public_key,''), COALESCE(u.fingerprint,'')
		FROM users u
		JOIN room_members rm ON rm.user_id = u.id
		WHERE rm.room_id = ?
	`, roomID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var members []memberResp
	for rows.Next() {
		var m memberResp
		var avatarKey string
		rows.Scan(&m.ID, &m.Username, &m.AvatarURL, &avatarKey, &m.PublicKey, &m.Fingerprint)
		m.AvatarThumb = h.avatarThumbURL(avatarKey, m.AvatarURL)
		members = append(members, m)
	}
	if members == nil {
		members = []memberResp{}
	}
	jsonOK(w, members)
}

type addMemberReq struct {
	Username string `json:"username"`
	UserID   string `json:"userId"`
}

func (h *Handler) addMember(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	// Only group admin can add
	var adminID string
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(group_admin_id,'') FROM rooms WHERE id=? AND type='group'`, roomID,
	).Scan(&adminID)
	if adminID != userID {
		jsonError(w, "chỉ admin nhóm mới có thể thêm thành viên", http.StatusForbidden)
		return
	}

	var cnt int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM room_members WHERE room_id=?`, roomID).Scan(&cnt)
	if cnt >= 4 {
		jsonError(w, "nhóm đã đạt tối đa 4 người", http.StatusBadRequest)
		return
	}

	var req addMemberReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.UserID = strings.TrimSpace(req.UserID)
	if req.Username == "" && req.UserID == "" {
		jsonError(w, "thiếu username hoặc userId", http.StatusBadRequest)
		return
	}

	var memberID string
	if req.UserID != "" {
		if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE id=?`, req.UserID).Scan(&memberID); err != nil {
			jsonError(w, "user không tồn tại", http.StatusNotFound)
			return
		}
	} else {
		if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE username=?`, req.Username).Scan(&memberID); err != nil {
			jsonError(w, "user không tồn tại", http.StatusNotFound)
			return
		}
	}
	if memberID == userID {
		jsonError(w, "không thể tự thêm chính mình", http.StatusBadRequest)
		return
	}

	if _, err := h.db.ExecContext(r.Context(), `INSERT IGNORE INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, memberID); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "added"})
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")
	targetID := chi.URLParam(r, "userId")

	var adminID string
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(group_admin_id,'') FROM rooms WHERE id=? AND type='group'`, roomID,
	).Scan(&adminID)

	// Only admin can remove others; users can only remove themselves via leave
	if adminID != userID && targetID != userID {
		jsonError(w, "không có quyền", http.StatusForbidden)
		return
	}
	if adminID == targetID && adminID == userID {
		jsonError(w, "admin hãy dùng /leave để rời nhóm", http.StatusBadRequest)
		return
	}

	h.db.ExecContext(r.Context(), `DELETE FROM room_members WHERE room_id=? AND user_id=?`, roomID, targetID)
	jsonOK(w, map[string]string{"status": "removed"})
}

func (h *Handler) leaveGroup(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	var adminID string
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(group_admin_id,'') FROM rooms WHERE id=?`, roomID,
	).Scan(&adminID)

	h.db.ExecContext(r.Context(), `DELETE FROM room_members WHERE room_id=? AND user_id=?`, roomID, userID)

	// Check if room is now empty
	var cnt int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM room_members WHERE room_id=?`, roomID).Scan(&cnt)
	if cnt == 0 {
		h.db.ExecContext(r.Context(), `DELETE FROM rooms WHERE id=?`, roomID)
	} else if adminID == userID {
		// Transfer admin to first remaining member
		var newAdminID string
		h.db.QueryRowContext(r.Context(), `SELECT user_id FROM room_members WHERE room_id=? LIMIT 1`, roomID).Scan(&newAdminID)
		if newAdminID != "" {
			h.db.ExecContext(r.Context(), `UPDATE rooms SET group_admin_id=? WHERE id=?`, newAdminID, roomID)
		}
	}
	jsonOK(w, map[string]string{"status": "left"})
}

func (h *Handler) deleteGroup(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	var roomType, adminID, avatarKey string
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT type, COALESCE(group_admin_id,''), COALESCE(avatar_key,'') FROM rooms WHERE id=?`, roomID,
	).Scan(&roomType, &adminID, &avatarKey); err != nil {
		jsonError(w, "room không tồn tại", http.StatusNotFound)
		return
	}
	if roomType != "group" {
		jsonError(w, "chỉ nhóm mới được xóa", http.StatusBadRequest)
		return
	}
	if adminID != userID {
		jsonError(w, "chỉ admin nhóm mới được xóa nhóm", http.StatusForbidden)
		return
	}

	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM rooms WHERE id=?`, roomID); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if h.r2 != nil && avatarKey != "" {
		go h.r2.DeleteObject(context.Background(), avatarKey)
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func (h *Handler) uploadGroupAvatar(w http.ResponseWriter, r *http.Request) {
	if h.r2 == nil {
		jsonError(w, "R2 chưa cấu hình", http.StatusServiceUnavailable)
		return
	}
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	var roomType, adminID, oldKey string
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT type, COALESCE(group_admin_id,''), COALESCE(avatar_key,'') FROM rooms WHERE id=?`, roomID,
	).Scan(&roomType, &adminID, &oldKey); err != nil {
		jsonError(w, "room không tồn tại", http.StatusNotFound)
		return
	}
	if roomType != "group" {
		jsonError(w, "chỉ nhóm mới có avatar nhóm", http.StatusBadRequest)
		return
	}
	if adminID != userID {
		jsonError(w, "chỉ admin nhóm mới đổi avatar", http.StatusForbidden)
		return
	}

	if err := r.ParseMultipartForm(maxGroupAvatarBytes + 1024*1024); err != nil {
		jsonError(w, "ảnh quá lớn hoặc multipart không hợp lệ", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		file, header, err = r.FormFile("file")
	}
	if err != nil {
		jsonError(w, "thiếu file avatar", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > maxGroupAvatarBytes {
		jsonError(w, "avatar tối đa 25MB", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxGroupAvatarBytes+1))
	if err != nil {
		jsonError(w, "không đọc được file", http.StatusBadRequest)
		return
	}
	if len(data) == 0 || len(data) > maxGroupAvatarBytes {
		jsonError(w, "avatar tối đa 25MB", http.StatusRequestEntityTooLarge)
		return
	}
	allowed, _, _, quotaErr := h.r2.CanUpload(r.Context(), int64(len(data)))
	if quotaErr != nil {
		jsonError(w, "quota check failed", http.StatusServiceUnavailable)
		return
	}
	if !allowed {
		jsonError(w, "bucket gần đầy, tạm khóa upload", http.StatusInsufficientStorage)
		return
	}

	contentType, ext, ok := detectGroupAvatarType(data)
	if !ok {
		jsonError(w, "chỉ hỗ trợ JPEG, PNG, WebP hoặc GIF", http.StatusBadRequest)
		return
	}

	key := fmt.Sprintf("group-avatars/%s/%s%s", roomID, uuid.NewString(), ext)
	avatarURL, err := h.r2.PutObject(r.Context(), key, contentType, data)
	if err != nil {
		jsonError(w, "upload R2 thất bại", http.StatusBadGateway)
		return
	}
	if _, err := h.db.ExecContext(r.Context(),
		`UPDATE rooms SET avatar_url=?, avatar_key=? WHERE id=?`, avatarURL, key, roomID,
	); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if oldKey != "" && oldKey != key {
		go h.r2.DeleteObject(context.Background(), oldKey)
	}
	jsonOK(w, map[string]string{
		"avatarUrl":      avatarURL,
		"avatarThumbUrl": h.avatarThumbURL(key, avatarURL),
		"avatarKey":      key,
	})
}

func (h *Handler) deleteGroupAvatar(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)
	roomID := chi.URLParam(r, "roomId")

	var roomType, adminID, oldKey string
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT type, COALESCE(group_admin_id,''), COALESCE(avatar_key,'') FROM rooms WHERE id=?`, roomID,
	).Scan(&roomType, &adminID, &oldKey); err != nil {
		jsonError(w, "room không tồn tại", http.StatusNotFound)
		return
	}
	if roomType != "group" {
		jsonError(w, "chỉ nhóm mới có avatar nhóm", http.StatusBadRequest)
		return
	}
	if adminID != userID {
		jsonError(w, "chỉ admin nhóm mới xóa avatar", http.StatusForbidden)
		return
	}
	if _, err := h.db.ExecContext(r.Context(), `UPDATE rooms SET avatar_url=NULL, avatar_key=NULL WHERE id=?`, roomID); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if h.r2 != nil && oldKey != "" {
		go h.r2.DeleteObject(context.Background(), oldKey)
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func detectGroupAvatarType(data []byte) (contentType string, ext string, ok bool) {
	contentType = http.DetectContentType(data)
	switch contentType {
	case "image/jpeg":
		return contentType, ".jpg", true
	case "image/png":
		return contentType, ".png", true
	case "image/gif":
		return contentType, ".gif", true
	}
	if len(data) >= 12 && bytes.Equal(data[0:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")) {
		return "image/webp", ".webp", true
	}
	return "", "", false
}

func (h *Handler) avatarThumbURL(key, fallback string) string {
	if h.r2 == nil || key == "" {
		return fallback
	}
	return h.r2.TransformURL(key, 256, 256)
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
