package users

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"amoon-eclipse/server/internal/auth"
	"amoon-eclipse/server/internal/r2"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
)

type Handler struct {
	db        *sql.DB
	jwtSecret string
	r2        *r2.Client
}

const maxAvatarBytes = 25 * 1024 * 1024

func NewHandler(db *sql.DB, jwtSecret string, r2Client *r2.Client) *Handler {
	return &Handler{db: db, jwtSecret: jwtSecret, r2: r2Client}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/search", h.search)
	r.Get("/me", h.me)
	r.Patch("/me", h.updateProfile)
	r.Delete("/me", h.deleteMe)
	r.Post("/me/avatar", h.uploadAvatar)
	r.Delete("/me/avatar", h.deleteAvatar)
	r.Get("/invite-link", h.getOrCreateInviteLink)
	r.Get("/invite/{token}", h.resolveInvite)
	r.Post("/totp/setup", h.totpSetup)
	r.Post("/totp/verify", h.totpVerify)
	r.Post("/totp/disable", h.totpDisable)
	return r
}

type userResp struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	DisplayName  string `json:"displayName,omitempty"`
	Bio          string `json:"bio,omitempty"`
	AvatarURL    string `json:"avatarUrl,omitempty"`
	AvatarThumb  string `json:"avatarThumbUrl,omitempty"`
	PublicKey    string `json:"publicKey,omitempty"`
	SignalBundle string `json:"signalBundle,omitempty"`
	TOTPEnabled  bool   `json:"totpEnabled"`
	IsAdmin      bool   `json:"isAdmin"`
}

// GET /api/users/search?q=prefix
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	q := r.URL.Query().Get("q")
	if len(q) < 1 {
		jsonOK(w, []userResp{})
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, username, COALESCE(display_name,''), COALESCE(public_key,''), COALESCE(signal_bundle,''), COALESCE(avatar_url,''), COALESCE(avatar_key,'')
		FROM users
		WHERE username LIKE ? AND id != ?
		LIMIT 20
	`, q+"%", me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var list []userResp
	for rows.Next() {
		var u userResp
		var avatarKey string
		rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.PublicKey, &u.SignalBundle, &u.AvatarURL, &avatarKey)
		h.decorateAvatar(&u, avatarKey)
		list = append(list, u)
	}
	if list == nil {
		list = []userResp{}
	}
	jsonOK(w, list)
}

// GET /api/users/me
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var u userResp
	var avatarKey string
	var totpEnabled, isAdmin int
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, username, COALESCE(display_name,''), COALESCE(bio,''),
		       COALESCE(avatar_url,''), COALESCE(avatar_key,''), COALESCE(public_key,''), COALESCE(signal_bundle,''), COALESCE(totp_enabled,0), COALESCE(is_admin,0)
		FROM users WHERE id=?
	`, me).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.AvatarURL, &avatarKey, &u.PublicKey, &u.SignalBundle, &totpEnabled, &isAdmin)
	if err != nil {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	h.decorateAvatar(&u, avatarKey)
	u.TOTPEnabled = totpEnabled == 1
	u.IsAdmin = isAdmin == 1
	jsonOK(w, u)
}

