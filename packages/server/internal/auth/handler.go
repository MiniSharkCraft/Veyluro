package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	dbcrypto "amoon-eclipse/server/internal/crypto"
	"amoon-eclipse/server/internal/email"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
)

type Handler struct {
	db                 *sql.DB
	jwtSecret          string
	enc                *dbcrypto.FieldEncryptor
	hmac               *dbcrypto.HmacTokener
	googleClientID     string
	googleClientSecret string
	googleRedirectURI  string
	oauthAppRedirect   string
	facebookAppID      string
	recaptchaSecretKey string
	mailer             *email.Sender
	oauthStateMu       sync.Mutex
	oauthStateStore    map[string]int64
	oauthCodeMu        sync.Mutex
	oauthCodeStore     map[string]oauthExchangePayload
}

type oauthExchangePayload struct {
	Token    string
	UserID   string
	Username string
	Expires  int64
}

func (h *Handler) googleOAuthReady() bool {
	return strings.TrimSpace(h.googleClientID) != "" && strings.TrimSpace(h.googleRedirectURI) != ""
}

func (h *Handler) oauthRedirectTarget() string {
	if t := strings.TrimSpace(h.oauthAppRedirect); t != "" {
		return t
	}
	return "veyluro://auth"
}

func (h *Handler) redirectOAuthError(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, h.oauthRedirectTarget()+"?error="+url.QueryEscape(code), http.StatusFound)
}

func NewHandler(
	db *sql.DB,
	jwtSecret string,
	enc *dbcrypto.FieldEncryptor,
	hmac *dbcrypto.HmacTokener,
	googleClientID, googleClientSecret, googleRedirectURI, oauthAppRedirect, facebookAppID string,
	recaptchaSecretKey string,
	mailer *email.Sender,
) *Handler {
	return &Handler{
		db:                 db,
		jwtSecret:          jwtSecret,
		enc:                enc,
		hmac:               hmac,
		googleClientID:     googleClientID,
		googleClientSecret: googleClientSecret,
		googleRedirectURI:  googleRedirectURI,
		oauthAppRedirect:   oauthAppRedirect,
		facebookAppID:      facebookAppID,
		recaptchaSecretKey: strings.TrimSpace(recaptchaSecretKey),
		mailer:             mailer,
		oauthStateStore:    map[string]int64{},
		oauthCodeStore:     map[string]oauthExchangePayload{},
	}
}

