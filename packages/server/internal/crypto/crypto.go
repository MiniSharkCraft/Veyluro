package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// FieldEncryptor mã hóa/giải mã field PII trong DB bằng AES-256-GCM
type FieldEncryptor struct {
	key []byte
}

func NewFieldEncryptor(hexKey string) (*FieldEncryptor, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil || len(key) != 32 {
		return nil, errors.New("DB_ENCRYPTION_KEY phải là 64-char hex (32 bytes)")
	}
	return &FieldEncryptor{key: key}, nil
}

// Encrypt trả về hex(nonce || ciphertext)
func (e *FieldEncryptor) Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt nhận hex(nonce || ciphertext), trả về plaintext
func (e *FieldEncryptor) Decrypt(hexCiphertext string) (string, error) {
	data, err := hex.DecodeString(hexCiphertext)
	if err != nil {
		return "", fmt.Errorf("invalid hex: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext quá ngắn")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt thất bại: %w", err)
	}
	return string(plain), nil
}

// HmacTokener tạo HMAC-SHA256 search token cho email (deterministic)
type HmacTokener struct {
	key []byte
}

func NewHmacTokener(hexKey string) (*HmacTokener, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil || len(key) != 32 {
		return nil, errors.New("DB_HMAC_KEY phải là 64-char hex (32 bytes)")
	}
	return &HmacTokener{key: key}, nil
}

// Token trả về hex HMAC-SHA256 của value
func (h *HmacTokener) Token(value string) string {
	mac := hmac.New(sha256.New, h.key)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
