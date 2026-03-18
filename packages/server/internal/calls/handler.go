package calls

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const cfTURNAPI = "https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate"

type Handler struct {
	tokenID  string
	apiToken string
	client   *http.Client
}

func NewHandler(tokenID, apiToken string) *Handler {
	return &Handler{
		tokenID:  tokenID,
		apiToken: apiToken,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

type turnRequest struct {
	TTL int `json:"ttl"`
}

type TURNCredentials struct {
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
	URLs       []string `json:"urls"`
}

type turnResponse struct {
	IceServers TURNCredentials `json:"iceServers"`
}

func (h *Handler) GetTURNCredentials(w http.ResponseWriter, r *http.Request) {
	if h.tokenID == "" || h.apiToken == "" {
		// Fallback: Google STUN only
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"iceServers": []map[string]any{
				{"urls": []string{"stun:stun.l.google.com:19302"}},
			},
		})
		return
	}

	body, _ := json.Marshal(turnRequest{TTL: 86400}) // 24h
	req, err := http.NewRequestWithContext(r.Context(), "POST",
		fmt.Sprintf(cfTURNAPI, h.tokenID), bytes.NewReader(body))
	if err != nil {
		http.Error(w, "failed to create request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+h.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, "cloudflare error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var cfResp turnResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		http.Error(w, "parse error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"iceServers": []map[string]any{
			{"urls": []string{"stun:stun.l.google.com:19302"}},
			{
				"urls":       cfResp.IceServers.URLs,
				"username":   cfResp.IceServers.Username,
				"credential": cfResp.IceServers.Credential,
			},
		},
	})
}
