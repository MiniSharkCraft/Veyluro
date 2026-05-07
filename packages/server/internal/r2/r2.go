package r2

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

type Config struct {
	AccountID       string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	PublicBaseURL   string
}

type Client struct {
	accountID       string
	accessKeyID     string
	secretAccessKey string
	bucket          string
	publicBaseURL   string
	endpoint        string
	httpClient      *http.Client
}

func New(cfg Config) *Client {
	if cfg.AccountID == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" || cfg.Bucket == "" {
		return nil
	}
	return &Client{
		accountID:       cfg.AccountID,
		accessKeyID:     cfg.AccessKeyID,
		secretAccessKey: cfg.SecretAccessKey,
		bucket:          cfg.Bucket,
		publicBaseURL:   strings.TrimRight(cfg.PublicBaseURL, "/"),
		endpoint:        "https://" + cfg.AccountID + ".r2.cloudflarestorage.com",
		httpClient:      &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) PutObject(ctx context.Context, key, contentType string, body []byte) (string, error) {
	if c == nil {
		return "", fmt.Errorf("r2 chưa cấu hình")
	}
	req, err := c.signedRequest(ctx, http.MethodPut, key, contentType, body)
	if err != nil {
		return "", err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return "", fmt.Errorf("r2 upload failed: %s %s", res.Status, strings.TrimSpace(string(msg)))
	}
	return c.PublicURL(key), nil
}

func (c *Client) DeleteObject(ctx context.Context, key string) error {
	if c == nil || key == "" {
		return nil
	}
	req, err := c.signedRequest(ctx, http.MethodDelete, key, "", nil)
	if err != nil {
		return err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("r2 delete failed: %s %s", res.Status, strings.TrimSpace(string(msg)))
	}
	return nil
}

func (c *Client) PublicURL(key string) string {
	if c.publicBaseURL != "" {
		return c.publicBaseURL + "/" + escapeKeyPath(key)
	}
	return c.endpoint + "/" + url.PathEscape(c.bucket) + "/" + escapeKeyPath(key)
}

func (c *Client) TransformURL(key string, width, height int) string {
	if c == nil || key == "" {
		return ""
	}
	if c.publicBaseURL == "" || width <= 0 || height <= 0 {
		return c.PublicURL(key)
	}
	opts := fmt.Sprintf("width=%d,height=%d,fit=cover,quality=82,format=auto", width, height)
	return c.publicBaseURL + "/cdn-cgi/image/" + opts + "/" + escapeKeyPath(key)
}

func (c *Client) signedRequest(ctx context.Context, method, key, contentType string, body []byte) (*http.Request, error) {
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	uriPath := "/" + url.PathEscape(c.bucket) + "/" + escapeKeyPath(key)
	reqURL := c.endpoint + uriPath

	payloadHashBytes := sha256.Sum256(body)
	payloadHash := hex.EncodeToString(payloadHashBytes[:])
	host := c.accountID + ".r2.cloudflarestorage.com"

	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := "host:" + host + "\n" +
		"x-amz-content-sha256:" + payloadHash + "\n" +
		"x-amz-date:" + amzDate + "\n"
	if contentType != "" {
		signedHeaders = "content-type;" + signedHeaders
		canonicalHeaders = "content-type:" + contentType + "\n" + canonicalHeaders
	}

	canonicalRequest := strings.Join([]string{
		method,
		uriPath,
		"",
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := dateStamp + "/auto/s3/aws4_request"
	canonicalHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(canonicalHash[:]),
	}, "\n")
	signature := hex.EncodeToString(hmacSHA256(signingKey(c.secretAccessKey, dateStamp), []byte(stringToSign)))

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+c.accessKeyID+"/"+scope+", SignedHeaders="+signedHeaders+", Signature="+signature)
	return req, nil
}

func signingKey(secret, dateStamp string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte("auto"))
	kService := hmacSHA256(kRegion, []byte("s3"))
	return hmacSHA256(kService, []byte("aws4_request"))
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func escapeKeyPath(key string) string {
	key = path.Clean("/" + key)
	key = strings.TrimPrefix(key, "/")
	parts := strings.Split(key, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}