func (h *Handler) verifyRecaptcha(ctx context.Context, token, remoteIP, action string) error {
	if h.recaptchaSecretKey == "" {
		return nil
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return fmt.Errorf("captcha_required")
	}
	form := url.Values{}
	form.Set("secret", h.recaptchaSecretKey)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://www.google.com/recaptcha/api/siteverify", strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("captcha_unavailable")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("captcha_unavailable")
	}
	defer resp.Body.Close()
	var out struct {
		Success bool    `json:"success"`
		Score   float64 `json:"score"`
		Action  string  `json:"action"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("captcha_unavailable")
	}
	if !out.Success {
		return fmt.Errorf("captcha_invalid")
	}
	// For v3: optional action/score checks when present.
	if action != "" && out.Action != "" && out.Action != action {
		return fmt.Errorf("captcha_invalid")
	}
	if out.Score > 0 && out.Score < 0.4 {
		return fmt.Errorf("captcha_low_score")
	}
	return nil
}

func (h *Handler) captchaEnabledForRequest(r *http.Request) bool {
	if h.recaptchaSecretKey == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Client-Platform")), "web")
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	// Public — no JWT required
	r.Post("/register", h.register)
	r.Post("/login", h.login)
	r.Post("/oauth", h.oauth)
	r.Get("/google/start", h.googleStart)
	r.Get("/google/callback", h.googleCallback)
	r.Post("/google/exchange", h.googleExchange)
	r.Post("/forgot-password", h.forgotPassword)
	r.Post("/forgot-username", h.forgotUsername)
	r.Post("/reset-password", h.resetPassword)

	// Protected — JWT required (inline middleware using h.jwtSecret)
	r.Group(func(r chi.Router) {
		r.Use(h.requireAuth)
		r.Post("/register-key", h.registerKey)
		r.Post("/store-encrypted-key", h.storeEncryptedKey)
		r.Get("/encrypted-key", h.getEncryptedKey)
	})
	return r
}

// requireAuth is an inline JWT middleware for auth-sub-routes.
func (h *Handler) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			jsonError(w, "missing token", http.StatusUnauthorized)
			return
		}
		claims, err := VerifyJWT(strings.TrimPrefix(header, "Bearer "), h.jwtSecret)
		if err != nil {
			jsonError(w, "invalid token", http.StatusUnauthorized)
			return
		}
		currentVersion, err := CurrentTokenVersion(r.Context(), h.db, claims.UserID)
		if err != nil || currentVersion != claims.TokenVersion {
			jsonError(w, "token revoked", http.StatusUnauthorized)
			return
		}
		ctx := r.Context()
		ctx = context.WithValue(ctx, ContextKeyUserID, claims.UserID)
		ctx = context.WithValue(ctx, ContextKeyUsername, claims.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ── Register (email + password) ────────────────────────────────────────────

type registerReq struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"` // Argon2id hash từ client
	PublicKey   string `json:"publicKey"`
	Fingerprint string `json:"fingerprint"`
	Recaptcha   string `json:"recaptchaToken"`
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if h.captchaEnabledForRequest(r) {
		if err := h.verifyRecaptcha(r.Context(), req.Recaptcha, r.RemoteAddr, "register"); err != nil {
			jsonError(w, err.Error(), http.StatusUnauthorized)
			return
		}
	}

	// Check username đã tồn tại chưa
	var exists int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE username=?`, req.Username).Scan(&exists)
	if exists > 0 {
		jsonError(w, "username đã được dùng", http.StatusConflict)
		return
	}

	// Hash password lần 2 phía server (defence in depth — client đã argon2id rồi)
	serverHash, err := HashArgon2id(req.Password)
	if err != nil {
		jsonError(w, "server error", http.StatusInternalServerError)
		return
	}

	var emailEnc, emailToken string
	if req.Email != "" {
		emailEnc, err = h.enc.Encrypt(req.Email)
		if err != nil {
			jsonError(w, "encrypt error", http.StatusInternalServerError)
			return
		}
		emailToken = h.hmac.Token(strings.ToLower(req.Email))
	}

	id := uuid.NewString()
	_, err = h.db.ExecContext(r.Context(),
		`INSERT INTO users(id,username,password_hash,email_enc,email_token,public_key,fingerprint) VALUES(?,?,?,?,?,?,?)`,
		id, req.Username, serverHash, nullStr(emailEnc), nullStr(emailToken), nullStr(strings.TrimSpace(req.PublicKey)), nullStr(strings.TrimSpace(req.Fingerprint)),
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	token, err := h.issueJWT(r.Context(), id, req.Username)
	if err != nil {
		jsonError(w, "token error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"token": token, "userId": id, "username": req.Username})
}

// ── Login ──────────────────────────────────────────────────────────────────

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
	TOTPCode string `json:"totpCode"`
	Recaptcha string `json:"recaptchaToken"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if h.captchaEnabledForRequest(r) {
		if err := h.verifyRecaptcha(r.Context(), req.Recaptcha, r.RemoteAddr, "login"); err != nil {
			jsonError(w, err.Error(), http.StatusUnauthorized)
			return
		}
	}

	var id, username, hash, totpSecret string
	var totpEnabled int
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, username, password_hash, COALESCE(totp_enabled,0), COALESCE(totp_secret,'')
		 FROM users WHERE username=? AND password_hash IS NOT NULL`,
		req.Username,
	).Scan(&id, &username, &hash, &totpEnabled, &totpSecret)
	if err != nil {
		jsonError(w, "sai username hoặc password", http.StatusUnauthorized)
		return
	}

	ok, err := VerifyArgon2id(req.Password, hash)
	if err != nil || !ok {
		jsonError(w, "sai username hoặc password", http.StatusUnauthorized)
		return
	}
	if totpEnabled == 1 {
		code := strings.TrimSpace(req.TOTPCode)
		if code == "" {
			jsonError(w, "totp_required", http.StatusUnauthorized)
			return
		}
		if !verifyUserTOTP(code, totpSecret) {
			jsonError(w, "totp_invalid", http.StatusUnauthorized)
			return
		}
	}

	var pubKey string
	h.db.QueryRowContext(r.Context(), `SELECT COALESCE(public_key,'') FROM users WHERE id=?`, id).Scan(&pubKey)

	token, err := h.issueJWT(r.Context(), id, username)
	if err != nil {
		jsonError(w, "token error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"token": token, "userId": id, "username": username, "publicKey": pubKey})
}

// ── OAuth (Google / Facebook) ──────────────────────────────────────────────

type oauthReq struct {
	Provider    string `json:"provider"`    // "google" | "facebook"
	AccessToken string `json:"accessToken"` // token từ client OAuth flow
}

type googleUserInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Aud   string `json:"aud"` // audience — phải khớp với client ID của app
}

type fbUserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (h *Handler) oauth(w http.ResponseWriter, r *http.Request) {
	var req oauthReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var oauthID, email, name string

	switch req.Provider {
	case "google":
		info, err := fetchGoogle(req.AccessToken, h.googleClientID)
		if err != nil {
			jsonError(w, "google token invalid", http.StatusUnauthorized)
			return
		}
		oauthID, email, name = info.Sub, info.Email, info.Name
	case "facebook":
		info, err := fetchFacebook(req.AccessToken, h.facebookAppID)
		if err != nil {
			jsonError(w, "facebook token invalid", http.StatusUnauthorized)
			return
		}
		oauthID, email, name = info.ID, info.Email, info.Name
	default:
		jsonError(w, "provider không hỗ trợ", http.StatusBadRequest)
		return
	}

	// Tìm user hiện có
	var id, username string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, username FROM users WHERE oauth_provider=? AND oauth_id=?`,
		req.Provider, oauthID,
	).Scan(&id, &username)

	if err == sql.ErrNoRows {
		// Tạo user mới
		id = uuid.NewString()
		username = sanitizeUsername(name) + "_" + id[:6]

		var emailEnc, emailToken string
		if email != "" {
			emailEnc, _ = h.enc.Encrypt(email)
			emailToken = h.hmac.Token(strings.ToLower(email))
		}

		_, err = h.db.ExecContext(r.Context(),
			`INSERT INTO users(id,username,oauth_provider,oauth_id,email_enc,email_token) VALUES(?,?,?,?,?,?)`,
			id, username, req.Provider, oauthID, nullStr(emailEnc), nullStr(emailToken),
		)
		if err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	token, err := h.issueJWT(r.Context(), id, username)
	if err != nil {
		jsonError(w, "token error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"token": token, "userId": id, "username": username})
}

// ── Register Public Key ────────────────────────────────────────────────────

type registerKeyReq struct {
	PublicKey    string `json:"publicKey"`
	Fingerprint  string `json:"fingerprint"`
	SignalBundle any    `json:"signalBundle"`
}

func (h *Handler) registerKey(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ContextKeyUserID).(string)

	var req registerKeyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	publicKey := strings.TrimSpace(req.PublicKey)
	fingerprint := strings.TrimSpace(req.Fingerprint)
	if publicKey == "" {
		jsonOK(w, map[string]string{"status": "ok", "mode": "legacy-e2ee"})
		return
	}

	_, err := h.db.ExecContext(r.Context(),
		`UPDATE users SET public_key=?, fingerprint=?, signal_bundle=NULL WHERE id=?`,
		nullStr(publicKey),
		nullStr(fingerprint),
		userID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Helpers ────────────────────────────────────────────────────────────────

// fetchGoogle verify access token + kiểm tra audience nếu có clientID
func fetchGoogle(accessToken, clientID string) (*googleUserInfo, error) {
	resp, err := httpGet("https://www.googleapis.com/oauth2/v3/userinfo?access_token=" + accessToken)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, io.EOF
	}
	var info googleUserInfo
	json.NewDecoder(resp.Body).Decode(&info)
	if info.Sub == "" {
		return nil, io.EOF
	}

	// Verify audience nếu server có cấu hình clientID (chống confused deputy attack)
	if clientID != "" && info.Aud != "" && info.Aud != clientID {
		return nil, fmt.Errorf("google token audience mismatch")
	}
	return &info, nil
}

// fetchFacebook verify token + kiểm tra app ID
func fetchFacebook(accessToken, appID string) (*fbUserInfo, error) {
	url := "https://graph.facebook.com/me?fields=id,name,email&access_token=" + accessToken

	// Nếu có App ID, dùng debug_token để verify chắc chắn hơn
	if appID != "" {
		// App access token format: appID|appSecret — nhưng ở đây ta chỉ verify qua userinfo
		// và check app_id trong response
		debugResp, err := httpGet("https://graph.facebook.com/debug_token?input_token=" + accessToken + "&access_token=" + accessToken)
		if err == nil && debugResp.StatusCode == 200 {
			var debug struct {
				Data struct {
					AppID   string `json:"app_id"`
					IsValid bool   `json:"is_valid"`
				} `json:"data"`
			}
			json.NewDecoder(debugResp.Body).Decode(&debug)
			debugResp.Body.Close()
			if !debug.Data.IsValid || (debug.Data.AppID != "" && debug.Data.AppID != appID) {
				return nil, fmt.Errorf("facebook token invalid or wrong app")
			}
		}
	}

	resp, err := httpGet(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, io.EOF
	}
	var info fbUserInfo
	json.NewDecoder(resp.Body).Decode(&info)
	if info.ID == "" {
		return nil, io.EOF
	}
	return &info, nil
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

func httpGet(url string) (*http.Response, error) {
	return httpClient.Get(url)
}

func sanitizeUsername(name string) string {
	var b strings.Builder
	for _, c := range strings.ToLower(name) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
			b.WriteRune(c)
		} else if c == ' ' {
			b.WriteRune('_')
		}
	}
	s := b.String()
	if len(s) > 20 {
		s = s[:20]
	}
	if s == "" {
		s = "user"
	}
	return s
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (h *Handler) issueJWT(ctx context.Context, userID, username string) (string, error) {
	version, err := CurrentTokenVersion(ctx, h.db, userID)
	if err != nil {
		return "", err
	}
	return SignJWT(userID, username, h.jwtSecret, version)
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

type contextKey string

const ContextKeyUserID contextKey = "userID"
const ContextKeyUsername contextKey = "username"

// ── Forgot Password ────────────────────────────────────────────────────────

type forgotReq struct {
	Email     string `json:"email"`
	Recaptcha string `json:"recaptchaToken"`
}

func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if h.captchaEnabledForRequest(r) {
		if err := h.verifyRecaptcha(r.Context(), req.Recaptcha, r.RemoteAddr, "forgot_password"); err != nil {
			jsonError(w, err.Error(), http.StatusUnauthorized)
			return
		}
	}

	// Tìm user qua email token
	token := h.hmac.Token(strings.ToLower(req.Email))
	var id string
	var emailEnc string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, email_enc FROM users WHERE email_token=?`, token,
	).Scan(&id, &emailEnc)

	// Luôn trả 200 dù có tìm thấy hay không (chống email enumeration)
	if err != nil {
		jsonOK(w, map[string]string{"status": "sent"})
		return
	}

	if h.mailer == nil {
		jsonError(w, "email chưa được cấu hình trên server", http.StatusServiceUnavailable)
		return
	}

	// Decrypt email thật
	emailPlain, err := h.enc.Decrypt(emailEnc)
	if err != nil {
		jsonOK(w, map[string]string{"status": "sent"})
		return
	}

	// Tạo OTP 6 số
	otp := genOTP()
	otpHash, err := HashArgon2id(otp)
	if err != nil {
		jsonError(w, "server error", http.StatusInternalServerError)
		return
	}

	expires := time.Now().Add(10 * time.Minute).Unix()
	h.db.ExecContext(r.Context(),
		`UPDATE users SET reset_token=?, reset_expires=?, reset_attempts=0 WHERE id=?`,
		otpHash, expires, id,
	)

	if err := h.mailer.SendOTP(emailPlain, otp); err != nil {
		log.Printf("ERROR SendOTP to %s: %v", emailPlain, err)
		jsonError(w, "không gửi được email, thử lại sau", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "sent"})
}

type resetReq struct {
	Email     string `json:"email"`
	OTP       string `json:"otp"`
	Password  string `json:"password"` // new password hash
	Recaptcha string `json:"recaptchaToken"`
}

const maxResetOTPAttempts = 5

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.OTP == "" || req.Password == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if h.captchaEnabledForRequest(r) {
		if err := h.verifyRecaptcha(r.Context(), req.Recaptcha, r.RemoteAddr, "reset_password"); err != nil {
			jsonError(w, err.Error(), http.StatusUnauthorized)
			return
		}
	}

	token := h.hmac.Token(strings.ToLower(req.Email))
	var id, otpHash string
	var expires int64
	var resetAttempts int
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, reset_token, reset_expires, COALESCE(reset_attempts,0)
		 FROM users WHERE email_token=? AND reset_token IS NOT NULL`,
		token,
	).Scan(&id, &otpHash, &expires, &resetAttempts)
	if err != nil {
		jsonError(w, "OTP không hợp lệ hoặc đã hết hạn", http.StatusUnauthorized)
		return
	}
	if resetAttempts >= maxResetOTPAttempts {
		h.db.ExecContext(r.Context(),
			`UPDATE users SET reset_token=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=?`,
			id,
		)
		jsonError(w, "OTP đã bị khóa do nhập sai quá nhiều lần", http.StatusTooManyRequests)
		return
	}

	if time.Now().Unix() > expires {
		h.db.ExecContext(r.Context(),
			`UPDATE users SET reset_token=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=?`,
			id,
		)
		jsonError(w, "OTP đã hết hạn", http.StatusUnauthorized)
		return
	}

	ok, _ := VerifyArgon2id(req.OTP, otpHash)
	if !ok {
		nextAttempts := resetAttempts + 1
		if nextAttempts >= maxResetOTPAttempts {
			h.db.ExecContext(r.Context(),
				`UPDATE users SET reset_token=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=?`,
				id,
			)
			jsonError(w, "OTP đã bị khóa do nhập sai quá nhiều lần", http.StatusTooManyRequests)
			return
		}
		h.db.ExecContext(r.Context(),
			`UPDATE users SET reset_attempts=? WHERE id=?`,
			nextAttempts, id,
		)
		jsonError(w, "OTP sai", http.StatusUnauthorized)
		return
	}

	newHash, err := HashArgon2id(req.Password)
	if err != nil {
		jsonError(w, "server error", http.StatusInternalServerError)
		return
	}

	h.db.ExecContext(r.Context(),
		`UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=?`,
		newHash, id,
	)
	if err := IncrementTokenVersion(r.Context(), h.db, id); err != nil {
		jsonError(w, "server error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── Passphrase-encrypted key backup ───────────────────────────────────────

type storeKeyReq struct {
	EncryptedKey string `json:"encryptedKey"` // JSON: {salt, iv, ciphertext} base64
	KeySalt      string `json:"keySalt"`
}

func (h *Handler) storeEncryptedKey(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ContextKeyUserID).(string)
	var req storeKeyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EncryptedKey == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	h.db.ExecContext(r.Context(),
		`UPDATE users SET encrypted_key=?, key_salt=? WHERE id=?`,
		req.EncryptedKey, req.KeySalt, userID,
	)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (h *Handler) getEncryptedKey(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ContextKeyUserID).(string)
	var encKey, keySalt string
	h.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(encrypted_key,''), COALESCE(key_salt,'') FROM users WHERE id=?`, userID,
	).Scan(&encKey, &keySalt)
	jsonOK(w, map[string]any{"encryptedKey": encKey, "keySalt": keySalt})
}

// ── Google OAuth server-side ───────────────────────────────────────────────

func (h *Handler) googleStart(w http.ResponseWriter, r *http.Request) {
	if !h.googleOAuthReady() {
		h.redirectOAuthError(w, r, "google_not_configured")
		return
	}

	state := randomURLToken(32)
	h.storeOAuthState(state, time.Now().Add(10*time.Minute).Unix())
	http.SetCookie(w, &http.Cookie{
		Name:     "veyluro_oauth_state",
		Value:    state,
		Path:     "/api/auth/google/callback",
		HttpOnly: true,
		Secure:   isHTTPSRequest(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   600,
	})

	params := url.Values{
		"client_id":     {h.googleClientID},
		"redirect_uri":  {h.googleRedirectURI},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"access_type":   {"offline"},
		"state":         {state},
	}
	http.Redirect(w, r, "https://accounts.google.com/o/oauth2/v2/auth?"+params.Encode(), http.StatusFound)
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	if !h.googleOAuthReady() || strings.TrimSpace(h.googleClientSecret) == "" {
		h.redirectOAuthError(w, r, "google_not_configured")
		return
	}

	queryState := strings.TrimSpace(r.URL.Query().Get("state"))
	if queryState == "" {
		h.redirectOAuthError(w, r, "missing_state")
		return
	}
	cookie, err := r.Cookie("amoon_oauth_state")
	if err != nil || cookie == nil || strings.TrimSpace(cookie.Value) == "" {
		cookie, err = r.Cookie("veyluro_oauth_state")
	}
	if err != nil || cookie == nil || strings.TrimSpace(cookie.Value) == "" {
		h.redirectOAuthError(w, r, "missing_state_cookie")
		return
	}
	if cookie.Value != queryState {
		h.redirectOAuthError(w, r, "invalid_state")
		return
	}
	if !h.consumeOAuthState(queryState) {
		h.redirectOAuthError(w, r, "expired_state")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "veyluro_oauth_state",
		Value:    "",
		Path:     "/api/auth/google/callback",
		HttpOnly: true,
		Secure:   isHTTPSRequest(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "amoon_oauth_state",
		Value:    "",
		Path:     "/api/auth/google/callback",
		HttpOnly: true,
		Secure:   isHTTPSRequest(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})

	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectOAuthError(w, r, "cancelled")
		return
	}

	// Exchange code for token
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {h.googleClientID},
		"client_secret": {h.googleClientSecret},
		"redirect_uri":  {h.googleRedirectURI},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		h.redirectOAuthError(w, r, "token_exchange")
		return
	}
	defer resp.Body.Close()
	var tokenRes struct {
		AccessToken string `json:"access_token"`
	}
	json.NewDecoder(resp.Body).Decode(&tokenRes)
	if tokenRes.AccessToken == "" {
		h.redirectOAuthError(w, r, "no_token")
		return
	}

	// Get user info
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+tokenRes.AccessToken)
	infoResp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.redirectOAuthError(w, r, "userinfo")
		return
	}
	defer infoResp.Body.Close()
	var info struct {
		Sub   string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	json.NewDecoder(infoResp.Body).Decode(&info)
	if info.Sub == "" {
		h.redirectOAuthError(w, r, "no_user")
		return
	}

	// Find or create user
	var userID, username string
	err = h.db.QueryRowContext(r.Context(),
		`SELECT id, username FROM users WHERE oauth_provider='google' AND oauth_id=?`, info.Sub,
	).Scan(&userID, &username)

	if err == sql.ErrNoRows {
		userID = uuid.New().String()
		username = strings.ReplaceAll(strings.ToLower(info.Name), " ", "_")
		if username == "" {
			username = "user_" + userID[:8]
		}
		var emailEnc, emailToken string
		if info.Email != "" {
			emailEnc, _ = h.enc.Encrypt(info.Email)
			emailToken = h.hmac.Token(strings.ToLower(info.Email))
		}
		h.db.ExecContext(r.Context(),
			`INSERT INTO users(id,username,oauth_provider,oauth_id,email_enc,email_token) VALUES(?,?,?,?,?,?)`,
			userID, username, "google", info.Sub, nullStr(emailEnc), nullStr(emailToken),
		)
	} else if err != nil {
		h.redirectOAuthError(w, r, "db")
		return
	}

	token, err := h.issueJWT(r.Context(), userID, username)
	if err != nil {
		h.redirectOAuthError(w, r, "jwt")
		return
	}

	exchangeCode := randomURLToken(32)
	h.storeOAuthCode(exchangeCode, oauthExchangePayload{
		Token:    token,
		UserID:   userID,
		Username: username,
		Expires:  time.Now().Add(2 * time.Minute).Unix(),
	})

	params := url.Values{
		"code": {exchangeCode},
	}
	http.Redirect(w, r, h.oauthRedirectTarget()+"?"+params.Encode(), http.StatusFound)
}

type googleExchangeReq struct {
	Code string `json:"code"`
}

func (h *Handler) googleExchange(w http.ResponseWriter, r *http.Request) {
	var req googleExchangeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Code) == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	payload, ok := h.consumeOAuthCode(strings.TrimSpace(req.Code))
	if !ok {
		jsonError(w, "invalid_or_expired_code", http.StatusUnauthorized)
		return
	}
	jsonOK(w, map[string]any{
		"token":    payload.Token,
		"userId":   payload.UserID,
		"username": payload.Username,
	})
}

// ── Forgot username ────────────────────────────────────────────────────────

func (h *Handler) forgotUsername(w http.ResponseWriter, r *http.Request) {
	var req forgotReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	token := h.hmac.Token(strings.ToLower(req.Email))
	var username, emailEnc string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT username, email_enc FROM users WHERE email_token=?`, token,
	).Scan(&username, &emailEnc)
	if err != nil {
		jsonOK(w, map[string]string{"status": "sent"})
		return
	}
	if h.mailer == nil {
		jsonError(w, "email chưa được cấu hình", http.StatusServiceUnavailable)
		return
	}
	emailPlain, err := h.enc.Decrypt(emailEnc)
	if err != nil {
		jsonOK(w, map[string]string{"status": "sent"})
		return
	}
	html := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:400px;margin:40px auto;background:#0B1724;color:#EAF4FF;padding:32px;border-radius:16px;border:1px solid #1B2F43">
  <h2 style="color:#20C7B3;margin:0 0 8px">🌊 Veyluro</h2>
  <p style="color:#64748B;margin:0 0 24px;font-size:13px">Khôi phục tên người dùng</p>
  <p style="margin:0 0 16px">Tên người dùng của bạn:</p>
  <div style="background:#133149;border-radius:12px;padding:20px;text-align:center;font-size:24px;font-weight:700;color:#20C7B3">%s</div>
  <p style="color:#64748B;font-size:12px;margin:16px 0 0">Nếu bạn không yêu cầu, bỏ qua email này.</p>
</div>`, username)
	if err := h.mailer.Send(emailPlain, "Tên người dùng Veyluro của bạn", html); err != nil {
		log.Printf("ERROR forgotUsername to %s: %v", emailPlain, err)
		jsonError(w, "không gửi được email, thử lại sau", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{"status": "sent"})
}

// ── OTP helper ─────────────────────────────────────────────────────────────

func genOTP() string {
	const digits = "0123456789"
	otp := make([]byte, 6)
	for i := range otp {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		otp[i] = digits[n.Int64()]
	}
	return string(otp)
}

func verifyUserTOTP(code, secret string) bool {
	if strings.TrimSpace(secret) == "" {
		return false
	}
	return totp.Validate(strings.TrimSpace(code), secret)
}

func randomURLToken(size int) string {
	if size <= 0 {
		size = 32
	}
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return uuid.NewString()
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (h *Handler) storeOAuthState(state string, expires int64) {
	now := time.Now().Unix()
	h.oauthStateMu.Lock()
	defer h.oauthStateMu.Unlock()
	for k, exp := range h.oauthStateStore {
		if exp <= now {
			delete(h.oauthStateStore, k)
		}
	}
	h.oauthStateStore[state] = expires
}

func (h *Handler) consumeOAuthState(state string) bool {
	now := time.Now().Unix()
	h.oauthStateMu.Lock()
	defer h.oauthStateMu.Unlock()
	exp, ok := h.oauthStateStore[state]
	if !ok {
		return false
	}
	delete(h.oauthStateStore, state)
	return exp > now
}

func (h *Handler) storeOAuthCode(code string, payload oauthExchangePayload) {
	now := time.Now().Unix()
	h.oauthCodeMu.Lock()
	defer h.oauthCodeMu.Unlock()
	for k, p := range h.oauthCodeStore {
		if p.Expires <= now {
			delete(h.oauthCodeStore, k)
		}
	}
	h.oauthCodeStore[code] = payload
}

func (h *Handler) consumeOAuthCode(code string) (oauthExchangePayload, bool) {
	now := time.Now().Unix()
	h.oauthCodeMu.Lock()
	defer h.oauthCodeMu.Unlock()
	payload, ok := h.oauthCodeStore[code]
	if !ok {
		return oauthExchangePayload{}, false
	}
	delete(h.oauthCodeStore, code)
	if payload.Expires <= now {
		return oauthExchangePayload{}, false
	}
	return payload, true
}

func isHTTPSRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}
