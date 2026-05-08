package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// loadDotEnv đọc file .env trong working directory và set các biến chưa có.
// Format: KEY=VALUE (bỏ qua dòng trống và comment #)
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // không có file .env thì bỏ qua
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		// Strip inline comment
		if ci := strings.Index(val, " #"); ci >= 0 {
			val = strings.TrimSpace(val[:ci])
		}
		// Strip surrounding quotes
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		// Chỉ set nếu chưa có (env var thật được ưu tiên hơn .env)
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

type Config struct {
	Port               string
	DBDSN              string // MySQL/MariaDB DSN
	JWTSecret          string
	DBEncryptionKey    string // 64-char hex = 32 bytes, AES-256-GCM cho PII
	DBHmacKey          string // 64-char hex = 32 bytes, HMAC-SHA256 email token
	AllowedOrigins     []string
	Env                string
	HMACSigningKey     string   // JS request signing key (matches secureRequest.ts SIG_KEY)
	ExpectedAppSums    []string // Valid X-App-Sum values for release APK/IPA
	GoogleClientID     string   // Web client ID
	GoogleClientSecret string   // Web client secret
	GoogleRedirectURI  string   // OAuth redirect URI
	OAuthAppRedirect   string   // Deep-link URI về app, vd: amoon-eclipse://auth
	CFTurnTokenID      string   // Cloudflare TURN token ID
	CFTurnAPIToken     string   // Cloudflare TURN API token
	R2AccountID        string   // Cloudflare R2 account ID
	R2AccessKeyID      string   // Cloudflare R2 S3 access key
	R2SecretAccessKey  string   // Cloudflare R2 S3 secret
	R2Bucket           string   // Bucket name
	R2PublicBaseURL    string   // Public/custom domain base URL for objects
	R2WarnBytes        int64    // soft warning threshold for bucket usage
	R2BlockBytes       int64    // hard block threshold for new uploads
	R2UsageSeedBytes   int64    // bootstrap estimated usage bytes (manual from dashboard)
	RedisURL           string   // redis://user:pass@host:6379/0
	RedisPrefix        string   // key prefix for distributed rate limit
	FacebookAppID      string   // App ID để verify token
	SMTPHost           string   // VD: mail.yourdomain.com
	SMTPPort           string   // 587 hoặc 465
	SMTPUser           string   // địa chỉ email đầy đủ
	SMTPPass           string   // mật khẩu email
	EmailFrom          string   // VD: AMoon Eclipse <noreply@yourdomain.com>
}

func Load() *Config {
	loadDotEnv(".env")
	origins := strings.Split(getEnv("ALLOWED_ORIGINS", "*"), ",")
	return &Config{
		Port:               getEnv("PORT", getEnv("P_SERVER_PORT", "8080")),
		DBDSN:              mustEnv("DB_DSN"),
		JWTSecret:          mustEnv("JWT_SECRET"),
		DBEncryptionKey:    mustEnv("DB_ENCRYPTION_KEY"),
		DBHmacKey:          mustEnv("DB_HMAC_KEY"),
		AllowedOrigins:     origins,
		Env:                getEnv("ENV", "production"),
		HMACSigningKey:     getEnv("HMAC_SIGNING_KEY", ""),
		ExpectedAppSums:    splitCSV(getEnv("EXPECTED_APP_SUMS", "")),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:  getEnv("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback"),
		OAuthAppRedirect:   getEnv("OAUTH_APP_REDIRECT", "amoon-eclipse://auth"),
		CFTurnTokenID:      getEnv("CF_TURN_TOKEN_ID", ""),
		CFTurnAPIToken:     getEnv("CF_TURN_API_TOKEN", ""),
		R2AccountID:        getEnv("R2_ACCOUNT_ID", ""),
		R2AccessKeyID:      getEnv("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey:  getEnv("R2_SECRET_ACCESS_KEY", ""),
		R2Bucket:           getEnv("R2_BUCKET", ""),
		R2PublicBaseURL:    strings.TrimRight(getEnv("R2_PUBLIC_BASE_URL", ""), "/"),
		R2WarnBytes:        getEnvInt64("R2_WARN_BYTES", 6*1024*1024*1024),
		R2BlockBytes:       getEnvInt64("R2_BLOCK_BYTES", 7*1024*1024*1024),
		R2UsageSeedBytes:   getEnvInt64("R2_USAGE_SEED_BYTES", 0),
		RedisURL:           getEnv("REDIS_URL", ""),
		RedisPrefix:        getEnv("REDIS_PREFIX", "amoon"),
		FacebookAppID:      getEnv("FACEBOOK_APP_ID", ""),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           getEnv("SMTP_PORT", "587"),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		EmailFrom:          getEnv("EMAIL_FROM", "AMoon Eclipse <noreply@amoon-eclipse.app>"),
	}
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("biến môi trường bắt buộc chưa set: " + key)
	}
	return v
}
