package moderation

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"amoon-eclipse/server/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handler struct{ db *sql.DB }

func NewHandler(db *sql.DB) *Handler { return &Handler{db: db} }

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/report", h.reportUser)
	r.Get("/admin/reports", h.adminListReports)
	r.Post("/admin/reports/{id}/action", h.adminAction)
	r.Get("/ban/status", h.banStatus)
	return r
}

// POST /api/moderation/report
func (h *Handler) reportUser(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var req struct {
		ReportedID string `json:"reportedId"`
		Reason     string `json:"reason"` // spam | harassment | inappropriate | other
		Detail     string `json:"detail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ReportedID == "" || req.Reason == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.ReportedID == me {
		jsonError(w, "không thể report bản thân", http.StatusBadRequest)
		return
	}

	id := uuid.NewString()
	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO reports(id,reporter_id,reported_id,reason,detail) VALUES(?,?,?,?,?)`,
		id, me, req.ReportedID, req.Reason, req.Detail,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	// Check if reported user has sent many unreplied messages (harassment auto-detect)
	// If report + harassment pattern → auto-ban 1 day
	var harassCount int
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(msg_count,0) FROM harassment_tracking WHERE sender_id=? AND receiver_id=?`,
		req.ReportedID, me,
	).Scan(&harassCount)

	if harassCount >= 10 {
		h.applyBan(r, req.ReportedID)
	}

	jsonOK(w, map[string]string{"status": "reported", "id": id})
}

// applyBan: escalating ban (1d, 2d, 4d, 8d...)
func (h *Handler) applyBan(r *http.Request, userID string) {
	var banCount int
	var existingID string
	h.db.QueryRowContext(r.Context(),
		`SELECT id, ban_count FROM chat_bans WHERE user_id=?`, userID,
	).Scan(&existingID, &banCount)

	// Reset ban count if no violation in 30 days
	var lastViolation int64
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(last_violation,0) FROM chat_bans WHERE user_id=?`, userID,
	).Scan(&lastViolation)
	if time.Now().Unix()-lastViolation > 30*24*3600 {
		banCount = 0
		existingID = ""
	}

	banCount++
	// Escalating: 1d, 2d, 4d, 8d, 16d max
	days := 1 << (banCount - 1)
	if days > 16 {
		days = 16
	}
	bannedUntil := time.Now().Add(time.Duration(days) * 24 * time.Hour).Unix()

	if existingID != "" {
		h.db.ExecContext(r.Context(),
			`UPDATE chat_bans SET ban_count=?, banned_until=?, last_violation=UNIX_TIMESTAMP() WHERE user_id=?`,
			banCount, bannedUntil, userID,
		)
	} else {
		h.db.ExecContext(r.Context(),
			`INSERT INTO chat_bans(id,user_id,ban_count,banned_until) VALUES(?,?,?,?)`,
			uuid.NewString(), userID, banCount, bannedUntil,
		)
	}

	// Clear harassment tracking
	h.db.ExecContext(r.Context(),
		`DELETE FROM harassment_tracking WHERE sender_id=?`, userID,
	)
}

// GET /api/moderation/ban/status
func (h *Handler) banStatus(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var bannedUntil int64
	var banCount int
	h.db.QueryRowContext(r.Context(),
		`SELECT banned_until, ban_count FROM chat_bans WHERE user_id=? AND banned_until > UNIX_TIMESTAMP()`,
		me,
	).Scan(&bannedUntil, &banCount)
	jsonOK(w, map[string]any{
		"banned":      bannedUntil > 0,
		"bannedUntil": bannedUntil,
		"banCount":    banCount,
	})
}

