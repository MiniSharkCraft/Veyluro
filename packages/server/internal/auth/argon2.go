package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Params Argon2id — OWASP recommended cho 2024
const (
	argonTime    = 2
	argonMemory  = 64 * 1024 // 64MB
	argonThreads = 2
	argonKeyLen  = 32
	argonSaltLen = 16
)

// HashArgon2id tạo encoded string format: $argon2id$v=19$m=...,t=...,p=...$salt$hash
func HashArgon2id(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads, b64Salt, b64Hash,
	)
	return encoded, nil
}

// VerifyArgon2id kiểm tra password với encoded hash
func VerifyArgon2id(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// $argon2id$v=19$m=65536,t=2,p=2$salt$hash => 6 parts (index 0 empty)
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("invalid argon2 hash format")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, err
	}

	var memory uint32
	var time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	hash := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(expectedHash)))
	return subtle.ConstantTimeCompare(hash, expectedHash) == 1, nil
}
