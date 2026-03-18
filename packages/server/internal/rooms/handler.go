package rooms

import (
	"database/sql"
	"encoding/json"
	"net/http"

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
	r.Post("/dm", h.startDm)
	r.Post("/group", h.createGroup)
	r.Get("/{roomId}/members", h.members)
	r.Post("/{roomId}/members", h.addMember)
	r.Delete("/{roomId}/members/{userId}", h.removeMember)
	r.Post("/{roomId}/leave", h.leaveGroup)
	return r
}

type roomResp struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	GroupAdminID  string `json:"groupAdminId,omitempty"`
	MemberCount   int    `json:"memberCount"`
	CreatedAt     int64  `json:"createdAt"`
	LastMessageAt int64  `json:"lastMessageAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(auth.ContextKeyUserID).(string)

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.name, r.type, COALESCE(r.group_admin_id,''),
		       (SELECT COUNT(*) FROM room_members rm2 WHERE rm2.room_id = r.id),
		       r.created_at,
		       COALESCE((SELECT MAX(created_at) FROM messages WHERE room_id = r.id), 0) AS last_message_at
		FROM rooms r
		JOIN room_members rm ON rm.room_id = r.id
		WHERE rm.user_id = ?
		ORDER BY last_message_at DESC, r.created_at DESC
	`, userID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []roomResp
	for rows.Next() {
		var ro roomResp
		rows.Scan(&ro.ID, &ro.Name, &ro.Type, &ro.GroupAdminID, &ro.MemberCount, &ro.CreatedAt, &ro.LastMessageAt)
		rooms = append(rooms, ro)
	}
	if rooms == nil {
		rooms = []roomResp{}
	}
	jsonOK(w, rooms)
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
		SELECT u.id, u.username, COALESCE(u.public_key,''), COALESCE(u.fingerprint,'')
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
		rows.Scan(&m.ID, &m.Username, &m.PublicKey, &m.Fingerprint)
		members = append(members, m)
	}
	if members == nil {
		members = []memberResp{}
	}
	jsonOK(w, members)
}

type addMemberReq struct {
	Username string `json:"username"`
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var memberID string
	if err := h.db.QueryRowContext(r.Context(), `SELECT id FROM users WHERE username=?`, req.Username).Scan(&memberID); err != nil {
		jsonError(w, "user không tồn tại", http.StatusNotFound)
		return
	}

	h.db.ExecContext(r.Context(), `INSERT IGNORE INTO room_members(room_id,user_id) VALUES(?,?)`, roomID, memberID)
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

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