// GET /api/moderation/admin/reports — admin only
func (h *Handler) adminListReports(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	if !h.isAdmin(r, me) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.reason, r.detail, r.status, r.admin_note, r.created_at,
		       rep.username, rep.id, repd.username, repd.id
		FROM reports r
		JOIN users rep  ON rep.id  = r.reporter_id
		JOIN users repd ON repd.id = r.reported_id
		WHERE r.status='pending'
		ORDER BY r.created_at DESC LIMIT 100
	`)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type reportResp struct {
		ID               string `json:"id"`
		Reason           string `json:"reason"`
		Detail           string `json:"detail"`
		Status           string `json:"status"`
		AdminNote        string `json:"adminNote"`
		CreatedAt        int64  `json:"createdAt"`
		ReporterUsername string `json:"reporterUsername"`
		ReporterID       string `json:"reporterId"`
		ReportedUsername string `json:"reportedUsername"`
		ReportedID       string `json:"reportedId"`
	}
	var list []reportResp
	for rows.Next() {
		var rr reportResp
		rows.Scan(&rr.ID, &rr.Reason, &rr.Detail, &rr.Status, &rr.AdminNote, &rr.CreatedAt,
			&rr.ReporterUsername, &rr.ReporterID, &rr.ReportedUsername, &rr.ReportedID)
		list = append(list, rr)
	}
	if list == nil {
		list = []reportResp{}
	}
	jsonOK(w, list)
}

// POST /api/moderation/admin/reports/{id}/action
func (h *Handler) adminAction(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	if !h.isAdmin(r, me) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	reportID := chi.URLParam(r, "id")
	var req struct {
		Action    string `json:"action"`    // "ban" | "warn" | "dismiss"
		AdminNote string `json:"adminNote"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var reportedID string
	h.db.QueryRowContext(r.Context(),
		`SELECT reported_id FROM reports WHERE id=?`, reportID,
	).Scan(&reportedID)
	if reportedID == "" {
		jsonError(w, "report not found", http.StatusNotFound)
		return
	}

	status := "reviewed"
	if req.Action == "dismiss" {
		status = "dismissed"
	}

	h.db.ExecContext(r.Context(),
		`UPDATE reports SET status=?, admin_note=? WHERE id=?`,
		status, req.AdminNote, reportID,
	)

	if req.Action == "ban" {
		h.applyBan(r, reportedID)
	}

	jsonOK(w, map[string]string{"status": "ok"})
}

func (h *Handler) isAdmin(r *http.Request, userID string) bool {
	var isAdmin int
	h.db.QueryRowContext(r.Context(), `SELECT COALESCE(is_admin,0) FROM users WHERE id=?`, userID).Scan(&isAdmin)
	return isAdmin == 1
}

// CheckBanned returns true if user is currently chat-banned
func CheckBanned(db *sql.DB, userID string) (bool, int64) {
	var bannedUntil int64
	db.QueryRow(
		`SELECT banned_until FROM chat_bans WHERE user_id=? AND banned_until > UNIX_TIMESTAMP()`,
		userID,
	).Scan(&bannedUntil)
	return bannedUntil > 0, bannedUntil
}

// TrackHarassment increments message count from sender to receiver if no reply yet
func TrackHarassment(db *sql.DB, senderID, receiverID string) {
	// Check if receiver has replied recently
	var replyCount int
	db.QueryRow(`
		SELECT COUNT(*) FROM harassment_tracking
		WHERE sender_id=? AND receiver_id=? AND last_msg_at > UNIX_TIMESTAMP()-86400
	`, receiverID, senderID).Scan(&replyCount)

	if replyCount > 0 {
		// receiver replied → reset tracking for this direction
		db.Exec(`DELETE FROM harassment_tracking WHERE sender_id=? AND receiver_id=?`, senderID, receiverID)
		return
	}

	db.Exec(`
		INSERT INTO harassment_tracking(id,sender_id,receiver_id,msg_count,last_msg_at)
		VALUES(?,?,?,1,UNIX_TIMESTAMP())
		ON DUPLICATE KEY UPDATE
			msg_count=msg_count+1, last_msg_at=UNIX_TIMESTAMP()
	`, uuid.NewString(), senderID, receiverID)
}

// ResetHarassment resets tracking when receiver replies
func ResetHarassment(db *sql.DB, senderID, receiverID string) {
	db.Exec(`DELETE FROM harassment_tracking WHERE sender_id=? AND receiver_id=?`, senderID, receiverID)
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