// PATCH /api/users/me
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var req struct {
		DisplayName *string `json:"displayName"`
		Bio         *string `json:"bio"`
		Username    *string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	updatedUsername := ""
	if req.Username != nil {
		newUsername := strings.TrimSpace(*req.Username)
		if len(newUsername) < 3 || len(newUsername) > 30 {
			jsonError(w, "username phải 3-30 ký tự", http.StatusBadRequest)
			return
		}
		// Check uniqueness
		var cnt int
		h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE username=? AND id!=?`, newUsername, me).Scan(&cnt)
		if cnt > 0 {
			jsonError(w, "username đã được dùng", http.StatusConflict)
			return
		}
		if _, err := h.db.ExecContext(r.Context(), `UPDATE users SET username=? WHERE id=?`, newUsername, me); err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
		updatedUsername = newUsername
	}
	if req.DisplayName != nil {
		name := strings.TrimSpace(*req.DisplayName)
		if len(name) > 50 {
			name = name[:50]
		}
		if _, err := h.db.ExecContext(r.Context(), `UPDATE users SET display_name=? WHERE id=?`, name, me); err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
	}
	if req.Bio != nil {
		bio := strings.TrimSpace(*req.Bio)
		if len(bio) > 200 {
			bio = bio[:200]
		}
		if _, err := h.db.ExecContext(r.Context(), `UPDATE users SET bio=? WHERE id=?`, bio, me); err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
	}

	resp := map[string]string{"status": "ok"}
	if updatedUsername != "" {
		tokenVersion, err := auth.CurrentTokenVersion(r.Context(), h.db, me)
		if err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
		token, err := auth.SignJWT(me, updatedUsername, h.jwtSecret, tokenVersion)
		if err != nil {
			jsonError(w, "token error", http.StatusInternalServerError)
			return
		}
		resp["username"] = updatedUsername
		resp["token"] = token
	}
	jsonOK(w, resp)
}

// DELETE /api/users/me
func (h *Handler) deleteMe(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var avatarKey string
	if err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(avatar_key,'') FROM users WHERE id=?`, me).Scan(&avatarKey); err != nil {
		if err == sql.ErrNoRows {
			jsonError(w, "not found", http.StatusNotFound)
			return
		}
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	// messages.sender_id has FK without ON DELETE CASCADE, so remove authored messages first.
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM messages WHERE sender_id=?`, me); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	res, err := tx.ExecContext(r.Context(), `DELETE FROM users WHERE id=?`, me)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	if err := tx.Commit(); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	if avatarKey != "" && h.r2 != nil {
		go h.r2.DeleteObject(context.Background(), avatarKey)
	}

	jsonOK(w, map[string]string{"status": "deleted"})
}

// POST /api/users/me/avatar — multipart field "avatar" hoặc "file", max 25MB.
func (h *Handler) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	if h.r2 == nil {
		log.Printf("[avatar] rejected: R2 not configured")
		jsonError(w, "R2 chưa cấu hình", http.StatusServiceUnavailable)
		return
	}

	me := r.Context().Value(auth.ContextKeyUserID).(string)
	log.Printf("[avatar] upload start user=%s contentLength=%d contentType=%q", me, r.ContentLength, r.Header.Get("Content-Type"))
	if err := r.ParseMultipartForm(maxAvatarBytes + 1024*1024); err != nil {
		log.Printf("[avatar] multipart parse failed user=%s err=%v", me, err)
		jsonError(w, "ảnh quá lớn hoặc multipart không hợp lệ", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		file, header, err = r.FormFile("file")
	}
	if err != nil {
		log.Printf("[avatar] missing file user=%s err=%v", me, err)
		jsonError(w, "thiếu file avatar", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > maxAvatarBytes {
		log.Printf("[avatar] file too large user=%s filename=%q size=%d", me, header.Filename, header.Size)
		jsonError(w, "avatar tối đa 25MB", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxAvatarBytes+1))
	if err != nil {
		log.Printf("[avatar] read failed user=%s filename=%q err=%v", me, header.Filename, err)
		jsonError(w, "không đọc được file", http.StatusBadRequest)
		return
	}
	if len(data) == 0 {
		log.Printf("[avatar] empty file user=%s filename=%q", me, header.Filename)
		jsonError(w, "file rỗng", http.StatusBadRequest)
		return
	}
	if len(data) > maxAvatarBytes {
		log.Printf("[avatar] file too large after read user=%s filename=%q size=%d", me, header.Filename, len(data))
		jsonError(w, "avatar tối đa 25MB", http.StatusRequestEntityTooLarge)
		return
	}
	allowed, usage, limit, quotaErr := h.r2.CanUpload(r.Context(), int64(len(data)))
	if quotaErr != nil {
		log.Printf("[avatar] quota check failed user=%s err=%v", me, quotaErr)
		jsonError(w, "quota check failed", http.StatusServiceUnavailable)
		return
	}
	if !allowed {
		log.Printf("[avatar] blocked by quota user=%s size=%d usage=%d limit=%d", me, len(data), usage, limit)
		jsonError(w, "bucket gần đầy, tạm khóa upload", http.StatusInsufficientStorage)
		return
	}

	contentType, ext, ok := detectAvatarType(data)
	if !ok {
		log.Printf("[avatar] unsupported type user=%s filename=%q detected=%q size=%d", me, header.Filename, http.DetectContentType(data), len(data))
		jsonError(w, "chỉ hỗ trợ JPEG, PNG, WebP hoặc GIF", http.StatusBadRequest)
		return
	}

	var oldKey string
	h.db.QueryRowContext(r.Context(), `SELECT COALESCE(avatar_key,'') FROM users WHERE id=?`, me).Scan(&oldKey)

	key := fmt.Sprintf("avatars/%s/%s%s", me, uuid.NewString(), ext)
	avatarURL, err := h.r2.PutObject(r.Context(), key, contentType, data)
	if err != nil {
		log.Printf("[avatar] R2 upload failed user=%s key=%s type=%s size=%d err=%v", me, key, contentType, len(data), err)
		jsonError(w, "upload R2 thất bại", http.StatusBadGateway)
		return
	}

	if _, err := h.db.ExecContext(r.Context(), `UPDATE users SET avatar_url=?, avatar_key=? WHERE id=?`, avatarURL, key, me); err != nil {
		log.Printf("[avatar] DB update failed user=%s key=%s err=%v", me, key, err)
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if oldKey != "" && oldKey != key {
		go h.r2.DeleteObject(context.Background(), oldKey)
	}
	log.Printf("[avatar] upload ok user=%s key=%s type=%s size=%d url=%s", me, key, contentType, len(data), avatarURL)

	jsonOK(w, map[string]string{
		"avatarUrl":      avatarURL,
		"avatarThumbUrl": h.avatarThumbURL(key, avatarURL),
		"avatarKey":      key,
	})
}

// DELETE /api/users/me/avatar
func (h *Handler) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var oldKey string
	h.db.QueryRowContext(r.Context(), `SELECT COALESCE(avatar_key,'') FROM users WHERE id=?`, me).Scan(&oldKey)
	if _, err := h.db.ExecContext(r.Context(), `UPDATE users SET avatar_url=NULL, avatar_key=NULL WHERE id=?`, me); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if h.r2 != nil && oldKey != "" {
		go h.r2.DeleteObject(context.Background(), oldKey)
	}
	jsonOK(w, map[string]string{"status": "deleted"})
}

func detectAvatarType(data []byte) (contentType string, ext string, ok bool) {
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

func (h *Handler) decorateAvatar(u *userResp, avatarKey string) {
	if u.AvatarURL == "" {
		return
	}
	u.AvatarThumb = h.avatarThumbURL(avatarKey, u.AvatarURL)
}

func (h *Handler) avatarThumbURL(key, fallback string) string {
	if h.r2 == nil || key == "" {
		return fallback
	}
	return h.r2.TransformURL(key, 256, 256)
}

// GET /api/users/invite-link — get or create invite link
func (h *Handler) getOrCreateInviteLink(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)

	var token string
	h.db.QueryRowContext(r.Context(),
		`SELECT token FROM invite_links WHERE user_id=? ORDER BY created_at DESC LIMIT 1`, me,
	).Scan(&token)

	if token == "" {
		// Generate random token
		b := make([]byte, 16)
		rand.Read(b)
		token = base64.RawURLEncoding.EncodeToString(b)
		h.db.ExecContext(r.Context(),
			`INSERT INTO invite_links(id,user_id,token) VALUES(?,?,?)`,
			uuid.NewString(), me, token,
		)
	}

	jsonOK(w, map[string]string{
		"token": token,
		"link":  "amoon-eclipse://invite/" + token,
	})
}

// GET /api/users/invite/{token} — resolve invite link to user info
func (h *Handler) resolveInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	var userID, username string
	err := h.db.QueryRowContext(r.Context(), `
		SELECT u.id, u.username
		FROM invite_links il JOIN users u ON u.id = il.user_id
		WHERE il.token=?
	`, token).Scan(&userID, &username)
	if err == sql.ErrNoRows {
		jsonError(w, "link không hợp lệ", http.StatusNotFound)
		return
	}
	// Increment uses
	h.db.ExecContext(r.Context(), `UPDATE invite_links SET uses=uses+1 WHERE token=?`, token)
	jsonOK(w, map[string]string{"userId": userID, "username": username})
}

// POST /api/users/totp/setup — generate TOTP secret, return QR URL
func (h *Handler) totpSetup(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var username string
	h.db.QueryRowContext(r.Context(), `SELECT username FROM users WHERE id=?`, me).Scan(&username)

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "AMoon Eclipse",
		AccountName: username,
	})
	if err != nil {
		jsonError(w, "totp generate error", http.StatusInternalServerError)
		return
	}

	// Store secret temporarily (not enabled until verified)
	h.db.ExecContext(r.Context(),
		`UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=?`,
		key.Secret(), me,
	)

	jsonOK(w, map[string]string{
		"secret": key.Secret(),
		"url":    key.URL(),
	})
}

// POST /api/users/totp/verify — verify OTP and enable 2FA
func (h *Handler) totpVerify(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var secret string
	h.db.QueryRowContext(r.Context(), `SELECT COALESCE(totp_secret,'') FROM users WHERE id=?`, me).Scan(&secret)
	if secret == "" {
		jsonError(w, "chưa setup 2FA", http.StatusBadRequest)
		return
	}

	valid := totp.Validate(req.Code, secret)
	if !valid {
		jsonError(w, "mã không đúng", http.StatusUnauthorized)
		return
	}

	h.db.ExecContext(r.Context(), `UPDATE users SET totp_enabled=1 WHERE id=?`, me)
	jsonOK(w, map[string]string{"status": "enabled"})
}

// POST /api/users/totp/disable
func (h *Handler) totpDisable(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(auth.ContextKeyUserID).(string)
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var secret string
	var enabled int
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(totp_secret,''), COALESCE(totp_enabled,0) FROM users WHERE id=?`, me,
	).Scan(&secret, &enabled)

	if enabled == 0 || secret == "" {
		jsonError(w, "2FA chưa bật", http.StatusBadRequest)
		return
	}

	valid := totp.Validate(req.Code, secret)
	if !valid {
		jsonError(w, "mã không đúng", http.StatusUnauthorized)
		return
	}

	h.db.ExecContext(r.Context(),
		`UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?`, me,
	)
	jsonOK(w, map[string]string{"status": "disabled"})
}

// VerifyTOTP checks TOTP code for login (called from auth if enabled)
func VerifyTOTP(db *sql.DB, userID, code string) bool {
	var secret string
	var enabled int
	db.QueryRow(`SELECT COALESCE(totp_secret,''), COALESCE(totp_enabled,0) FROM users WHERE id=?`, userID).Scan(&secret, &enabled)
	if enabled == 0 || secret == "" {
		return true // 2FA not enabled, pass
	}
	// Allow 30s window
	valid, _ := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
		Period: 30,
		Skew:   1,
		Digits: 6,
	})
	return valid
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
