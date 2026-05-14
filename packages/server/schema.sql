-- ─────────────────────────────────────────────────────────────────────────────
-- schema.sql — AMoon Eclipse · Cloudflare D1
-- Chạy: wrangler d1 execute amoon-eclipse-db --file=./schema.sql
--
-- Bảo mật:
--   - email_enc: AES-256-GCM encrypted (key = DB_ENCRYPTION_KEY secret)
--   - email_token: HMAC-SHA256 của email (để lookup, key = DB_HMAC_KEY secret)
--   - password_hash: Argon2id hash (client hash trước khi gửi lên)
--   - username: plaintext (public display name)
--   - private key: KHÔNG bao giờ lên server (lưu SecureStore / IndexedDB)
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                     -- nanoid / UUID
  username        TEXT UNIQUE NOT NULL,                 -- public, plaintext
  public_key      TEXT,                                 -- Base64 SPKI RSA-2048
  fingerprint     TEXT,                                 -- SHA-256 của public_key
  signal_bundle   TEXT,                                 -- JSON pre-key bundle cho Signal protocol

  -- Password-based auth (NULL nếu dùng OAuth)
  password_hash   TEXT,                                 -- Argon2id encoded string (client hashed)

  -- OAuth
  oauth_provider  TEXT,                                 -- 'google' | 'facebook'
  oauth_id        TEXT,                                 -- provider's user ID (plaintext — không phải PII)
  token_version   INTEGER NOT NULL DEFAULT 0,           -- revoke JWT cũ khi security event

  -- PII — mã hóa AES-256-GCM
  email_enc       TEXT,                                 -- AES-GCM encrypted email
  email_token     TEXT,                                 -- HMAC-SHA256 của email (dùng để lookup)

  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index tìm theo OAuth
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
  ON users(oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL;

-- Index tìm theo email (dùng token thay vì plaintext)
CREATE INDEX IF NOT EXISTS idx_users_email_token ON users(email_token)
  WHERE email_token IS NOT NULL;

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('dm', 'group')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Room membership
CREATE TABLE IF NOT EXISTS room_members (
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (room_id, user_id)
);

-- Messages — server zero-knowledge (bundle opaque)
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id  TEXT NOT NULL REFERENCES users(id),
  bundle     TEXT NOT NULL,                             -- MessageBundle JSON (E2EE ciphertext)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Notes 24h — public (không E2EE, giống Messenger note)
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,                             -- plaintext, max 200 chars
  expires_at INTEGER NOT NULL,                          -- unixepoch + 86400
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_expires ON notes(expires_at);
