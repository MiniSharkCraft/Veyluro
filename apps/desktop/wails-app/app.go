package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Google OAuth credentials — set via environment variables or ldflags at build time.
// See desktop/.env.example for setup instructions.
var (
	googleClientID     = getEnv("GOOGLE_CLIENT_ID", "")
	googleClientSecret = getEnv("GOOGLE_CLIENT_SECRET", "")
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type App struct {
	ctx context.Context
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) AppName() string { return "AMoon Eclipse" }

// StartGoogleOAuth starts the Google OAuth 2.0 Authorization Code + PKCE flow.
// Opens the system browser, starts a local callback server, exchanges the code
// for an access token, then emits "oauth:google" with the token to the frontend.
func (a *App) StartGoogleOAuth() error {
	// ── PKCE ────────────────────────────────────────────────────────────────
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return fmt.Errorf("rand error: %w", err)
	}
	codeVerifier := base64.RawURLEncoding.EncodeToString(verifierBytes)

	h := sha256.New()
	h.Write([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	// ── Random state ─────────────────────────────────────────────────────────
	stateBytes := make([]byte, 16)
	rand.Read(stateBytes)
	state := base64.RawURLEncoding.EncodeToString(stateBytes)

	// ── Local callback server on random port ──────────────────────────────────
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("cannot start local server: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	redirectURI := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

	done := make(chan struct{})

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("state") != state {
			http.Error(w, "invalid state", http.StatusBadRequest)
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "missing code", http.StatusBadRequest)
			return
		}

		// Exchange code for token
		token, err := exchangeCode(code, redirectURI, codeVerifier)
		if err != nil {
			fmt.Fprintf(w, "<h2>Auth error: %v</h2>", err)
			runtime.EventsEmit(a.ctx, "oauth:error", err.Error())
		} else {
			fmt.Fprint(w, `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#050508;color:#00FFFF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
				<div style="text-align:center"><h2>✓ Authenticated</h2><p>Return to AMoon Eclipse.</p></div>
			</body></html>`)
			runtime.EventsEmit(a.ctx, "oauth:google", token)
		}

		close(done)
	})

	server := &http.Server{Handler: mux}
	go server.Serve(listener) //nolint:errcheck

	go func() {
		select {
		case <-done:
		case <-time.After(5 * time.Minute):
		}
		server.Close()
	}()

	// ── Build auth URL ────────────────────────────────────────────────────────
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + url.Values{
		"client_id":             {googleClientID},
		"redirect_uri":          {redirectURI},
		"response_type":         {"code"},
		"scope":                 {"openid profile email"},
		"state":                 {state},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
		"access_type":           {"offline"},
	}.Encode()

	runtime.BrowserOpenURL(a.ctx, authURL)
	return nil
}

// exchangeCode exchanges an authorization code for an access token.
func exchangeCode(code, redirectURI, codeVerifier string) (string, error) {
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {code},
		"client_id":     {googleClientID},
		"client_secret": {googleClientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
		"code_verifier": {codeVerifier},
	})
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse error: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("%s: %s", result.Error, result.ErrorDesc)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("empty access token")
	}
	return result.AccessToken, nil
}

// ExchangeGoogleToken sends the Google access token to the backend.
func (a *App) ExchangeGoogleToken(apiBase, accessToken string) (string, error) {
	body := fmt.Sprintf(`{"provider":"google","accessToken":"%s"}`, accessToken)
	resp, err := http.Post(apiBase+"/api/auth/oauth", "application/json", strings.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		var e struct{ Error string `json:"error"` }
		json.Unmarshal(raw, &e)
		return "", fmt.Errorf("%s", e.Error)
	}
	return string(raw), nil
}
