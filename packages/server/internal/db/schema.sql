-- AMoon Eclipse — MariaDB schema
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36) PRIMARY KEY,
    username        VARCHAR(64) UNIQUE NOT NULL,
    public_key      TEXT,
    fingerprint     VARCHAR(128),
    password_hash   TEXT,
    oauth_provider  VARCHAR(32),
    oauth_id        VARCHAR(128),
    email_enc       TEXT,
    email_token     VARCHAR(128),
    encrypted_key   TEXT,
    key_salt        TEXT,
    reset_token     TEXT,
    reset_expires   BIGINT,
    totp_secret     TEXT,
    totp_enabled    TINYINT DEFAULT 0,
    display_name    VARCHAR(128),
    bio             TEXT,
    avatar_url      TEXT,
    avatar_key      TEXT,
    is_admin        TINYINT DEFAULT 0,
    created_at      BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN avatar_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth       ON users(oauth_provider, oauth_id);
CREATE INDEX        IF NOT EXISTS idx_users_email_token ON users(email_token);

CREATE TABLE IF NOT EXISTS rooms (
    id             VARCHAR(36) PRIMARY KEY,
    name           VARCHAR(256) NOT NULL,
    type           ENUM('dm','group') NOT NULL,
    group_admin_id VARCHAR(36),
    avatar_url     TEXT,
    avatar_key     TEXT,
    created_at     BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE rooms ADD COLUMN avatar_url TEXT;
ALTER TABLE rooms ADD COLUMN avatar_key TEXT;

CREATE TABLE IF NOT EXISTS room_members (
    room_id   VARCHAR(36) NOT NULL,
    user_id   VARCHAR(36) NOT NULL,
    joined_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)  ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
    id         VARCHAR(36) PRIMARY KEY,
    room_id    VARCHAR(36) NOT NULL,
    sender_id  VARCHAR(36) NOT NULL,
    bundle     MEDIUMTEXT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (room_id)   REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notes (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL,
    content    TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invite_links (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL,
    token      VARCHAR(128) UNIQUE NOT NULL,
    uses       INT DEFAULT 0,
    created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pending_messages (
    id           VARCHAR(36) PRIMARY KEY,
    from_user_id VARCHAR(36) NOT NULL,
    to_user_id   VARCHAR(36) NOT NULL,
    bundle       MEDIUMTEXT NOT NULL,
    created_at   BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friends (
    id         VARCHAR(36) PRIMARY KEY,
    from_id    VARCHAR(36) NOT NULL,
    to_id      VARCHAR(36) NOT NULL,
    status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    UNIQUE KEY uq_friends (from_id, to_id),
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
    id          VARCHAR(36) PRIMARY KEY,
    reporter_id VARCHAR(36) NOT NULL,
    reported_id VARCHAR(36) NOT NULL,
    reason      VARCHAR(64) NOT NULL,
    detail      TEXT,
    status      VARCHAR(16) NOT NULL DEFAULT 'pending',
    admin_note  TEXT,
    created_at  BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_bans (
    id             VARCHAR(36) PRIMARY KEY,
    user_id        VARCHAR(36) UNIQUE NOT NULL,
    ban_count      INT NOT NULL DEFAULT 1,
    banned_until   BIGINT NOT NULL,
    last_violation BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    created_at     BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS harassment_tracking (
    id          VARCHAR(36) PRIMARY KEY,
    sender_id   VARCHAR(36) NOT NULL,
    receiver_id VARCHAR(36) NOT NULL,
    msg_count   INT NOT NULL DEFAULT 1,
    last_msg_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    UNIQUE KEY uq_harassment (sender_id, receiver_id),
    FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id VARCHAR(36) NOT NULL,
    blocked_id VARCHAR(36) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_messages_room   ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_room_members    ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_expires   ON notes(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_to_user ON pending_messages(to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status  ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_token    ON invite_links(token);
CREATE INDEX IF NOT EXISTS idx_user_blocks     ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_friends_to      ON friends(to_id, status);
CREATE INDEX IF NOT EXISTS idx_friends_from    ON friends(from_id, status);

SET FOREIGN_KEY_CHECKS = 1;
